import { chromium, request as playwrightRequest, APIRequestContext, BrowserContext } from "playwright";
import type { FanslyConfig } from "../config.js";

export interface FanslyEngineOptions {
  userDataDir: string;
  headless: boolean;
  fanslyToken: string;
  maxRetries: number;
  backoffBaseMs: number;
  requestTimeoutMs: number;
}

export interface FanslyAccount {
  id?: string;
  username?: string;
  email?: string;
  followCount?: number;
  timelineStats?: {
    imageCount?: number;
    videoCount?: number;
    bundleCount?: number;
  };
  subscriptionTiers?: Array<{
    id?: string;
    name?: string;
    price?: number;
    maxSubscribers?: number;
    plans?: Array<{ id?: string; price?: number; cycle?: number; status?: number }>;
    [key: string]: unknown;
  }>;
  walls?: Array<{ id?: string; name?: string; defaultWall?: boolean; [key: string]: unknown }>;
  avatar?: unknown;
  [key: string]: unknown;
}

export interface FanslyPost {
  id?: string;
  content?: string;
  likeCount?: number;
  commentCount?: number;
  totalTips?: number;
  createdAt?: string;
  [key: string]: unknown;
}

export interface FanslyWallMedia {
  id?: string;
  mediaType?: string;
  createdAt?: string;
  [key: string]: unknown;
}

const API_BASE = "https://apiv3.fansly.com/api/v1";
const LOGIN_URL = "https://fansly.com/creator";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SESSION_NOT_FOUND_MESSAGE =
  "No hay sesión de Fansly activa. " +
  "Opciones: (1) define FANSLY_TOKEN en .env (obtén el token con " +
  "JSON.parse(localStorage.getItem(\"session_active_session\")).token en fansly.com); " +
  "o (2) ejecuta npm run login para abrir Chromium e iniciar sesión manualmente.";

export class FanslyEngine {
  private requestContext: APIRequestContext | null = null;
  private browserContext: BrowserContext | null = null;
  private authHeaders: Record<string, string> = {};
  private ownAccountCache: FanslyAccount | null = null;
  private readonly options: FanslyEngineOptions;

  constructor(options: FanslyEngineOptions) {
    this.options = options;
  }

  get mode(): "token" | "browser" {
    return this.options.fanslyToken ? "token" : "browser";
  }

  async initSession(): Promise<void> {
    if (this.requestContext) return;
    if (this.mode === "token") {
      this.requestContext = await playwrightRequest.newContext();
      this.authHeaders = { authorization: this.options.fanslyToken };
      this.ownAccountCache = null;
      return;
    }
    this.browserContext = await chromium.launchPersistentContext(this.options.userDataDir, {
      headless: this.options.headless,
    });
    this.requestContext = this.browserContext.request;
    await this.refreshSession();
  }

  async hasSession(): Promise<boolean> {
    await this.initSession();
    return Boolean(this.authHeaders.authorization);
  }

  private async refreshSession(): Promise<void> {
    if (!this.browserContext) return;
    const page = await this.browserContext.newPage();
    try {
      await page.goto(LOGIN_URL, {
        waitUntil: "domcontentloaded",
        timeout: this.options.requestTimeoutMs,
      });
      const token = await page.evaluate(() => {
        const candidates = [
          "session_active_session",
          "session_token",
          "active_session",
          "session",
        ];
        for (const key of candidates) {
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (typeof parsed?.token === "string" && parsed.token.length > 0) return parsed.token;
            if (typeof parsed === "string" && parsed.length > 0) return parsed;
          } catch {
            if (typeof raw === "string" && raw.length > 0) return raw;
          }
        }
        return "";
      });
      this.authHeaders = token ? { authorization: token } : {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Fansly MCP: no se pudo cargar la página de sesión (${message}).`);
      this.authHeaders = {};
    } finally {
      await page.close();
    }
    this.ownAccountCache = null;
  }

  async getOwnAccount(): Promise<FanslyAccount> {
    if (this.ownAccountCache) return this.ownAccountCache;
    const data = await this.fetchApi<{ account: FanslyAccount }>("/account/me");
    this.ownAccountCache = data.account ?? {};
    return this.ownAccountCache;
  }

  async fetchApi<T = unknown>(path: string): Promise<T> {
    await this.initSession();

    if (!this.authHeaders.authorization) {
      throw new Error(SESSION_NOT_FOUND_MESSAGE);
    }

    const request = this.requestContext;
    if (!request) throw new Error("Cliente de peticiones no inicializado");

    const separator = path.includes("?") ? "&" : "?";
    const url = `${API_BASE}${path}${separator}ngsw-bypass=true`;

    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      Origin: "https://fansly.com",
      Referer: "https://fansly.com/",
      "fansly-client-ts": String(Date.now()),
      ...this.authHeaders,
    };

    let lastError: Error = new Error("La petición no pudo completarse");

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      const backoffMs = this.options.backoffBaseMs * 2 ** attempt;
      try {
        const response = await request.get(url, {
          headers,
          timeout: this.options.requestTimeoutMs,
        });

        const status = response.status();
        if (status === 429 || status >= 500) {
          await sleep(backoffMs);
          continue;
        }
        if (status === 401) {
          this.authHeaders = {};
          if (this.mode === "browser") {
            await this.refreshSession();
            if (!this.authHeaders.authorization) {
              throw new Error(
                "La sesión de Fansly expiró o es inválida. Vuelve a iniciar sesión con npm run login o renueva FANSLY_TOKEN."
              );
            }
            continue;
          }
          throw new Error(
            "El FANSLY_TOKEN es inválido o expiró. Obtén uno nuevo y actualízalo en .env."
          );
        }
        if (status === 400) {
          throw new Error(
            "Fansly rechazó la petición (HTTP 400). Si acabas de iniciar sesión, espera unos segundos y reintenta."
          );
        }
        if (!response.ok()) {
          throw new Error(`HTTP ${status} en ${url}`);
        }

        const json = (await response.json()) as {
          success?: boolean;
          response?: T;
          error?: { code?: number; details?: string };
          [key: string]: unknown;
        };

        if (json && typeof json === "object" && "success" in json && json.success !== true) {
          const code = json.error?.code ?? "?";
          const details = json.error?.details ?? "sin detalles";
          throw new Error(`Fansly API error (${code}): ${details}`);
        }

        return (json?.response ?? json) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === this.options.maxRetries) break;
        await sleep(backoffMs);
      }
    }

    throw lastError;
  }

  async close(): Promise<void> {
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
    }
    if (this.requestContext) {
      await this.requestContext.dispose();
      this.requestContext = null;
    }
  }
}

export function createEngine(config: FanslyConfig): FanslyEngine {
  return new FanslyEngine({
    userDataDir: config.userDataDir,
    headless: config.engine.headless,
    fanslyToken: config.fanslyToken,
    maxRetries: config.engine.maxRetries,
    backoffBaseMs: config.engine.backoffBaseMs,
    requestTimeoutMs: config.engine.requestTimeoutMs,
  });
}
