import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

export interface FanslyAccountConfig {
  name: string;
  cdpUrl: string;
  userDataDir: string;
}

export interface FanslyConfig {
  userDataDir: string;
  dbPath: string;
  fanslyToken: string;
  cdpUrl: string;
  accounts: FanslyAccountConfig[];
  activeAccount: string;
  loginWaitMs: number;
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
  cdpUrl: z.string(),
  loginWaitMs: z.number().int().min(1000),
  headless: z.boolean(),
  maxRetries: z.number().int().min(0).max(10),
  backoffBaseMs: z.number().int().min(100),
  requestTimeoutMs: z.number().int().min(1000),
});

export function portFromCdpUrl(url: string, fallback = "9222"): string {
  const match = url.match(/:(\d+)/);
  return match ? match[1] : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface RawAccount {
  cdpUrl?: string;
  port?: number;
  userDataDir?: string;
}

function parseAccounts(env: NodeJS.ProcessEnv): FanslyAccountConfig[] {
  const raw = (env.FANSLY_ACCOUNTS ?? "").trim();
  if (raw) {
    let parsed: Record<string, RawAccount | number>;
    try {
      parsed = JSON.parse(raw) as Record<string, RawAccount | number>;
    } catch {
      throw new Error("FANSLY_ACCOUNTS no es un JSON válido");
    }
    const accounts = Object.entries(parsed).map(([name, value]) => {
      const cfg = typeof value === "number" ? { port: value } : (value ?? {});
      const port = cfg.port ?? 9222;
      return {
        name,
        cdpUrl: cfg.cdpUrl ?? `http://127.0.0.1:${port}`,
        userDataDir: cfg.userDataDir ?? "",
      };
    });
    if (accounts.length === 0) throw new Error("FANSLY_ACCOUNTS no define ninguna cuenta");
    return accounts;
  }

  const fallbackUrl = env.FANSLY_CDP_URL ?? "http://127.0.0.1:9222";
  return [
    {
      name: "default",
      cdpUrl: fallbackUrl,
      userDataDir: env.USER_DATA_DIR ?? "./browser_data",
    },
  ];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): FanslyConfig {
  const raw = {
    userDataDir: env.USER_DATA_DIR ?? "./browser_data",
    dbPath: env.DB_PATH ?? "./fansly_analytics.db",
    fanslyToken: env.FANSLY_TOKEN ?? "",
    cdpUrl: env.FANSLY_CDP_URL ?? "http://127.0.0.1:9222",
    loginWaitMs: parseNumber(env.LOGIN_WAIT_MS, 120000),
    headless: parseBoolean(env.HEADLESS, true),
    maxRetries: parseNumber(env.MAX_RETRIES, 3),
    backoffBaseMs: parseNumber(env.BACKOFF_BASE_MS, 1000),
    requestTimeoutMs: parseNumber(env.REQUEST_TIMEOUT_MS, 30000),
  };

  const parsed = configSchema.parse(raw);
  const accounts = parseAccounts(env);
  const requested = (env.FANSLY_ACTIVE_ACCOUNT ?? "").trim();
  const activeAccount =
    accounts.find((account) => account.name === requested)?.name ?? accounts[0].name;

  return {
    userDataDir: parsed.userDataDir,
    dbPath: parsed.dbPath,
    fanslyToken: parsed.fanslyToken,
    cdpUrl: parsed.cdpUrl,
    accounts,
    activeAccount,
    loginWaitMs: parsed.loginWaitMs,
    engine: {
      headless: parsed.headless,
      maxRetries: parsed.maxRetries,
      backoffBaseMs: parsed.backoffBaseMs,
      requestTimeoutMs: parsed.requestTimeoutMs,
    },
  };
}
