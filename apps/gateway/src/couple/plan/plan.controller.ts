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
import { UserPayload } from '../../auth/decorator/user-payload.decorator';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { GetPlansDto } from './dto/get-plans.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanService } from './plan.service';
import { IsPlanCoupleOrAdminGuard } from './guard/is-plan-couple-or-admin.guard';

@ApiTags('약속')
@ApiBearerAuth()
@Controller('couple')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Post('/plan')
  @ApiOperation({ summary: '약속 생성', description: '새로운 약속을 등록합니다.' })
  @ApiResponse({ status: 201, description: '약속 생성 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async createPlan(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() createPlanDto: CreatePlanDto,
  ) {
    return this.planService.createPlan(createPlanDto, userPayload);
  }

  @Get('/plans')
  @ApiOperation({ summary: '약속 목록 조회', description: '커플의 약속 목록을 조회합니다.' })
  @ApiResponse({ status: 200, description: '약속 목록 조회 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async getPlans(
    @UserPayload() userPayload: UserPayloadDto,
    @Query() getPlansDto: GetPlansDto,
  ) {
    return this.planService.getPlans(getPlansDto, userPayload);
  }

  @Get('/plan/:planId')
  @ApiOperation({ summary: '약속 상세 조회', description: '특정 약속의 상세 정보를 조회합니다.' })
  @ApiParam({ name: 'planId', description: '약속 ID' })
  @ApiResponse({ status: 200, description: '약속 조회 성공' })
  @ApiResponse({ status: 404, description: '약속을 찾을 수 없음' })
  async getPlan(
    @UserPayload() userPayload: UserPayloadDto,
    @Param('planId') planId: string,
  ) {
    return this.planService.getPlan(userPayload, planId);
  }

  @Patch('/plan/:planId')
  @UseGuards(IsPlanCoupleOrAdminGuard)
  @ApiOperation({ summary: '약속 수정', description: '약속 정보를 수정합니다.' })
  @ApiParam({ name: 'planId', description: '약속 ID' })
  @ApiResponse({ status: 200, description: '약속 수정 성공' })
  @ApiResponse({ status: 403, description: '수정 권한 없음' })
  @ApiResponse({ status: 404, description: '약속을 찾을 수 없음' })
  async updatePlan(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() updatePlanDto: UpdatePlanDto,
    @Param('planId') planId: string,
  ) {
    return this.planService.updatePlan(updatePlanDto, userPayload, planId);
  }

  @Delete('/plan/:planId')
  @UseGuards(IsPlanCoupleOrAdminGuard)
  @ApiOperation({ summary: '약속 삭제', description: '약속을 삭제합니다.' })
  @ApiParam({ name: 'planId', description: '약속 ID' })
  @ApiResponse({ status: 200, description: '약속 삭제 성공' })
  @ApiResponse({ status: 403, description: '삭제 권한 없음' })
  @ApiResponse({ status: 404, description: '약속을 찾을 수 없음' })
  async deletePlan(
    @UserPayload() userPayload: UserPayloadDto,
    @Param('planId') planId: string,
  ) {
    return this.planService.deletePlan(userPayload, planId);
  }
}
