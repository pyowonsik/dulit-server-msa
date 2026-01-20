import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Authorization } from './decorator/authorization.decorator';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorator/public.decorator';

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({
    summary: '회원가입',
    description: 'Basic 토큰(email:password)과 사용자 이름으로 회원가입합니다.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Basic base64(email:password)',
    example: 'Basic dGVzdEB0ZXN0LmNvbTpwYXNzd29yZDEyMw==',
    required: true,
  })
  @ApiResponse({ status: 201, description: '회원가입 성공' })
  @ApiResponse({ status: 400, description: '잘못된 형식의 토큰' })
  @ApiResponse({ status: 409, description: '이미 가입된 이메일' })
  registerUser(
    @Authorization() token: string,
    @Body() registerDto: RegisterDto,
  ) {
    return this.authService.register(token, registerDto);
  }

  @Post('login')
  @Public()
  @ApiOperation({
    summary: '로그인',
    description: 'Basic 토큰(email:password)으로 로그인하여 JWT 토큰을 발급받습니다.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Basic base64(email:password)',
    example: 'Basic dGVzdEB0ZXN0LmNvbTpwYXNzd29yZDEyMw==',
    required: true,
  })
  @ApiResponse({ status: 201, description: '로그인 성공 - accessToken, refreshToken 반환' })
  @ApiResponse({ status: 400, description: '잘못된 로그인 정보' })
  loginUser(@Authorization() token: string) {
    return this.authService.login(token);
  }
}
