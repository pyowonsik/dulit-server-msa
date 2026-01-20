# 보상 트랜잭션 구현 계획

**날짜**: 2026-01-20
**작성자**: Claude
**관련 연구 문서**: thoughts/shared/research/dulit-server-msa_compensating-transaction_2026-01-20.md

---

## 1. 요구사항

### 기능 개요

MSA 환경에서 분산 트랜잭션의 데이터 정합성을 보장하기 위해 보상 트랜잭션(Compensating Transaction) 패턴을 적용합니다. 현재 `emit()` (Fire-and-Forget) 패턴으로 인한 데이터 불일치 문제와 파일 처리 중 발생하는 고아 데이터/파일 문제를 해결합니다.

### 목표

- 커플 연결/해제 시 Couple ↔ ChatRoom 간 데이터 정합성 보장
- 원격 서비스 호출 결과 확인 (`emit()` → `send()`)
- 파일 업로드/수정/삭제 시 고아 파일 방지
- 실패 시 보상 트랜잭션으로 롤백

### 성공 기준

- [ ] 커플 연결 실패 시 ChatRoom 자동 롤백
- [ ] 커플 해제 시 ChatRoom 삭제 결과 확인
- [ ] 알림 전송 실패 감지 및 로깅
- [ ] Post 생성/수정/삭제 시 파일 정합성 보장
- [ ] Calendar 생성/수정 시 파일 정합성 보장
- [ ] 모든 보상 트랜잭션 실패 시 로깅

---

## 2. 기술적 접근

### 아키텍처 선택

**Orchestration-based Saga Pattern**
- 각 서비스 메서드가 Saga Orchestrator 역할 수행
- 로컬 트랜잭션 + 원격 서비스 호출 순차 실행
- 실패 시 역순으로 보상 트랜잭션 실행

### 핵심 변경 사항

| 기존 | 변경 |
|------|------|
| `emit()` (Fire-and-Forget) | `send()` (Request-Response) |
| 파일 직접 삭제 | 백업 후 삭제, 실패 시 복원 |
| 단순 try-catch | 단계별 상태 추적 + 보상 트랜잭션 |

### 사용할 기술

- **rxjs**: `lastValueFrom`, `timeout` 연산자
- **TypeORM**: `QueryRunner`를 통한 로컬 트랜잭션
- **fs/promises**: 파일 이동 (`rename`)

### 파일 구조

```
apps/
├── couple/src/couple/
│   └── couple.service.ts           # Phase 1 수정
├── chat/src/chat/
│   ├── chat.service.ts             # Phase 1 수정
│   └── chat.controller.ts          # Phase 1 수정 (새 핸들러)
├── notification/src/notification/
│   ├── notification.service.ts     # Phase 2 수정
│   └── notification.controller.ts  # Phase 2 수정 (send 핸들러)
├── post/src/post/
│   └── post.service.ts             # Phase 3 수정
└── couple/src/couple/calendar/
    └── calendar.service.ts         # Phase 4 수정
```

---

## 3. 구현 단계

### Phase 1: 커플 연결/해제 보상 트랜잭션 (CRITICAL)

**목표**: Couple ↔ ChatRoom 간 데이터 정합성 보장

**작업 목록**:

#### 1.1 Chat 서비스 수정
- [ ] `apps/chat/src/chat/chat.service.ts`
  - `deleteChatroomAndChats()`: 응답 반환하도록 수정
  - `deleteChatroomByCoupleId()`: 새 메서드 추가 (보상용)
- [ ] `apps/chat/src/chat/chat.controller.ts`
  - `delete_chatroom_and_chats` 핸들러 응답 추가
  - `delete_chatroom_by_couple_id` 핸들러 추가

#### 1.2 Couple 서비스 수정
- [ ] `apps/couple/src/couple/couple.service.ts`
  - 보상 트랜잭션 추적 변수 추가
  - `createChatRoomWithRetry()`: 재시도 + 타임아웃 추가
  - `deleteChatroomAndChatsWithConfirm()`: `emit()` → `send()` 변경
  - `compensateDeleteChatRoom()`: 보상 트랜잭션 메서드 추가
  - `connectCouple()`: 커플 연결 로직 수정
  - `connectCouple()`: 커플 해제 로직 수정

**예상 영향**:
- 영향 받는 파일:
  - `apps/couple/src/couple/couple.service.ts`
  - `apps/chat/src/chat/chat.service.ts`
  - `apps/chat/src/chat/chat.controller.ts`
