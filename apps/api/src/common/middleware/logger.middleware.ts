import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const start = Date.now();

    res.on("finish", () => {
      const { statusCode } = res;
      const elapsed = Date.now() - start;
      const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "log";
      this.logger[level](`${method} ${originalUrl} ${statusCode} ${elapsed}ms`);
    });

    next();
  }
}
