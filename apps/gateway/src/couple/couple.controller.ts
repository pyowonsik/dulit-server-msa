import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CoupleService } from './couple.service';
import { UserPayload } from '../auth/decorator/user-payload.decorator';
import { UserPayloadDto } from '@app/common/dto';
import { ConnectCoupleDto } from './dto/connect-couple.dto';

@ApiTags('커플')
@ApiBearerAuth()
@Controller('couple')
export class CoupleController {
  constructor(private readonly coupleService: CoupleService) {}

  @Post('/connect')
  @ApiOperation({
    summary: '커플 연결/해제',
    description: '파트너 ID로 커플을 연결하거나 해제합니다. isConnect: true(연결), false(해제)',
  })
  @ApiResponse({ status: 201, description: '커플 연결/해제 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  @ApiResponse({ status: 404, description: '파트너를 찾을 수 없음' })
  @ApiResponse({ status: 409, description: '이미 커플 관계가 존재하거나 존재하지 않음' })
  async connectCouple(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() connectCoupleDto: ConnectCoupleDto,
  ) {
    return this.coupleService.connectCouple(connectCoupleDto, userPayload);
  }
}
