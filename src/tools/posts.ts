import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";
import type { FanslyPost } from "../engine/fansly.js";

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapPost(post: FanslyPost): {
  id: string;
  likes: number;
  comentarios: number;
  tips: number;
  created_at: string | null;
} {
  return {
    id: safeText(post.id),
    likes: Number(post.likeCount) || 0,
    comentarios: Number(post.commentCount) || 0,
    tips: Number(post.totalTips) || 0,
    created_at: typeof post.createdAt === "string" ? post.createdAt : null,
  };
}

function buildHeatMatrix(posts: FanslyPost[]): number[][] {
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const post of posts) {
    if (typeof post.createdAt !== "string") continue;
    const date = new Date(post.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    matrix[day][hour] += 1;
  }
  return matrix;
}

export function registerPostsTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "analizar_rendimiento_posts",
    {
      title: "Rendimiento de publicaciones",
      description:
        "Extrae likes, comentarios y propinas de las publicaciones recientes del propio timeline (timelinenew) y las persiste en SQLite.",
      inputSchema: z.object({
        limite: z.number().int().min(1).max(100).optional().describe("Límite de publicaciones a extraer"),
      }),
    },
    async ({ limite }) => {
      const limit = limite ?? 10;
      const account = await deps.engine.getOwnAccount();
      const timeline = await deps.engine.fetchApi<{ posts?: FanslyPost[] }>(
        `/timelinenew/${account.id}?before=0&after=0&wallId=&contentSearch=`
      );
      const posts = (timeline.posts ?? []).slice(0, limit).map(mapPost);

      for (const post of posts) {
        deps.repository.upsertPostMetrics({
          post_id: post.id,
          media_type: "desconocido",
          likes_count: post.likes,
          tips_amount: post.tips,
          unlocks_count: 0,
          posted_at: post.created_at ?? new Date().toISOString(),
        });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(posts) }],
        structuredContent: posts,
      };
    }
  );

  server.registerTool(
    "obtener_tendencias_hashtag",
    {
      title: "Tendencias de hashtag",
      description:
        "Busca publicaciones propias cuyo contenido incluya el hashtag (contentSearch en timelinenew) y resume interacción acumulada.",
      inputSchema: z.object({
        hashtag: z.string().min(1).max(64).describe("Hashtag objetivo sin el símbolo #"),
      }),
    },
    async ({ hashtag }) => {
      const tag = String(hashtag).replace(/^#/, "").trim();
      const account = await deps.engine.getOwnAccount();
      const timeline = await deps.engine.fetchApi<{ posts?: FanslyPost[] }>(
        `/timelinenew/${account.id}?before=0&after=0&wallId=&contentSearch=${encodeURIComponent(tag)}`
      );
      const posts = (timeline.posts ?? []).map(mapPost);
      const resumen = {
        hashtag: tag,
        total_publicaciones: posts.length,
        likes_acumulados: posts.reduce((sum, p) => sum + p.likes, 0),
        comentarios_acumulados: posts.reduce((sum, p) => sum + p.comentarios, 0),
        tips_acumulados: posts.reduce((sum, p) => sum + p.tips, 0),
        publicaciones: posts,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "generar_mapa_calor_horario",
    {
      title: "Mapa de calor horario",
      description:
        "Extrae las publicaciones del propio timeline y genera una matriz 7x24 con el volumen de publicaciones por hora/día.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const account = await deps.engine.getOwnAccount();
      const timeline = await deps.engine.fetchApi<{ posts?: FanslyPost[] }>(
        `/timelinenew/${account.id}?before=0&after=0&wallId=&contentSearch=`
      );
      const posts = timeline.posts ?? [];
      const matriz = buildHeatMatrix(posts);
      const resultado = { estado: "Matriz procesada", matriz_7x24: matriz };
      return {
        content: [{ type: "text", text: JSON.stringify(resultado) }],
        structuredContent: resultado,
      };
    }
  );
}
