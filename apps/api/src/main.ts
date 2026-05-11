import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { Server as HttpServer } from "http";
import { AppModule } from "./app.module";
import { TimeoutInterceptor } from "./common/interceptors/timeout.interceptor";
import { AllExceptionsFilter } from "./common/filters/http-exception.filter";
import { RealtimeService } from "./realtime/realtime.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log", "debug"],
  });

  app.setGlobalPrefix("api");

  app.enableCors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
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

  // Twilio Media Streams 用 WebSocket を同一 HTTP サーバーに乗せる。
  // /twilio/media-stream への upgrade を RealtimeService が捕まえる。
  const httpServer = app.getHttpServer() as HttpServer;
  const realtime = app.get(RealtimeService);
  realtime.attach(httpServer);

  // Nest のシャットダウンフック有効化（RealtimeService が WS を綺麗に閉じる）
  app.enableShutdownHooks();

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`\n🚀 API server running on http://localhost:${port}/api`);
  console.log(`📞 Twilio media stream WS endpoint: ws(s)://<host>/twilio/media-stream\n`);
}

bootstrap();
