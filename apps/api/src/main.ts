import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { TimeoutInterceptor } from "./common/interceptors/timeout.interceptor";
import { AllExceptionsFilter } from "./common/filters/http-exception.filter";

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
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new TimeoutInterceptor(30000)
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`\n🚀 API server running on http://localhost:${port}/api\n`);
}

bootstrap();
