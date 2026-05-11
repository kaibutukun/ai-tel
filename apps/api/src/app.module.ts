import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./prisma/prisma.module";
import { LoggerMiddleware } from "./common/middleware/logger.middleware";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { CompaniesModule } from "./companies/companies.module";
import { PhoneNumbersModule } from "./phone-numbers/phone-numbers.module";
import { FaqsModule } from "./faqs/faqs.module";
import { DocumentsModule } from "./documents/documents.module";
import { CallFlowsModule } from "./call-flows/call-flows.module";
import { CallSessionsModule } from "./call-sessions/call-sessions.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { AdminModule } from "./admin/admin.module";
import { MembersModule } from "./members/members.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { AiModule } from "./ai/ai.module";
import { TwilioModule } from "./twilio/twilio.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // JWT をグローバルに登録 — 全モジュールから JwtService を DI 可能
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
      signOptions: { expiresIn: "7d" },
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    CompaniesModule,
    PhoneNumbersModule,
    FaqsModule,
    DocumentsModule,
    CallFlowsModule,
    CallSessionsModule,
    SubscriptionsModule,
    AdminModule,
    MembersModule,
    DashboardModule,
    AiModule,
    TwilioModule,
    RealtimeModule,
  ],
  providers: [
    // グローバルガードとして登録（DI が正しく機能する）
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, LoggerMiddleware).forRoutes("*");
  }
}
