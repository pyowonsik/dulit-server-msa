import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/decorator/public.decorator';

@ApiTags('헬스체크')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: '서버 상태 확인', description: '서버의 헬스 상태를 확인합니다.' })
  @ApiResponse({ status: 200, description: '서버 정상' })
  @ApiResponse({ status: 503, description: '서버 비정상' })
  check() {
    return this.health.check([
      // 메모리 사용량 체크 (heap 512MB 이하)
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }

  @Get('ping')
  @Public()
  @ApiOperation({ summary: '간단한 핑 체크', description: '서버가 응답하는지 확인합니다.' })
  @ApiResponse({ status: 200, description: 'pong' })
  ping() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
