import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log("Database connected");
    } catch {
      this.logger.warn(
        "Database not available — running with mock data. Set DATABASE_URL to connect."
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
