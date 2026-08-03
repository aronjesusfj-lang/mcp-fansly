import type { FanslyAccount } from "../engine/fansly.js";

export const CONTENT_TYPES: Record<number, string> = {
  0: "texto",
  1: "imagen",
  2: "video",
  3: "audio",
};

export function resolveMediaType(media: { type?: unknown } | undefined): string {
  return CONTENT_TYPES[toNumber(media?.type)] ?? "desconocido";
}

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return Number((num / den).toFixed(2));
}

export function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function firstPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function toIso(value: number | string | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  const parsed = Number(value);
  if (!Number.isNaN(parsed) && /^\d+$/.test(value.trim())) {
    return new Date(parsed * 1000).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseHashtags(content: unknown): string[] {
  const text = typeof content === "string" ? content : "";
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return matches.map((tag) => tag.replace(/^#/, "").toLowerCase());
}

export interface CopyAnalysis {
  longitud: number;
  emojis: number;
  pregunta: boolean;
  cta: boolean;
  hashtags: string[];
}

export function analyzeCopy(content: unknown): CopyAnalysis {
  const text = safeText(content);
  const emojis = text.match(
    /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\u00a9|\u00ae|[\u2600-\u27bf])/gu
  );
  return {
    longitud: text.length,
    emojis: emojis?.length ?? 0,
    pregunta: /\?/.test(text),
    cta: /(dm|message|comenta|follow|sub|tip|link|compra)/i.test(text),
    hashtags: parseHashtags(text),
  };
}

export function mapTiers(account: FanslyAccount): Array<{
  id: string | null;
  nombre: string | null;
  precio_usd: number | null;
  max_subscriptores: number;
  planes: Array<{
    id: string | null;
    precio_usd: number | null;
    ciclo_dias: number | null;
    estado?: number | null;
  }>;
}> {
  return (account.subscriptionTiers ?? []).map((tier) => ({
    id: tier.id ?? null,
    nombre: tier.name ?? null,
    precio_usd: typeof tier.price === "number" ? tier.price / 1000 : null,
    max_subscriptores: tier.maxSubscribers ?? 0,
    planes: (tier.plans ?? []).map((plan) => ({
      id: plan.id ?? null,
      precio_usd: typeof plan.price === "number" ? plan.price / 1000 : null,
      ciclo_dias: plan.cycle ?? null,
      estado: plan.status ?? null,
    })),
  }));
}

export function mapWalls(account: FanslyAccount): Array<{
  id: string | null;
  nombre: string | null;
  es_defecto: boolean;
}> {
  return (account.walls ?? []).map((wall) => ({
    id: wall.id ?? null,
    nombre: wall.name ?? null,
    es_defecto: Boolean(wall.defaultWall),
  }));
}

export function mapProfileCompleto(account: FanslyAccount): Record<string, unknown> {
  const timelineStats = account.timelineStats ?? {};
  const stats = timelineStats as Record<string, unknown>;
  const wallet = (account.earningsWallet ?? {}) as Record<string, unknown>;
  const streaming = (account.streaming ?? {}) as Record<string, unknown>;
  return {
    perfil: {
      id: account.id ?? null,
      username: account.username ?? null,
      display_name: account.displayName ?? null,
    },
    seguidores: account.followCount ?? 0,
    subscriptores: account.subscriberCount ?? 0,
    total_gastado_30d: toNumber(account.totalSpent30),
    likes_posts: toNumber(account.postLikes),
    media_likes: toNumber(account.accountMediaLikes),
    ultima_actividad: account.lastSeenAt ?? null,
    contenido_total: {
      imagenes: stats.imageCount ?? 0,
      videos: stats.videoCount ?? 0,
      bundles: stats.bundleCount ?? 0,
      imagenes_bundle: stats.bundleImageCount ?? 0,
      videos_bundle: stats.bundleVideoCount ?? 0,
    },
    wallet_ganancias: toNumber(wallet.balance),
    redes_sociales: account.profileSocials ?? [],
    badges: account.profileBadges ?? [],
    posts_fijados: Array.isArray(account.pinnedPosts) ? account.pinnedPosts.length : 0,
    streaming: Boolean(streaming.enabled),
    tiers: mapTiers(account),
    muros: mapWalls(account),
  };
}

export function mapPublicAccount(account: Record<string, unknown>): Record<string, unknown> {
  const stats = (account.timelineStats ?? {}) as Record<string, unknown>;
  const tiers = Array.isArray(account.subscriptionTiers) ? account.subscriptionTiers : [];
  return {
    id: account.id ?? null,
    username: account.username ?? null,
    display_name: account.displayName ?? null,
    seguidores: account.followCount ?? 0,
    subscriptores: account.subscriberCount ?? 0,
    imagenes: stats.imageCount ?? 0,
    videos: stats.videoCount ?? 0,
    bundles: stats.bundleCount ?? 0,
    ultima_actividad: account.lastSeenAt ?? 0,
    tiers: tiers.map((raw) => {
      const tier = (raw ?? {}) as Record<string, unknown>;
      return {
        id: tier.id ?? null,
        nombre: tier.name ?? null,
        precio_usd: typeof tier.price === "number" ? tier.price / 1000 : null,
      };
    }),
  };
}
