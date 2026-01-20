import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Calendar } from './entity/calendar.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { CoupleService } from '../couple.service';
import { Repository, DataSource } from 'typeorm';
import { GetCalendarDto } from './dto/get-calendar.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import { GetCalendarsDto } from './dto/get-calendars.dto';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { join } from 'path';
import { rename } from 'fs/promises';
import { existsSync, mkdirSync, unlinkSync } from 'fs';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Calendar)
    private readonly calendarRepository: Repository<Calendar>,
    private readonly coupleService: CoupleService,
  ) {}

  async createCalendar(createCalendarDto: CreateCalendarDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const movedFiles: string[] = [];
    const tempFolder = join('public', 'temp');
    const filesFolder = join('public', 'files/calendar');

    try {
      const { meta, title, description, date, filePaths } = createCalendarDto;

      const coupleId = await this.coupleService.getCoupleByUserId(meta.user.sub);

      if (!coupleId) {
        throw new NotFoundException('존재하지 않는 COUPLE의 ID 입니다.');
      }

      if (filePaths && filePaths.length > 0) {
        if (!existsSync(filesFolder)) {
          mkdirSync(filesFolder, { recursive: true });
        }

        for (const file of filePaths) {
          await this.renameFiles(tempFolder, filesFolder, file);
          movedFiles.push(file);
        }
      }

      const calendar = queryRunner.manager.create(Calendar, {
        title,
        description,
        date,
        filePaths,
        coupleId,
      });

      await queryRunner.manager.save(calendar);
      await queryRunner.commitTransaction();

      return calendar;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // 보상 트랜잭션: 이동된 파일 되돌리기
      for (const file of movedFiles) {
        try {
          await this.renameFiles(filesFolder, tempFolder, file);
          this.logger.log(`[TX:COMPENSATE] CALENDAR_CREATE 파일 복구 성공: ${file}`);
        } catch (fileError) {
          this.logger.error(`[TX:COMPENSATE] CALENDAR_CREATE 파일 복구 실패: ${file}`, fileError);
        }
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateCalendar(updateCalendarDto: UpdateCalendarDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const tempFolder = join('public', 'temp');
    const filesFolder = join('public', 'files/calendar');
    const backupFolder = join('public', 'backup/calendar');

    const backedUpFiles: { original: string; backup: string }[] = [];
    const movedFiles: string[] = [];

    try {
      const { meta, title, description, date, filePaths, calendarId } =
        updateCalendarDto;

      const coupleId = await this.coupleService.getCoupleByUserId(meta.user.sub);

      if (!coupleId) {
        throw new NotFoundException('존재하지 않는 COUPLE의 ID 입니다.');
      }

      const calendar = await queryRunner.manager.findOne(Calendar, {
        where: { id: calendarId },
      });

      if (!calendar) {
        throw new NotFoundException('존재하지 않는 CALENDAR의 ID 입니다.');
      }

      if (filePaths) {
        if (!existsSync(backupFolder)) {
          mkdirSync(backupFolder, { recursive: true });
        }

        // 기존 파일 백업
        if (calendar.filePaths) {
          for (const oldFile of calendar.filePaths) {
            const oldPath = join(process.cwd(), filesFolder, oldFile);
            if (existsSync(oldPath)) {
              const backupName = `${Date.now()}_${oldFile}`;
              await rename(oldPath, join(process.cwd(), backupFolder, backupName));
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
        Calendar,
        { id: calendarId },
        {
          title,
          description,
          date,
          filePaths,
          coupleId,
        },
      );

      const newCalendar = await queryRunner.manager.findOne(Calendar, {
        where: { id: calendarId },
      });

      await queryRunner.commitTransaction();

      // 성공: 백업 파일 삭제 (비동기)
      this.cleanupBackupFiles(backupFolder, backedUpFiles).catch((e) =>
        this.logger.warn('[TX:CALENDAR_UPDATE] 백업 정리 실패', e),
      );

      return newCalendar;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // 보상: 새 파일 되돌리기
      for (const file of movedFiles) {
        try {
          await this.renameFiles(filesFolder, tempFolder, file);
        } catch (e) {
          this.logger.error(`[TX:COMPENSATE] CALENDAR_UPDATE 새 파일 복구 실패: ${file}`);
        }
      }

      // 보상: 백업 파일 복원
      for (const { original, backup } of backedUpFiles) {
        try {
          await rename(
            join(process.cwd(), backupFolder, backup),
            join(process.cwd(), filesFolder, original),
          );
        } catch (e) {
          this.logger.error(`[TX:COMPENSATE] CALENDAR_UPDATE 백업 복원 실패: ${original}`);
        }
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteCalendar(getCalendarDto: GetCalendarDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const filesFolder = join('public', 'files/calendar');
    const backupFolder = join('public', 'backup/calendar');

    const backedUpFiles: { original: string; backup: string }[] = [];

    try {
      const { meta, calendarId } = getCalendarDto;

      const coupleId = await this.coupleService.getCoupleByUserId(meta.user.sub);

      if (!coupleId) {
        throw new NotFoundException('존재하지 않는 COUPLE의 ID 입니다.');
      }

      const calendar = await queryRunner.manager.findOne(Calendar, {
        where: { id: calendarId },
      });

      if (!calendar) {
        throw new NotFoundException('존재하지 않는 CALENDAR의 ID 입니다.');
      }

      // 파일 백업
      if (calendar.filePaths && calendar.filePaths.length > 0) {
        if (!existsSync(join(process.cwd(), backupFolder))) {
          mkdirSync(join(process.cwd(), backupFolder), { recursive: true });
        }

        for (const file of calendar.filePaths) {
          const filePath = join(process.cwd(), filesFolder, file);
          if (existsSync(filePath)) {
            const backupName = `deleted_${Date.now()}_${file}`;
            await rename(filePath, join(process.cwd(), backupFolder, backupName));
            backedUpFiles.push({ original: file, backup: backupName });
          }
        }
      }

      // DB 삭제
      await queryRunner.manager.delete(Calendar, { id: calendarId });

      await queryRunner.commitTransaction();

      // 성공: 백업 영구 삭제 (비동기)
      this.deleteBackupFiles(backupFolder, backedUpFiles).catch((e) =>
        this.logger.warn('[TX:CALENDAR_DELETE] 백업 삭제 실패', e),
      );

      return calendarId;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // 보상: 백업 파일 복원
      for (const { original, backup } of backedUpFiles) {
        try {
          await rename(
            join(process.cwd(), backupFolder, backup),
            join(process.cwd(), filesFolder, original),
          );
        } catch (e) {
          this.logger.error(`[TX:COMPENSATE] CALENDAR_DELETE 파일 복원 실패: ${original}`);
        }
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getCalendars(getCalendarsDto: GetCalendarsDto) {
    const { meta, month } = getCalendarsDto;

    const coupleId = await this.coupleService.getCoupleByUserId(meta.user.sub);

    if (!coupleId) {
      throw new NotFoundException('존재하지 않는 COUPLE의 ID 입니다.');
    }

    const calendars = await this.calendarRepository.find({
      where: {
        coupleId,
      },
    });

    if (month) {
      return calendars.filter((calendar) => {
        const date = new Date(calendar.date);
        return date.getMonth() === month - 1;
      });
    }

    return calendars;
  }

  async getCalendar(getCalendarDto: GetCalendarDto) {
    const { meta, calendarId } = getCalendarDto;

    const coupleId = await this.coupleService.getCoupleByUserId(meta.user.sub);

    if (!coupleId) {
      throw new NotFoundException('존재하지 않는 COUPLE의 ID 입니다.');
    }

    const calendar = await this.calendarRepository.findOne({
      where: {
        id: calendarId,
      },
    });

    if (!calendar) {
      throw new NotFoundException('존재하지 않는 CALENDAR의 ID 입니다.');
    }

    return calendar;
  }

  async renameFiles(tempFolder: string, filesFolder: string, file: string) {
    return await rename(
      join(process.cwd(), tempFolder, file),
      join(process.cwd(), filesFolder, file),
    );
  }

  async isCalendarCoupleOrAdmin(getCalendarDto: GetCalendarDto) {
    const { meta, calendarId } = getCalendarDto;

    const coupleId = await this.coupleService.getCoupleByUserId(meta.user.sub);

    if (!coupleId) {
      return false;
    }

    const exists = await this.calendarRepository
      .createQueryBuilder('calendar')
      .where('calendar.id = :calendarId', { calendarId })
      .andWhere('calendar.coupleId = :coupleId', { coupleId })
      .getExists();

    return exists;
  }

  private async cleanupBackupFiles(
    backupFolder: string,
    files: { backup: string }[],
  ): Promise<void> {
    for (const { backup } of files) {
      try {
        unlinkSync(join(process.cwd(), backupFolder, backup));
      } catch (e) {
        // 무시
      }
    }
  }

  private async deleteBackupFiles(
    backupFolder: string,
    files: { backup: string }[],
  ): Promise<void> {
    for (const { backup } of files) {
      try {
        unlinkSync(join(process.cwd(), backupFolder, backup));
      } catch (e) {
        // 무시
      }
    }
  }
}
