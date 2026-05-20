type EnvConfig = Record<string, string | undefined>;

export function validateEnv(config: EnvConfig) {
  const nodeEnv = config.NODE_ENV ?? "development";
  const port = config.PORT === undefined ? undefined : Number(config.PORT);

  if (port !== undefined && (!Number.isInteger(port) || port <= 0)) {
    throw new Error("PORT must be a positive integer");
  }

  if (nodeEnv === "production" && !config.JWT_SECRET) {
    throw new Error("JWT_SECRET is required in production");
  }

  return config;
}
