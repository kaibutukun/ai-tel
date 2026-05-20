import { registerAs } from "@nestjs/config";
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";

export const API_ENV_FILE_PATHS = [
  join(process.cwd(), "apps/api/.env"),
  join(process.cwd(), ".env"),
  join(__dirname, "../.env"),
  join(__dirname, "../../.env"),
];

export function preloadApiEnv() {
  const apiEnvPath = API_ENV_FILE_PATHS.find((path) => existsSync(path));
  if (!apiEnvPath) return;

  loadEnv({ path: apiEnvPath, override: true });
  process.env.API_ENV_FILE_LOADED_FROM = apiEnvPath;
}

export const appConfig = registerAs("app", () => ({
  port: Number(process.env.PORT ?? 3001),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
}));