- 의존성: Chat 서비스 먼저 수정 필요

**검증 방법**:
- [ ] 커플 연결 성공 케이스 테스트
- [ ] ChatRoom 생성 실패 시 Couple 롤백 확인
- [ ] 커플 해제 시 ChatRoom 삭제 결과 확인
- [ ] 재시도 로직 동작 확인 (Chat 서비스 일시 중단 후 재시작)

**상세 코드 변경**:

```typescript
// apps/chat/src/chat/chat.service.ts

// 1. deleteChatroomAndChats - 응답 반환 추가
async deleteChatroomAndChats(dto: DeleteChatroomAndChatsDto) {
  const { coupleId, user1Id, user2Id } = dto;
  const userIds = [user1Id, user2Id];

  try {
    userIds.forEach((userId) => {
      const client = this.connectedClients.get(userId);
      if (client) {
        client.disconnect();
        this.removeClient(userId);
      }
    });

    await Promise.all([
      this.chatroomModel.findOneAndDelete({ coupleId }),
      this.chatModel.deleteMany({ userId: { $in: userIds } }),
    ]);

    return { status: 'success', message: 'ChatRoom 및 Chat 삭제 완료' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

// 2. deleteChatroomByCoupleId - 새 메서드 (보상용)
async deleteChatroomByCoupleId(coupleId: string) {
  try {
    const chatroom = await this.chatroomModel.findOne({ coupleId });

    if (chatroom) {
      const userIds = [chatroom.user1Id, chatroom.user2Id];

      userIds.forEach((userId) => {
        const client = this.connectedClients.get(userId);
        if (client) {
          client.disconnect();
          this.removeClient(userId);
        }
      });

      await Promise.all([
        this.chatroomModel.findOneAndDelete({ coupleId }),
        this.chatModel.deleteMany({ chatRoomId: chatroom._id }),
      ]);
    }

    return { status: 'success' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}
```

