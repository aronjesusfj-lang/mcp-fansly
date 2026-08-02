import type { FanslyAccount } from "../engine/fansly.js";

export function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
      email: account.email ?? null,
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
  };
}
