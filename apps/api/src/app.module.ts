import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import {
  API_ENV_FILE_PATHS,
  appConfig,
  preloadApiEnv,
} from "./config/app.config";
import { validateEnv } from "./config/env.schema";
import { LoggerMiddleware } from "./common/middleware/logger.middleware";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { TenantModule } from "./modules/tenant/tenant.module";
import { VoiceModule } from "./modules/voice/voice.module";
import { KnowledgeModule } from "./modules/knowledge/knowledge.module";
import { BillingModule } from "./modules/billing/billing.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { PlatformAdminModule } from "./modules/platform-admin/platform-admin.module";

preloadApiEnv();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: API_ENV_FILE_PATHS,
      load: [appConfig],
      validate: validateEnv,
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("app.jwtSecret"),
        signOptions: { expiresIn: config.get<string>("app.jwtExpiresIn") },
      }),
    }),
    HealthModule,
    IdentityModule,
    TenantModule,
    VoiceModule,
    KnowledgeModule,
    BillingModule,
    AnalyticsModule,
    PlatformAdminModule,
  ],
  providers: [
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
