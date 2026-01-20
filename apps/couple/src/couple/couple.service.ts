import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Couple } from './entity/couple.entity';
import { Repository, DataSource } from 'typeorm';
import { lastValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { ClientProxy } from '@nestjs/microservices';
import { CHAT_SERVICE, NOTIFICATION_SERVICE, USER_SERVICE } from '@app/common';
import { ConnectCoupleDto } from './dto/connect-couple.dto';
import { Anniversary } from './anniversary/entity/anniversary.entity';
import { Plan } from './plan/entity/plan.entity';
import { Calendar } from './calendar/entity/calendar.entity';

@Injectable()
export class CoupleService {
  private readonly logger = new Logger(CoupleService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(USER_SERVICE)
    private readonly userService: ClientProxy,
    @Inject(CHAT_SERVICE)
    private readonly chatService: ClientProxy,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notificationService: ClientProxy,
    @InjectRepository(Couple)
    private readonly coupleRepository: Repository<Couple>,
  ) {}

  async connectCouple(createCoupleDto: ConnectCoupleDto) {
    const { partnerId, isConnect, meta } = createCoupleDto;
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    // 보상 트랜잭션 추적
    let chatRoomCreated = false;
    let coupleId: string | null = null;

    try {
      // 1) 본인 정보 가져오기
      const me = await this.getUserById(meta.user.sub);

      // 2) 파트너 정보 가져오기
      const partner = await this.getUserById(partnerId);

      // 3) 커플 상태 체크 및 기존 데이터 확인
      await this.validateCoupleStatus(me.id, partner.id, isConnect);

      if (isConnect) {
        // Step 1: 커플 생성 (Local)
        const couple = queryRunner.manager.create(Couple, {
          user1Id: me.id,
          user2Id: partner.id,
        });
        await queryRunner.manager.save(couple);
        coupleId = couple.id;
        this.logger.log(`[TX:COUPLE_CONNECT] Step 1 완료 - Couple 생성 (${coupleId})`);

        // Step 2: 채팅방 생성 (Remote - 재시도 포함)
        const chatRoomResult = await this.createChatRoomWithRetry(
          me.id,
          partner.id,
          couple.id,
        );

        if (!chatRoomResult.success) {
          throw new Error('ChatRoom 생성 실패');
        }
        chatRoomCreated = true;
        this.logger.log(`[TX:COUPLE_CONNECT] Step 2 완료 - ChatRoom 생성 (${coupleId})`);

        // Step 3: 알림 전송 (실패해도 진행)
        await this.sendNotificationWithFallback(me.id, true);
        await this.sendNotificationWithFallback(partner.id, true);
        this.logger.log(`[TX:COUPLE_CONNECT] Step 3 완료 - 알림 전송`);
      } else {
        coupleId = await this.getCoupleByUserId(me.id);
        this.logger.log(`[TX:COUPLE_DISCONNECT] 시작 (${coupleId})`);

        // Step 1: ChatRoom 삭제 (send로 결과 확인)
        const deleteChatResult = await this.deleteChatroomAndChatsWithConfirm(
          coupleId,
          me.id,
          partner.id,
        );

        if (!deleteChatResult.success) {
          throw new Error('ChatRoom 삭제 실패');
        }
        this.logger.log(`[TX:COUPLE_DISCONNECT] Step 1 완료 - ChatRoom 삭제 (${coupleId})`);

        // Step 2: 로컬 데이터 삭제
        await queryRunner.manager.delete(Anniversary, { coupleId });
        await queryRunner.manager.delete(Plan, { coupleId });
        await queryRunner.manager.delete(Calendar, { coupleId });
        await queryRunner.manager.delete(Couple, { id: coupleId });
        this.logger.log(`[TX:COUPLE_DISCONNECT] Step 2 완료 - 로컬 데이터 삭제 (${coupleId})`);

        // Step 3: 알림 전송 (실패해도 진행)
        await this.sendNotificationWithFallback(me.id, false);
        await this.sendNotificationWithFallback(partner.id, false);
        this.logger.log(`[TX:COUPLE_DISCONNECT] Step 3 완료 - 알림 전송`);
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: isConnect
          ? '커플이 연결 되었습니다.'
          : '커플 연결이 해제되었습니다.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // 보상 트랜잭션: ChatRoom이 생성됐으면 삭제
      if (chatRoomCreated && coupleId) {
        await this.compensateDeleteChatRoom(coupleId);
      }

      this.logger.error(
        `[TX:COUPLE_${isConnect ? 'CONNECT' : 'DISCONNECT'}] 실패`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async getUserById(userId: string) {
    const resp = await lastValueFrom(
      this.userService.send({ cmd: 'get_user_info' }, { userId }),
    );

    if (!resp || !resp.data) {
      throw new NotFoundException('해당 파트너를 찾을 수 없습니다.');
    }

    return resp.data;
  }

  private async validateCoupleStatus(
    user1Id: string,
    user2Id: string,
    isConnect: boolean,
  ) {
    const existingCouple = await this.coupleRepository
      .createQueryBuilder('couple')
      .where(
        'couple.user1Id IN (:user1Id, :user2Id) OR couple.user2Id IN (:user1Id, :user2Id)',
        { user1Id, user2Id },
      )
      .getOne();

    if (isConnect && existingCouple) {
      throw new ConflictException('이미 커플 관계가 존재합니다.');
    }

    if (!isConnect && !existingCouple) {
      throw new ConflictException('커플 관계가 존재하지 않습니다.');
    }
  }

  private async createChatRoomWithRetry(
    user1Id: string,
    user2Id: string,
    coupleId: string,
    maxRetries = 3,
  ): Promise<{ success: boolean; data?: any }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const resp = await lastValueFrom(
          this.chatService
            .send({ cmd: 'create_chat_room' }, { user1Id, user2Id, coupleId })
            .pipe(timeout(5000)),
        );

        if (resp?.data) {
          return { success: true, data: resp.data };
        }
      } catch (error) {
        this.logger.warn(
          `[TX:COUPLE_CONNECT] Step 2 재시도 ${attempt}/${maxRetries} - ChatRoom 생성: ${error.message}`,
        );
        if (attempt === maxRetries) {
          return { success: false };
        }
        await this.delay(1000 * attempt);
      }
    }
    return { success: false };
  }

  private async deleteChatroomAndChatsWithConfirm(
    coupleId: string,
    user1Id: string,
    user2Id: string,
  ): Promise<{ success: boolean }> {
    try {
      const resp = await lastValueFrom(
        this.chatService
          .send(
            { cmd: 'delete_chatroom_and_chats' },
            { coupleId, user1Id, user2Id },
          )
          .pipe(timeout(10000)),
      );

      return { success: resp?.status === 'success' };
    } catch (error) {
      this.logger.error('[TX:COUPLE_DISCONNECT] ChatRoom 삭제 실패', error.stack);
      return { success: false };
    }
  }

  private async compensateDeleteChatRoom(coupleId: string): Promise<void> {
    try {
      await lastValueFrom(
        this.chatService
          .send({ cmd: 'delete_chatroom_by_couple_id' }, { coupleId })
          .pipe(timeout(5000)),
      );
      this.logger.log(`[TX:COMPENSATE] ChatRoom 삭제 성공 (${coupleId})`);
    } catch (error) {
      this.logger.error(`[TX:COMPENSATE] ChatRoom 삭제 실패`, {
        coupleId,
        error: error.message,
        needsManualIntervention: true,
      });
    }
  }

  private async sendNotificationWithFallback(
    userId: string,
    isConnect: boolean,
  ): Promise<void> {
    try {
      const resp = await lastValueFrom(
        this.notificationService
          .send({ cmd: 'matched_notification' }, { userId, isConnect })
          .pipe(timeout(3000)),
      );

      if (!resp?.success) {
        throw new Error('알림 전송 실패');
      }
    } catch (error) {
      // 알림 실패는 핵심 로직이 아니므로 로깅만
      this.logger.warn(`[TX:NOTIFICATION] 알림 전송 실패 (userId: ${userId}): ${error.message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getCoupleByUserId(userId: string): Promise<string | null> {
    const couple = await this.coupleRepository.findOne({
      where: [{ user1Id: userId }, { user2Id: userId }],
    });

    return couple ? couple.id : null;
  }
}
