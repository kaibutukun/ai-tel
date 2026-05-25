import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Server as HttpServer } from "http";
import { AppModule } from "./app.module";
import { TimeoutInterceptor } from "./common/interceptors/timeout.interceptor";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { RealtimeService } from "./modules/voice/realtime/realtime.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.setGlobalPrefix("api");
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>("app.frontendUrl") ?? "http://localhost:3000",
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // JwtAuthGuard は AppModule の APP_GUARD で登録済み（DI対応）
  app.useGlobalInterceptors(new TimeoutInterceptor(30000));

  app.useGlobalFilters(new AllExceptionsFilter());

  // Nest のシャットダウンフック有効化（RealtimeService が WS を綺麗に閉じる）
  app.enableShutdownHooks();

  const port = config.get<number>("app.port") ?? 3001;
  await app.listen(port);

  // NTT CPaaS WebSocket endpoint 用 WebSocket を同一 HTTP サーバーに乗せる。
  // /ntt-cpaas/media-stream への upgrade を RealtimeService が捕まえる。
  // listen 後にアタッチすることで、Nest が最終的に bind した http.Server を確実に掴む。
  const httpServer = app.getHttpServer() as HttpServer;
  const realtime = app.get(RealtimeService);
  realtime.attach(httpServer);

  console.log(`\n🚀 API server running on http://localhost:${port}/api`);
  console.log(`📞 NTT CPaaS media stream WS endpoint: ws(s)://<host>/ntt-cpaas/media-stream\n`);
}

bootstrap();
