import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

export class ConnectCoupleDto {
  @IsString()
  @ApiProperty({
    description: '연결할 파트너의 유저 ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  partnerId: string;

  @IsBoolean()
  @ApiProperty({
    description: '커플 연결 여부 (true: 연결, false: 해제)',
    example: true,
  })
  isConnect: boolean;
}
