import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UserPayloadDto } from '@app/common/dto';
import { CalendarService } from './calendar.service';
import { UserPayload } from '../../auth/decorator/user-payload.decorator';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import { GetCalendarsDto } from './dto/get-calendars.dto';

import { FilesInterceptor } from '@nestjs/platform-express';
import { IsCalendarCoupleOrAdmin } from './guard/is-calendar-couple-or-admin.guard';

@ApiTags('캘린더')
@ApiBearerAuth()
@Controller('couple')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post('/calendar')
  @ApiOperation({ summary: '캘린더 일정 생성', description: '새로운 캘린더 일정을 등록합니다.' })
  @ApiResponse({ status: 201, description: '캘린더 일정 생성 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async createCalendar(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() createCalendarDto: CreateCalendarDto,
  ) {
    return this.calendarService.createCalendar(createCalendarDto, userPayload);
  }

  @Get('/calendars')
  @ApiOperation({ summary: '캘린더 일정 목록 조회', description: '커플의 캘린더 일정 목록을 조회합니다.' })
  @ApiResponse({ status: 200, description: '캘린더 일정 목록 조회 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async getCalendars(
    @UserPayload() userPayload: UserPayloadDto,
    @Query() getCalendarsDto: GetCalendarsDto,
  ) {
    return this.calendarService.getCalendars(getCalendarsDto, userPayload);
  }

  @Get('/calendar/:calendarId')
  @ApiOperation({ summary: '캘린더 일정 상세 조회', description: '특정 캘린더 일정의 상세 정보를 조회합니다.' })
  @ApiParam({ name: 'calendarId', description: '캘린더 일정 ID' })
  @ApiResponse({ status: 200, description: '캘린더 일정 조회 성공' })
  @ApiResponse({ status: 404, description: '캘린더 일정을 찾을 수 없음' })
  async getCalendar(
    @UserPayload() userPayload: UserPayloadDto,
    @Param('calendarId') calendarId: string,
  ) {
    return this.calendarService.getCalendar(userPayload, calendarId);
  }

  @Patch('/calendar/:calendarId')
  @UseGuards(IsCalendarCoupleOrAdmin)
  @ApiOperation({ summary: '캘린더 일정 수정', description: '캘린더 일정 정보를 수정합니다.' })
  @ApiParam({ name: 'calendarId', description: '캘린더 일정 ID' })
  @ApiResponse({ status: 200, description: '캘린더 일정 수정 성공' })
  @ApiResponse({ status: 403, description: '수정 권한 없음' })
  @ApiResponse({ status: 404, description: '캘린더 일정을 찾을 수 없음' })
  async updateCalendar(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() updateCalendarDto: UpdateCalendarDto,
    @Param('calendarId') calendarId: string,
  ) {
    return this.calendarService.updateCalendar(
      updateCalendarDto,
      userPayload,
      calendarId,
    );
  }

  @Delete('/calendar/:calendarId')
  @UseGuards(IsCalendarCoupleOrAdmin)
  @ApiOperation({ summary: '캘린더 일정 삭제', description: '캘린더 일정을 삭제합니다.' })
  @ApiParam({ name: 'calendarId', description: '캘린더 일정 ID' })
  @ApiResponse({ status: 200, description: '캘린더 일정 삭제 성공' })
  @ApiResponse({ status: 403, description: '삭제 권한 없음' })
  @ApiResponse({ status: 404, description: '캘린더 일정을 찾을 수 없음' })
  async deleteCalendar(
    @UserPayload() userPayload: UserPayloadDto,
    @Param('calendarId') calendarId: string,
  ) {
    return this.calendarService.deleteCalendar(userPayload, calendarId);
  }

  @Post('/calendar/upload/files')
  @ApiOperation({ summary: '캘린더 파일 업로드', description: '캘린더 일정에 첨부할 이미지/영상 파일을 업로드합니다.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: '업로드할 파일들 (최대 10개, 20MB 이하)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: '파일 업로드 성공' })
  @ApiResponse({ status: 400, description: '지원하지 않는 파일 형식' })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: {
        fileSize: 20000000,
      },
      fileFilter(req, file, callback) {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'video/mp4',
          'video/mpeg',
          'video/webm',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              '이미지 또는 영상 파일만 업로드 가능합니다.',
            ),
            false,
          );
        }
        return callback(null, true);
      },
    }),
  )
  async createFiles(
    @UploadedFiles()
    files: Array<Express.Multer.File>,
  ) {
    const fileNames = files.map((file) => file.filename);

    return {
      fileNames: fileNames,
    };
  }
}
