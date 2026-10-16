import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { Public } from './auth.guard.js';
import type { AppRequest } from '../common/context.js';
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Public() @Get('status') status() {
    return this.auth.status();
  }
  @Public() @Post('setup') setup(@Body() b: unknown) {
    return this.auth.setup(b);
  }
  @Public() @Post('login') login(@Body() b: unknown, @Req() r: AppRequest) {
    return this.auth.login(b, r.ip);
  }
  @Get('me') me(@Req() r: AppRequest) {
    return this.auth.me(r.auth);
  }
  @Post('logout') logout(@Req() r: AppRequest) {
    return this.auth.logout(r.auth);
  }
  @Patch('preferences') preferences(@Req() r: AppRequest, @Body() b: unknown) {
    return this.auth.preferences(r.auth, b);
  }
  @Post('password') password(@Req() r: AppRequest, @Body() b: unknown) {
    return this.auth.changePassword(r.auth, b);
  }
}