```typescript
// apps/couple/src/couple/couple.service.ts

import { timeout } from 'rxjs/operators';
import { Logger } from '@nestjs/common';

private readonly logger = new Logger(CoupleService.name);

async connectCouple(createCoupleDto: ConnectCoupleDto) {
  const { partnerId, isConnect, meta } = createCoupleDto;
  const queryRunner = this.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  // 보상 트랜잭션 추적
  let chatRoomCreated = false;
  let coupleId: string | null = null;

  try {
    const me = await this.getUserById(meta.user.sub);
    const partner = await this.getUserById(partnerId);
    await this.validateCoupleStatus(me.id, partner.id, isConnect);

    if (isConnect) {
      // Step 1: Couple 생성 (Local)
      const couple = queryRunner.manager.create(Couple, {
        user1Id: me.id,
        user2Id: partner.id,
      });
      await queryRunner.manager.save(couple);
      coupleId = couple.id;

      // Step 2: ChatRoom 생성 (Remote - 재시도 포함)
      const chatRoomResult = await this.createChatRoomWithRetry(
        me.id,
        partner.id,
        couple.id
      );

      if (!chatRoomResult.success) {
        throw new Error('ChatRoom 생성 실패');
      }
      chatRoomCreated = true;

      // Step 3: 알림 전송
      await this.sendNotificationWithFallback(me.id, true);
      await this.sendNotificationWithFallback(partner.id, true);

    } else {
      coupleId = await this.getCoupleByUserId(me.id);

      // Step 1: ChatRoom 삭제 (send로 변경)
      const deleteChatResult = await this.deleteChatroomAndChatsWithConfirm(
        coupleId,
        me.id,
        partner.id
      );

      if (!deleteChatResult.success) {
        throw new Error('ChatRoom 삭제 실패');
      }

      // Step 2: 로컬 데이터 삭제
      await queryRunner.manager.delete(Anniversary, { coupleId });
      await queryRunner.manager.delete(Plan, { coupleId });
      await queryRunner.manager.delete(Calendar, { coupleId });
      await queryRunner.manager.delete(Couple, { id: coupleId });

      // Step 3: 알림 전송
      await this.sendNotificationWithFallback(me.id, false);
      await this.sendNotificationWithFallback(partner.id, false);
    }

    await queryRunner.commitTransaction();

    return {
      success: true,
      message: isConnect ? '커플이 연결 되었습니다.' : '커플 연결이 해제되었습니다.',
    };

  } catch (error) {
    await queryRunner.rollbackTransaction();

    // 보상 트랜잭션
    if (chatRoomCreated && coupleId) {
      await this.compensateDeleteChatRoom(coupleId);
    }

    this.logger.error(`커플 ${isConnect ? '연결' : '해제'} 실패`, error);
    throw error;

  } finally {
    await queryRunner.release();
  }
}

private async createChatRoomWithRetry(
  user1Id: string,
  user2Id: string,
  coupleId: string,
  maxRetries = 3
): Promise<{ success: boolean; data?: any }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const resp = await lastValueFrom(
        this.chatService.send(
          { cmd: 'create_chat_room' },
          { user1Id, user2Id, coupleId }
        ).pipe(timeout(5000))
      );

      if (resp?.data) {
        return { success: true, data: resp.data };
      }
    } catch (error) {
      this.logger.warn(`ChatRoom 생성 시도 ${attempt}/${maxRetries} 실패`);
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
  user2Id: string
): Promise<{ success: boolean }> {
  try {
    const resp = await lastValueFrom(
      this.chatService.send(
        { cmd: 'delete_chatroom_and_chats' },
        { coupleId, user1Id, user2Id }
      ).pipe(timeout(10000))
    );

    return { success: resp?.status === 'success' };
  } catch (error) {
    this.logger.error('ChatRoom 삭제 실패', error);
    return { success: false };
  }
}

private async compensateDeleteChatRoom(coupleId: string): Promise<void> {
  try {
    await lastValueFrom(
      this.chatService.send(
        { cmd: 'delete_chatroom_by_couple_id' },
        { coupleId }
      ).pipe(timeout(5000))
    );
    this.logger.log(`보상 트랜잭션 성공: ChatRoom 삭제 (${coupleId})`);
  } catch (error) {
    this.logger.error(`보상 트랜잭션 실패: ChatRoom 삭제`, {
      coupleId,
      error: error.message,
      needsManualIntervention: true
    });
  }
}

private delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

### Phase 2: 알림 전송 emit → send 변경 (HIGH)

**목표**: 알림 전송 결과 확인 및 Fallback 처리

**작업 목록**:

#### 2.1 Notification 서비스 수정
- [ ] `apps/notification/src/notification/notification.service.ts`
  - `matchedNotification()`: 응답 반환 추가
- [ ] `apps/notification/src/notification/notification.controller.ts`
  - `@MessagePattern` 핸들러에서 응답 반환

#### 2.2 Couple 서비스 수정
- [ ] `apps/couple/src/couple/couple.service.ts`
  - `sendNotificationWithFallback()`: 새 메서드 추가
  - `createMatchedNotification()`: 제거 또는 `sendNotificationWithFallback()` 호출로 변경

**예상 영향**:
- 영향 받는 파일:
  - `apps/notification/src/notification/notification.service.ts`
  - `apps/notification/src/notification/notification.controller.ts`
  - `apps/couple/src/couple/couple.service.ts`
- 의존성: Phase 1 완료 필요

**검증 방법**:
- [ ] 알림 전송 성공 로깅 확인
- [ ] 알림 전송 실패 시 경고 로깅 확인
- [ ] 알림 실패해도 커플 연결/해제 성공 확인

**상세 코드 변경**:

```typescript
// apps/notification/src/notification/notification.service.ts

