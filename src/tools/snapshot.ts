import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";
import { parseHashtags, toNumber } from "./helpers.js";
import type { FanslyPost, FanslyTimelineMedia } from "../engine/fansly.js";

const CONTENT_TYPES: Record<number, string> = {
  0: "texto",
  1: "imagen",
  2: "video",
  3: "audio",
};

function resolveType(item: FanslyTimelineMedia): string {
  return CONTENT_TYPES[toNumber(item.media?.type)] ?? "desconocido";
}

export function registerSnapshotTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "snapshot_diario",
    {
      title: "Snapshot diario orquestado",
      description:
        "Ejecuta el pipeline completo de captura: perfil, suscriptores, posts, hashtags, caja fuerte y competidores. Persiste todo en SQLite.",
      inputSchema: z.object({
        incluir_competidores: z.boolean().optional().describe("Actualizar también snapshots de competidores"),
      }),
    },
    async ({ incluir_competidores }) => {
      const today = new Date().toISOString().slice(0, 10);
      const account = await deps.engine.getOwnAccount();

      deps.repository.upsertDailySnapshot({
        date: today,
        total_followers: account.followCount ?? 0,
        active_subscribers: account.subscriberCount ?? 0,
        gross_earnings: 0,
        churned_subscribers: 0,
      });

      let subs: Record<string, unknown> = {};
      try {
        const subscriptions = await deps.engine.getSubscriptions();
        const stats = subscriptions.stats ?? {};
        subs = {
          activos: stats.totalActive ?? 0,
          vencidos: stats.totalExpired ?? 0,
          total: stats.total ?? 0,
        };
        deps.repository.upsertSubscribers({
          date: today,
          total_active: stats.totalActive ?? 0,
          total_expired: stats.totalExpired ?? 0,
          total: stats.total ?? 0,
        });
      } catch {
        subs = { error: "no disponible" };
      }

      const timeline = await deps.engine.getTimeline(account.id ?? "", { limit: 50 });
      const mediaTypes = new Map<string, string>();
      for (const item of timeline.accountMedia ?? []) {
        const id = typeof item.id === "string" ? item.id : "";
        if (id) mediaTypes.set(id, resolveType(item));
      }

      const posts = (timeline.posts ?? []).map((post: FanslyPost) => ({
        id: typeof post.id === "string" ? post.id : "",
        likes: toNumber(post.likeCount),
        media_likes: toNumber(post.mediaLikeCount),
        tips: toNumber(post.totalTipAmount),
        fyp_flags: toNumber(post.fypFlags),
        content_type: (post.attachments ?? []).length > 0
          ? (mediaTypes.get(typeof post.attachments?.[0]?.contentId === "string" ? post.attachments[0].contentId : "") ?? "desconocido")
          : "texto",
        hashtags: parseHashtags(post.content),
        created_at:
          typeof post.createdAt === "number"
            ? new Date(post.createdAt * 1000).toISOString()
            : typeof post.createdAt === "string"
              ? new Date(Number(post.createdAt) * 1000).toISOString()
              : new Date().toISOString(),
      }));

      for (const post of posts) {
        deps.repository.upsertPostMetrics({
          post_id: post.id,
          media_type: post.content_type,
          likes_count: post.likes,
          media_likes_count: post.media_likes,
          tips_amount: post.tips,
          unlocks_count: 0,
          posted_at: post.created_at,
        });
        deps.repository.upsertPostMetricHistory({
          post_id: post.id,
          date: today,
          likes_count: post.likes,
          media_likes_count: post.media_likes,
          tips_amount: post.tips,
          unlocks_count: 0,
          content_type: post.content_type,
        });
        deps.repository.upsertPostHistory({
          post_id: post.id,
          status: "activo",
          first_seen: today,
        });
        deps.repository.upsertFypTracker({
          post_id: post.id,
          date: today,
          fyp_flags: post.fyp_flags,
          likes: post.likes,
          media_likes: post.media_likes,
          tips: post.tips,
        });
        for (const tag of post.hashtags) {
          deps.repository.upsertHashtagMetric({
            hashtag: tag,
            date: today,
            post_count: 1,
            likes: post.likes,
            media_likes: post.media_likes,
            tips: post.tips,
          });
        }
      }

      let vault = 0;
      try {
        const wallId = account.walls?.[0]?.id ?? "";
        const data = await deps.engine.fetchApi<{ data?: Array<Record<string, unknown>> }>(
          `/mediaoffers/location?locationId=${encodeURIComponent(wallId)}&locationType=1002&accountId=${encodeURIComponent(account.id ?? "")}&mediaType=&before=&after=0&limit=50&offset=0`,
          { noCache: true }
        );
        vault = (data.data ?? []).length;
        for (const item of data.data ?? []) {
          deps.repository.upsertVaultMedia({
            media_id: String(item.id ?? ""),
            media_type: String(item.mediaType ?? "desconocido"),
            price: toNumber(item.price),
            permission_flags: toNumber(item.permissionFlags),
            likes: toNumber(item.likeCount),
            posted_at:
              typeof item.createdAt === "number"
                ? new Date(item.createdAt * 1000).toISOString()
                : new Date().toISOString(),
          });
        }
      } catch {
        vault = 0;
      }

      let competidores = 0;
      if (incluir_competidores) {
        const competitors = deps.repository.getCompetitors();
        for (const competitor of competitors) {
          try {
            const profiles = await deps.engine.getPublicAccounts([competitor.account_id]);
            const profile = profiles[0];
            if (!profile) continue;
            const stats = profile.timelineStats ?? {};
            deps.repository.upsertCompetitorSnapshot({
              account_id: competitor.account_id,
              date: today,
              follow_count: profile.followCount ?? 0,
              subscriber_count: profile.subscriberCount ?? 0,
              image_count: stats.imageCount ?? 0,
              video_count: stats.videoCount ?? 0,
              bundle_count: stats.bundleCount ?? 0,
            });
            competidores += 1;
          } catch {
            continue;
          }
        }
      }

      const resumen = {
        fecha: today,
        perfil: {
          seguidores: account.followCount ?? 0,
          subscriptores: account.subscriberCount ?? 0,
        },
        suscripciones: subs,
        posts_capturados: posts.length,
        media_vault: vault,
        competidores_actualizados: competidores,
        estado: "Snapshot diario completado y persistido en SQLite.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );
}
