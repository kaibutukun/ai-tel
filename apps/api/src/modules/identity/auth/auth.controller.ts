import { Controller, Post, Body } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { Public } from "../../../common/decorators/public.decorator";

/**
 * 認証 API
 * POST /api/auth/login  - ログイン（JWT を返す）
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** @Public() で JWT ガードをスキップ */
  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
