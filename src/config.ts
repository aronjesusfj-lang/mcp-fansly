import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

export interface FanslyConfig {
  userDataDir: string;
  dbPath: string;
  fanslyToken: string;
  engine: {
    headless: boolean;
    maxRetries: number;
    backoffBaseMs: number;
    requestTimeoutMs: number;
  };
}

const configSchema = z.object({
  userDataDir: z.string().min(1),
  dbPath: z.string().min(1),
  fanslyToken: z.string(),
  headless: z.boolean(),
  maxRetries: z.number().int().min(0).max(10),
  backoffBaseMs: z.number().int().min(100),
  requestTimeoutMs: z.number().int().min(1000),
});

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): FanslyConfig {
  const raw = {
    userDataDir: env.USER_DATA_DIR ?? "./browser_data",
    dbPath: env.DB_PATH ?? "./fansly_analytics.db",
    fanslyToken: env.FANSLY_TOKEN ?? "",
    headless: parseBoolean(env.HEADLESS, true),
    maxRetries: parseNumber(env.MAX_RETRIES, 3),
    backoffBaseMs: parseNumber(env.BACKOFF_BASE_MS, 1000),
    requestTimeoutMs: parseNumber(env.REQUEST_TIMEOUT_MS, 30000),
  };

  const parsed = configSchema.parse(raw);

  return {
    userDataDir: parsed.userDataDir,
    dbPath: parsed.dbPath,
    fanslyToken: parsed.fanslyToken,
    engine: {
      headless: parsed.headless,
      maxRetries: parsed.maxRetries,
      backoffBaseMs: parsed.backoffBaseMs,
      requestTimeoutMs: parsed.requestTimeoutMs,
    },
  };
}