async matchedNotification(dto: CreateCoupleNotificationDto) {
  try {
    const client = this.connectedClients.get(dto.userId);

    if (client) {
      client.emit(
        'matchedNotification',
        dto.isConnect
          ? '커플이 연결 되었습니다.'
          : '커플 연결이 해제 되었습니다.',
      );

      if (!dto.isConnect) {
        client.disconnect();
        this.removeClient(dto.userId);
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

```typescript
// apps/couple/src/couple/couple.service.ts

private async sendNotificationWithFallback(
  userId: string,
  isConnect: boolean
): Promise<void> {
  try {
    const resp = await lastValueFrom(
      this.notificationService.send(
        { cmd: 'matched_notification' },
        { userId, isConnect }
      ).pipe(timeout(3000))
    );

    if (!resp?.success) {
      throw new Error('알림 전송 실패');
    }
  } catch (error) {
    // 알림 실패는 핵심 로직이 아니므로 로깅만
    this.logger.warn(`알림 전송 실패 (userId: ${userId})`, error);
  }
}
```

---

### Phase 3: Post 파일 처리 보상 트랜잭션 (HIGH)

**목표**: 파일 업로드/수정/삭제 시 데이터 정합성 보장

**작업 목록**:

#### 3.1 createPost 수정
- [ ] `apps/post/src/post/post.service.ts`
  - 이동된 파일 추적 변수 추가
  - 실패 시 파일 되돌리기 보상 트랜잭션

#### 3.2 updatePost 수정
- [ ] `apps/post/src/post/post.service.ts`
  - 백업 폴더 (`public/backup/post`) 사용
  - 기존 파일 백업 → 새 파일 이동 → DB 업데이트
  - 실패 시 백업 파일 복원
  - 성공 시 백업 파일 삭제

#### 3.3 deletePost 수정
- [ ] `apps/post/src/post/post.service.ts`
  - 파일 백업 → DB 삭제
  - 실패 시 백업 파일 복원
  - 성공 시 백업 파일 영구 삭제

**예상 영향**:
- 영향 받는 파일:
  - `apps/post/src/post/post.service.ts`
- 의존성: Phase 2 완료 권장 (독립 실행 가능)

**검증 방법**:
- [ ] Post 생성 중 DB 오류 시 파일 복구 확인
- [ ] Post 수정 중 실패 시 기존 파일 복원 확인
- [ ] Post 삭제 성공 시 파일도 삭제 확인
- [ ] Post 삭제 실패 시 파일 복원 확인

**상세 코드 변경**:

```typescript
// apps/post/src/post/post.service.ts

private readonly logger = new Logger(PostService.name);

async createPost(createPostDto: CreatePostDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  const movedFiles: string[] = [];
  const tempFolder = join('public', 'temp');
  const filesFolder = join('public', 'files/post');

  try {
    const { meta, title, description, filePaths } = createPostDto;
    const userId = meta.user.sub;

    if (filePaths && filePaths.length > 0) {
      if (!existsSync(filesFolder)) {
        mkdirSync(filesFolder, { recursive: true });
      }

      for (const file of filePaths) {
        await this.renameFiles(tempFolder, filesFolder, file);
        movedFiles.push(file);
      }
    }

    const post = queryRunner.manager.create(Post, {
      title,
      description,
      filePaths,
      authorId: userId,
    });

    await queryRunner.manager.save(post);
    await queryRunner.commitTransaction();

    return post;

  } catch (error) {
    await queryRunner.rollbackTransaction();

    // 보상: 파일 되돌리기
    for (const file of movedFiles) {
      try {
        await this.renameFiles(filesFolder, tempFolder, file);
        this.logger.log(`파일 복구 성공: ${file}`);
      } catch (fileError) {
        this.logger.error(`파일 복구 실패: ${file}`, fileError);
      }
    }

    throw error;

  } finally {
    await queryRunner.release();
  }
}

async updatePost(updatePostDto: UpdatePostDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  const tempFolder = join('public', 'temp');
  const filesFolder = join('public', 'files/post');
  const backupFolder = join('public', 'backup/post');

  const backedUpFiles: { original: string; backup: string }[] = [];
  const movedFiles: string[] = [];

  try {
    const { meta, title, description, filePaths, postId } = updatePostDto;

    const post = await queryRunner.manager.findOne(Post, {
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('존재하지 않는 POST의 ID 입니다.');
    }

    if (filePaths) {
      if (!existsSync(backupFolder)) {
        mkdirSync(backupFolder, { recursive: true });
      }

      // 기존 파일 백업
      if (post.filePaths) {
        for (const oldFile of post.filePaths) {
          const oldPath = join(filesFolder, oldFile);
          if (existsSync(oldPath)) {
            const backupName = `${Date.now()}_${oldFile}`;
            await rename(oldPath, join(backupFolder, backupName));
            backedUpFiles.push({ original: oldFile, backup: backupName });
          }
        }
      }

      // 새 파일 이동
      for (const file of filePaths) {
        await this.renameFiles(tempFolder, filesFolder, file);
        movedFiles.push(file);
      }
    }

    await queryRunner.manager.update(
      Post,
      { id: postId },
      { title, description, filePaths, authorId: meta.user.sub },
    );

    const updatedPost = await queryRunner.manager.findOne(Post, {
      where: { id: postId },
    });

    await queryRunner.commitTransaction();

    // 성공: 백업 파일 삭제 (비동기)
    this.cleanupBackupFiles(backupFolder, backedUpFiles).catch(e =>
      this.logger.warn('백업 정리 실패', e)
    );

    return updatedPost;

  } catch (error) {
    await queryRunner.rollbackTransaction();

    // 보상: 새 파일 되돌리기
    for (const file of movedFiles) {
      try {
        await this.renameFiles(filesFolder, tempFolder, file);
      } catch (e) {
        this.logger.error(`새 파일 복구 실패: ${file}`);
      }
    }

    // 보상: 백업 파일 복원
    for (const { original, backup } of backedUpFiles) {
      try {
        await rename(join(backupFolder, backup), join(filesFolder, original));
      } catch (e) {
        this.logger.error(`백업 복원 실패: ${original}`);
      }
    }

    throw error;

  } finally {
    await queryRunner.release();
  }
}

async deletePost(getPostDto: GetPostDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  const filesFolder = join('public', 'files/post');
  const backupFolder = join('public', 'backup/post');

  const backedUpFiles: { original: string; backup: string }[] = [];

  try {
    const { postId } = getPostDto;

    const post = await queryRunner.manager.findOne(Post, {
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('존재하지 않는 POST의 ID 입니다.');
    }

    // 파일 백업
    if (post.filePaths && post.filePaths.length > 0) {
      if (!existsSync(backupFolder)) {
        mkdirSync(backupFolder, { recursive: true });
      }

      for (const file of post.filePaths) {
        const filePath = join(filesFolder, file);
        if (existsSync(filePath)) {
          const backupName = `deleted_${Date.now()}_${file}`;
          await rename(filePath, join(backupFolder, backupName));
          backedUpFiles.push({ original: file, backup: backupName });
        }
      }
    }

    // DB 삭제
    await queryRunner.manager.delete(CommentModel, { postId });
    await queryRunner.manager.delete(Post, { id: postId });

    await queryRunner.commitTransaction();

    // 성공: 백업 영구 삭제 (비동기)
    this.deleteBackupFiles(backupFolder, backedUpFiles).catch(e =>
      this.logger.warn('백업 삭제 실패', e)
    );

    return postId;

  } catch (error) {
    await queryRunner.rollbackTransaction();

    // 보상: 백업 파일 복원
    for (const { original, backup } of backedUpFiles) {
      try {
        await rename(join(backupFolder, backup), join(filesFolder, original));
      } catch (e) {
        this.logger.error(`파일 복원 실패: ${original}`);
      }
    }

    throw error;

  } finally {
    await queryRunner.release();
  }
}

private async cleanupBackupFiles(
  backupFolder: string,
  files: { backup: string }[]
): Promise<void> {
  for (const { backup } of files) {
    try {
      unlinkSync(join(backupFolder, backup));
    } catch (e) {
      // 무시
    }
  }
}

private async deleteBackupFiles(
  backupFolder: string,
  files: { backup: string }[]
): Promise<void> {
  for (const { backup } of files) {
    try {
      unlinkSync(join(backupFolder, backup));
    } catch (e) {
      // 무시
    }
  }
}
```

---

### Phase 4: Calendar 파일 처리 보상 트랜잭션 (HIGH)

**목표**: Calendar 파일 업로드/수정 시 데이터 정합성 보장

**작업 목록**:

#### 4.1 createCalendar 수정
- [ ] `apps/couple/src/couple/calendar/calendar.service.ts`
  - Post와 동일한 패턴 적용
  - 파일 경로: `public/files/calendar`, `public/backup/calendar`

#### 4.2 updateCalendar 수정
- [ ] `apps/couple/src/couple/calendar/calendar.service.ts`
  - 백업 → 이동 → DB 업데이트
  - 실패 시 복원

#### 4.3 deleteCalendar 수정 (선택)
- [ ] `apps/couple/src/couple/calendar/calendar.service.ts`
  - 파일도 함께 삭제 (현재 DB만 삭제)

**예상 영향**:
- 영향 받는 파일:
  - `apps/couple/src/couple/calendar/calendar.service.ts`
- 의존성: Phase 3 완료 권장 (동일 패턴)

**검증 방법**:
- [ ] Calendar 생성 중 DB 오류 시 파일 복구 확인
- [ ] Calendar 수정 중 실패 시 기존 파일 복원 확인

**상세 코드**: Post 서비스와 동일 패턴 (파일 경로만 변경)

---

### Phase 5: 부가 기능 (MEDIUM)

**목표**: 안정성 및 운영 편의성 향상

**작업 목록**:

#### 5.1 고아 파일 정리 스케줄러
- [ ] `apps/post/src/common/orphan-cleaner.service.ts` (새 파일)
  - `@Cron('0 3 * * *')`: 매일 새벽 3시 실행
  - temp 폴더: 24시간 이상된 파일 삭제
  - backup 폴더: 7일 이상된 파일 삭제

#### 5.2 트랜잭션 로깅 (선택)
- [ ] 트랜잭션 상태 로깅 인터페이스 정의
- [ ] 중요 트랜잭션 시작/종료 로깅

**예상 영향**:
- 새 파일 생성
- 의존성: Phase 3, 4 완료 필요

**검증 방법**:
- [ ] 스케줄러 실행 로그 확인
- [ ] 고아 파일 정리 확인

---

## 4. 리스크 및 대응

### 리스크 1: 보상 트랜잭션 실패

- **확률**: Low
- **영향도**: High
- **완화 방안**:
  - 보상 실패 시 상세 로깅 (coupleId, error, needsManualIntervention)
  - 향후 Dead Letter Queue 도입 검토
  - 관리자 알림 시스템 구축 (Slack, Email 등)

### 리스크 2: RabbitMQ 연결 불안정

- **확률**: Medium
- **영향도**: High
- **완화 방안**:
  - 재시도 로직 (최대 3회, 지수 백오프)
  - 타임아웃 설정 (5~10초)
  - Circuit Breaker 패턴 도입 검토

### 리스크 3: 파일 시스템 오류

- **확률**: Low
- **영향도**: Medium
- **완화 방안**:
  - 모든 파일 작업에 try-catch
  - 복구 실패 파일 로깅
  - 고아 파일 정리 스케줄러로 후처리

### 리스크 4: 기존 API 호환성

- **확률**: Low
- **영향도**: Low
- **완화 방안**:
  - 응답 형식 유지
  - 내부 로직만 변경
  - 단계별 배포 및 모니터링

---

## 5. 전체 검증 계획

### 자동 테스트

- [ ] Unit Test: 각 서비스 메서드 (mock 사용)
- [ ] Integration Test: 실제 서비스 간 통신 테스트

### 수동 테스트

- [ ] 시나리오 1: 커플 연결 성공 → ChatRoom 생성 확인
- [ ] 시나리오 2: ChatRoom 생성 실패 강제 → Couple 롤백 확인
- [ ] 시나리오 3: 커플 해제 → ChatRoom/Chat 삭제 확인
- [ ] 시나리오 4: Post 생성 중 DB 오류 → 파일 복구 확인
- [ ] 시나리오 5: Post 수정 중 실패 → 기존 파일 복원 확인
- [ ] 시나리오 6: Post 삭제 → 파일도 삭제 확인

### 성능 체크

- [ ] 재시도로 인한 응답 지연 측정
- [ ] 파일 백업/복원 시간 측정
- [ ] 메모리 사용량 모니터링

---

## 6. 참고 사항

### Import 추가 필요

```typescript
// couple.service.ts
import { timeout } from 'rxjs/operators';
import { Logger } from '@nestjs/common';

// post.service.ts
import { Logger } from '@nestjs/common';
import { rename } from 'fs/promises';
```

### 백업 폴더 구조

```
public/
├── temp/           # 임시 업로드 파일
├── files/
│   ├── post/       # Post 첨부 파일
│   └── calendar/   # Calendar 첨부 파일
└── backup/
    ├── post/       # Post 백업 파일
    └── calendar/   # Calendar 백업 파일
```

### 로깅 형식 권장

```typescript
this.logger.log(`[TX:COUPLE_CONNECT] Step 1 완료 - Couple 생성 (${coupleId})`);
this.logger.warn(`[TX:COUPLE_CONNECT] Step 2 재시도 2/3 - ChatRoom 생성`);
this.logger.error(`[TX:COMPENSATE] ChatRoom 삭제 실패`, { coupleId, needsManualIntervention: true });
```

---

## 7. 구현 순서 요약

| Phase | 대상 | 우선순위 | 의존성 |
|-------|------|----------|--------|
| 1 | 커플 연결/해제 | CRITICAL | 없음 |
| 2 | 알림 emit → send | HIGH | Phase 1 |
| 3 | Post 파일 처리 | HIGH | 없음 (독립) |
| 4 | Calendar 파일 처리 | HIGH | Phase 3 |
| 5 | 고아 파일 정리 | MEDIUM | Phase 3, 4 |

**권장 실행 순서**: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
