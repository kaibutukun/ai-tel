import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { LoggerMiddleware } from "./common/middleware/logger.middleware";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { HealthModule } from "./health/health.module";
import { CompaniesModule } from "./companies/companies.module";
import { PhoneNumbersModule } from "./phone-numbers/phone-numbers.module";
import { FaqsModule } from "./faqs/faqs.module";
import { DocumentsModule } from "./documents/documents.module";
import { CallFlowsModule } from "./call-flows/call-flows.module";
import { CallSessionsModule } from "./call-sessions/call-sessions.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    CompaniesModule,
    PhoneNumbersModule,
    FaqsModule,
    DocumentsModule,
    CallFlowsModule,
    CallSessionsModule,
    SubscriptionsModule,
    AdminModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, LoggerMiddleware).forRoutes("*");
  }
}
