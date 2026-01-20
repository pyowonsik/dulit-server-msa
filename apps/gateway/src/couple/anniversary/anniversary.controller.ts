import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UserPayloadDto } from '@app/common/dto';
import { UpdateAnniversaryDto } from './dto/update-anniversary.dto';
import { AnniversaryService } from './anniversary.service';
import { CreateAnniversaryDto } from './dto/create-anniversary.dto';
import { UserPayload } from '../../auth/decorator/user-payload.decorator';
import { GetAnniversariesDto } from './dto/get-anniversaries.dto';
import { IsAnniversaryCoupleOrAdmin } from './guard/is-anniversary-couple-or-admin.guard';

@ApiTags('기념일')
@ApiBearerAuth()
@Controller('couple')
export class AnniversaryController {
  constructor(private readonly anniversaryService: AnniversaryService) {}

  @Post('/anniversary')
  @ApiOperation({ summary: '기념일 생성', description: '새로운 기념일을 등록합니다.' })
  @ApiResponse({ status: 201, description: '기념일 생성 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async createAnniversary(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() createAnniversaryDto: CreateAnniversaryDto,
  ) {
    return this.anniversaryService.createAnniversary(
      createAnniversaryDto,
      userPayload,
    );
  }

  @Get('/anniversaries')
  @ApiOperation({ summary: '기념일 목록 조회', description: '커플의 기념일 목록을 조회합니다.' })
  @ApiResponse({ status: 200, description: '기념일 목록 조회 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async getAnniversaries(
    @UserPayload() userPayload: UserPayloadDto,
    @Query() getAnniversariesDto: GetAnniversariesDto,
  ) {
    return this.anniversaryService.getAnniversaries(
      getAnniversariesDto,
      userPayload,
    );
  }

  @Get('/anniversary/:anniversaryId')
  @ApiOperation({ summary: '기념일 상세 조회', description: '특정 기념일의 상세 정보를 조회합니다.' })
  @ApiParam({ name: 'anniversaryId', description: '기념일 ID' })
  @ApiResponse({ status: 200, description: '기념일 조회 성공' })
  @ApiResponse({ status: 404, description: '기념일을 찾을 수 없음' })
  async getAnniversary(
    @UserPayload() userPayload: UserPayloadDto,
    @Param('anniversaryId') anniversaryId: string,
  ) {
    return this.anniversaryService.getAnniversary(userPayload, anniversaryId);
  }

  @Patch('/anniversary/:anniversaryId')
  @UseGuards(IsAnniversaryCoupleOrAdmin)
  @ApiOperation({ summary: '기념일 수정', description: '기념일 정보를 수정합니다.' })
  @ApiParam({ name: 'anniversaryId', description: '기념일 ID' })
  @ApiResponse({ status: 200, description: '기념일 수정 성공' })
  @ApiResponse({ status: 403, description: '수정 권한 없음' })
  @ApiResponse({ status: 404, description: '기념일을 찾을 수 없음' })
  async updateAnniversary(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() updateAnniversaryDto: UpdateAnniversaryDto,
    @Param('anniversaryId') anniversaryId: string,
  ) {
    return this.anniversaryService.updateAnniversary(
      updateAnniversaryDto,
      userPayload,
      anniversaryId,
    );
  }

  @Delete('/anniversary/:anniversaryId')
  @UseGuards(IsAnniversaryCoupleOrAdmin)
  @ApiOperation({ summary: '기념일 삭제', description: '기념일을 삭제합니다.' })
  @ApiParam({ name: 'anniversaryId', description: '기념일 ID' })
  @ApiResponse({ status: 200, description: '기념일 삭제 성공' })
  @ApiResponse({ status: 403, description: '삭제 권한 없음' })
  @ApiResponse({ status: 404, description: '기념일을 찾을 수 없음' })
  async deleteAnniversary(
    @UserPayload() userPayload: UserPayloadDto,
    @Param('anniversaryId') anniversaryId: string,
  ) {
    return this.anniversaryService.deleteAnniversary(
      userPayload,
      anniversaryId,
    );
  }
}
