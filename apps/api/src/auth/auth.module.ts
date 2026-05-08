import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

// JwtModule は AppModule で global: true として登録されているため import 不要

@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
