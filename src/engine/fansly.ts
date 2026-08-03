import { chromium, request as playwrightRequest, type APIRequestContext, type Browser, type BrowserContext, type Page } from "playwright";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { FanslyAccountConfig, FanslyConfig } from "../config.js";
import { ensureDebugChrome, portFromCdpUrl } from "./chrome-launcher.js";
import { CLEAN_SESSION_SCRIPT, readTokenFromStorage } from "./session.js";

export interface FanslyEngineOptions {
  userDataDir: string;
  headless: boolean;
  fanslyToken: string;
  cdpUrl: string;
  accounts: FanslyAccountConfig[];
  activeAccount: string;
  loginWaitMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  requestTimeoutMs: number;
}

export interface AccountStatus {
  name: string;
  cdpUrl: string;
  active: boolean;
  running: boolean;
  session: boolean;
}

export interface FanslyAccount {
  id?: string;
  username?: string;
  email?: string;
  displayName?: string;
  followCount?: number;
  subscriberCount?: number;
  postLikes?: number;
  accountMediaLikes?: number;
  lastSeenAt?: number;
  totalSpent30?: number;
  earningsWallet?: { balance?: number; [key: string]: unknown };
  streaming?: { enabled?: boolean; [key: string]: unknown };
  profileSocials?: unknown;
  profileBadges?: unknown;
  pinnedPosts?: unknown;
  timelineStats?: {
    imageCount?: number;
    videoCount?: number;
    bundleCount?: number;
    bundleImageCount?: number;
    bundleVideoCount?: number;
    [key: string]: unknown;
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
  mediaLikeCount?: number;
  totalTipAmount?: number;
  attachmentTipAmount?: number;
  createdAt?: number | string;
  fypFlags?: number;
  attachments?: Array<{ contentType?: number; contentId?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface FanslyTimelineMedia {
  id?: string;
  price?: number;
  likeCount?: number;
  permissionFlags?: number;
  createdAt?: number | string;
  media?: { type?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface FanslyTimelineResponse {
  posts?: FanslyPost[];
  accountMedia?: FanslyTimelineMedia[];
  accountMediaBundles?: Array<Record<string, unknown>>;
  accounts?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface FanslyPublicAccount {
  id?: string;
  username?: string;
  displayName?: string;
  followCount?: number;
  subscriberCount?: number;
  lastSeenAt?: number;
  timelineStats?: {
    imageCount?: number;
    videoCount?: number;
    bundleCount?: number;
    [key: string]: unknown;
  };
  subscriptionTiers?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface FanslySubscriptions {
  stats?: { totalActive?: number; totalExpired?: number; total?: number };
  subscriptions?: Array<Record<string, unknown>>;
  subscriptionPlans?: Array<Record<string, unknown>>;
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
  "Opciones: (1) define FANSLY_TOKEN en .env; " +
  "(2) ejecuta npm run chrome-cdp y deja Chrome abierto con tu sesión de fansly.com iniciada; " +
  "o (3) ejecuta npm run login para abrir Chromium e iniciar sesión manualmente.";

export class FanslyEngine {
  private requestContext: APIRequestContext | null = null;
  private browserContext: BrowserContext | null = null;
  private authHeaders: Record<string, string> = {};
  private ownAccountCache: FanslyAccount | null = null;
  private readonly options: FanslyEngineOptions;
  private readonly cache = new Map<string, { expires: number; data: unknown }>();
  private readonly cacheTtlMs = 30000;

  constructor(options: FanslyEngineOptions) {
    this.options = options;
  }

  get activeAccount(): FanslyAccountConfig {
    const found = this.options.accounts.find((a) => a.name === this.options.activeAccount);
    return found ?? this.options.accounts[0];
  }

  get mode(): "token" | "cdp" | "browser" {
    if (this.options.fanslyToken) return "token";
    return this.options.cdpUrl ? "cdp" : "browser";
  }

  private get currentCdpUrl(): string {
    return this.activeAccount.cdpUrl || this.options.cdpUrl;
  }

  async selectAccount(name: string): Promise<boolean> {
    const exists = this.options.accounts.some((a) => a.name === name);
    if (!exists) return false;
    this.options.activeAccount = name;
    await this.close();
    this.authHeaders = {};
    this.ownAccountCache = null;
    return true;
  }

  async listAccounts(): Promise<AccountStatus[]> {
    return Promise.all(
      this.options.accounts.map(async (account) => {
        const probe = await this.probeCdpAccount(account.cdpUrl);
        return {
          name: account.name,
          cdpUrl: account.cdpUrl,
          active: account.name === this.activeAccount.name,
          running: probe.running,
          session: probe.session,
        };
      })
    );
  }

  private async probeCdpAccount(cdpUrl: string): Promise<{ running: boolean; session: boolean }> {
    let browser: Browser | null = null;
    try {
      browser = await chromium.connectOverCDP(cdpUrl, { timeout: 3000 });
      for (const ctx of browser.contexts()) {
        for (const page of ctx.pages()) {
          if (!page.url().includes("fansly.com")) continue;
          const token = await this.readTokenNow(page);
          if (token) return { running: true, session: true };
        }
      }
      return { running: true, session: false };
    } catch {
      return { running: false, session: false };
    } finally {
      await browser?.close().catch(() => {});
    }
  }

  private async readTokenFromCdp(cdpUrl: string): Promise<string> {
    let browser: Browser | null = null;
    try {
      browser = await chromium.connectOverCDP(cdpUrl, { timeout: 3000 });
      for (const ctx of browser.contexts()) {
        for (const page of ctx.pages()) {
          if (!page.url().includes("fansly.com")) continue;
          const token = await this.readTokenNow(page);
          if (token) return token;
        }
      }
      return "";
    } catch {
      return "";
    } finally {
      await browser?.close().catch(() => {});
    }
  }

  private async hasCdpSession(cdpUrl: string): Promise<boolean> {
    return (await this.readTokenFromCdp(cdpUrl)) !== "";
  }

  async initSession(): Promise<void> {
    if (this.requestContext) return;
    if (this.mode === "token") {
      this.requestContext = await playwrightRequest.newContext();
      this.authHeaders = { authorization: this.options.fanslyToken };
      this.ownAccountCache = null;
      return;
    }
    if (this.mode === "cdp") {
      const result = await this.tryCdpSession();
      if (result === "not-running") {
        await ensureDebugChrome(portFromCdpUrl(this.currentCdpUrl), this.activeAccount.userDataDir);
        const retry = await this.tryCdpSession();
        if (retry === "ok") return;
        if (retry === "no-login") return;
      }
      if (result === "ok") return;
      if (result === "no-login") return;
    }
    await this.launchBrowser();
    await this.refreshSession();
  }

  async hasSession(): Promise<boolean> {
    if (this.authHeaders.authorization) return true;
    if (this.mode === "token") return Boolean(this.options.fanslyToken);
    if (this.mode === "cdp") {
      const token = await this.readTokenFromCdp(this.currentCdpUrl);
      if (token) {
        if (!this.requestContext) this.requestContext = await playwrightRequest.newContext();
        this.authHeaders = { authorization: token };
        return true;
      }
      return false;
    }
    return false;
  }

  private async tryCdpSession(): Promise<"ok" | "not-running" | "no-login"> {
    let browser: Browser;
    try {
      browser = await chromium.connectOverCDP(this.currentCdpUrl, { timeout: 3000 });
    } catch {
      return "not-running";
    }
    try {
      let token = await this.readTokenFromCdp(this.currentCdpUrl);
      if (!token) {
        const page = await this.findOrCreateFanslyPage(browser);
        if (!page) return "no-login";
        token = await this.waitForToken(page);
      }
      if (token) {
        if (!this.requestContext) this.requestContext = await playwrightRequest.newContext();
        this.authHeaders = { authorization: token };
        return "ok";
      }
      return "no-login";
    } finally {
      await browser.close().catch(() => {});
    }
  }

  private async findOrCreateFanslyPage(browser: Browser): Promise<Page | null> {
    const contexts = browser.contexts();
    for (const ctx of contexts) {
      for (const page of ctx.pages()) {
        if (page.url().includes("fansly.com")) return page;
      }
    }
    const ctx = contexts[0];
    if (!ctx) return null;
    const page = await ctx.newPage();
    await page
      .goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: this.options.requestTimeoutMs })
      .catch(() => {});
    return page;
  }

  private async readTokenNow(page: Page): Promise<string> {
    try {
      return await page.evaluate(readTokenFromStorage);
    } catch {
      return "";
    }
  }

  private async waitForToken(page: Page): Promise<string> {
    try {
      const handle = await page.waitForFunction(readTokenFromStorage, undefined, {
        timeout: this.options.loginWaitMs,
        polling: 1000,
      });
      const value = await handle.jsonValue();
      return typeof value === "string" ? value : "";
    } catch {
      return "";
    }
  }

  private async launchBrowser(): Promise<void> {
    this.cleanupStaleLocks();
    this.browserContext = await chromium.launchPersistentContext(this.options.userDataDir, {
      headless: this.options.headless,
      args: ["--disable-features=ServiceWorker"],
    });
    this.requestContext = this.browserContext.request;
  }

  private cleanupStaleLocks(): void {
    for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
      try {
        rmSync(join(this.options.userDataDir, name), { force: true });
      } catch {
        /* ignorar */
      }
    }
  }

  private async refreshSession(): Promise<void> {
    if (!this.browserContext) return;
    const page = await this.browserContext.newPage();
    try {
      await page.addInitScript(CLEAN_SESSION_SCRIPT);
      await page.goto(LOGIN_URL, {
        waitUntil: "domcontentloaded",
        timeout: this.options.requestTimeoutMs,
      });
      const token = await this.waitForToken(page);
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

  async getSubscriptions(): Promise<FanslySubscriptions> {
    return this.fetchApi<FanslySubscriptions>("/subscriptions?limit=50&offset=0");
  }

  async getPublicAccounts(ids: string[]): Promise<FanslyPublicAccount[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    const batches: string[][] = [];
    for (let i = 0; i < unique.length; i += 20) {
      batches.push(unique.slice(i, i + 20));
    }
    const results: FanslyPublicAccount[] = [];
    for (const batch of batches) {
      const idsParam = batch.map((id) => `ids=${encodeURIComponent(id)}`).join("&");
      const data = await this.fetchApi<FanslyPublicAccount[]>(`/account?${idsParam}`);
      results.push(...(Array.isArray(data) ? data : []));
    }
    return results;
  }

  async getAccountFollowers(accountId: string, limit = 100, offset = 0): Promise<string[]> {
    const data = await this.fetchApi<Array<{ followerId?: string }>>(
      `/account/${accountId}/followers?limit=${limit}&offset=${offset}`
    );
    return (Array.isArray(data) ? data : [])
      .map((item) => item.followerId)
      .filter((id): id is string => Boolean(id));
  }

  async getAccountFollowing(accountId: string, limit = 100, offset = 0): Promise<string[]> {
    const data = await this.fetchApi<Array<{ accountId?: string }>>(
      `/account/${accountId}/following?limit=${limit}&offset=${offset}`
    );
    return (Array.isArray(data) ? data : [])
      .map((item) => item.accountId)
      .filter((id): id is string => Boolean(id));
  }

  async getTimeline(
    accountId: string,
    options: { limit?: number; contentSearch?: string; fyp?: boolean } = {}
  ): Promise<FanslyTimelineResponse> {
    const { limit = 15, contentSearch = "", fyp = false } = options;
    const collected: FanslyPost[] = [];
    const merged: FanslyTimelineResponse = {};
    let before = 0;
    const maxPages = 5;

    for (let page = 0; page < maxPages; page++) {
      const chunk = await this.fetchApi<FanslyTimelineResponse>(
        `/timelinenew/${accountId}?before=${before}&after=0&wallId=&contentSearch=${encodeURIComponent(contentSearch)}${fyp ? "&fyp=1" : ""}`
      );
      const posts = chunk.posts ?? [];
      if (page === 0) {
        merged.accountMedia = chunk.accountMedia;
        merged.accountMediaBundles = chunk.accountMediaBundles;
        merged.accounts = chunk.accounts;
      }
      collected.push(...posts);
      if (collected.length >= limit || posts.length === 0) break;
      const oldest = posts[posts.length - 1]?.createdAt;
      const cursor = typeof oldest === "number" ? oldest : Number(oldest);
      if (!Number.isFinite(cursor) || cursor <= 0 || cursor === before) break;
      before = cursor;
    }

    return { ...merged, posts: collected.slice(0, limit) };
  }

  async getPostById(postId: string): Promise<FanslyPost | null> {
    try {
      const data = await this.fetchApi<{ post?: FanslyPost } | FanslyPost>(
        `/posts/${encodeURIComponent(postId)}`
      );
      const post = (data as { post?: FanslyPost }).post ?? (data as FanslyPost);
      return post && typeof post === "object" ? post : null;
    } catch {
      return null;
    }
  }

  async fetchApi<T = unknown>(path: string, opts: { noCache?: boolean } = {}): Promise<T> {
    await this.initSession();

    if (!this.authHeaders.authorization) {
      throw new Error(SESSION_NOT_FOUND_MESSAGE);
    }

    const cacheKey = `${this.currentCdpUrl}|${path}`;
    if (!opts.noCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.data as T;
      }
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
          if (this.mode === "token") {
            throw new Error(
              "El FANSLY_TOKEN es inválido o expiró. Obtén uno nuevo y actualízalo en .env."
            );
          }
          if (this.mode === "cdp") {
            const result = await this.tryCdpSession();
            if (result !== "ok") {
              throw new Error(
                "La sesión de Fansly expiró o es inválida. Inicia sesión en fansly.com en tu Chrome abierto (npm run chrome-cdp) y reintenta."
              );
            }
            continue;
          }
          await this.refreshSession();
          if (!this.authHeaders.authorization) {
            throw new Error(
              "La sesión de Fansly expiró o es inválida. Vuelve a iniciar sesión con npm run login o renueva FANSLY_TOKEN."
            );
          }
          continue;
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

        const result = (json?.response ?? json) as T;
        this.cache.set(cacheKey, { expires: Date.now() + this.cacheTtlMs, data: result });
        return result;
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
    this.cache.clear();
  }
}

export function createEngine(config: FanslyConfig): FanslyEngine {
  return new FanslyEngine({
    userDataDir: config.userDataDir,
    headless: config.engine.headless,
    fanslyToken: config.fanslyToken,
    cdpUrl: config.cdpUrl,
    accounts: config.accounts,
    activeAccount: config.activeAccount,
    loginWaitMs: config.loginWaitMs,
    maxRetries: config.engine.maxRetries,
    backoffBaseMs: config.engine.backoffBaseMs,
    requestTimeoutMs: config.engine.requestTimeoutMs,
  });
}
