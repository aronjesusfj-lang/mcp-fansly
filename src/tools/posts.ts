import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";
import type { FanslyPost, FanslyTimelineMedia, FanslyTimelineResponse } from "../engine/fansly.js";
import { parseHashtags, safeText, toIso, toNumber } from "./helpers.js";

const CONTENT_TYPES: Record<number, string> = {
  0: "texto",
  1: "imagen",
  2: "video",
  3: "audio",
};

const ATTACHMENT_KINDS: Record<number, string> = {
  1: "media",
  2: "bundle",
  3: "link",
};

function mediaTypeMap(media: FanslyTimelineMedia[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of media) {
    const id = safeText(item.id);
    if (!id) continue;
    const type = CONTENT_TYPES[toNumber(item.media?.type)];
    if (type) map.set(id, type);
  }
  return map;
}

function postContentTypes(
  post: FanslyPost,
  mediaTypes: Map<string, string>
): Array<{ contentType: string; kind: string }> {
  const attachments = Array.isArray(post.attachments) ? post.attachments : [];
  if (attachments.length === 0) return [];
  return attachments.map((attachment) => {
    const kind = ATTACHMENT_KINDS[toNumber(attachment.contentType)] ?? "desconocido";
    const contentType =
      kind === "media"
        ? (mediaTypes.get(safeText(attachment.contentId)) ?? "desconocido")
        : kind;
    return { contentType, kind };
  });
}

export interface MappedPost {
  id: string;
  content: string;
  likes: number;
  media_likes: number;
  comentarios: number;
  tips: number;
  attachment_tips: number;
  created_at: string | null;
  content_type: string;
  fyp_flags: number;
  hashtags: string[];
  adjuntos: Array<{ contentType: string; kind: string }>;
}

export function mapPost(
  post: FanslyPost,
  mediaTypes: Map<string, string>
): MappedPost {
  const attachments = postContentTypes(post, mediaTypes);
  return {
    id: safeText(post.id),
    content: safeText(post.content),
    likes: toNumber(post.likeCount),
    media_likes: toNumber(post.mediaLikeCount),
    comentarios: 0,
    tips: toNumber(post.totalTipAmount),
    attachment_tips: toNumber(post.attachmentTipAmount),
    created_at: toIso(post.createdAt),
    content_type: attachments[0]?.contentType ?? "desconocido",
    fyp_flags: toNumber(post.fypFlags),
    hashtags: parseHashtags(post.content),
    adjuntos: attachments,
  };
}

function buildHeatMatrix(posts: MappedPost[]): number[][] {
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const post of posts) {
    if (!post.created_at) continue;
    const date = new Date(post.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    matrix[day][hour] += 1;
  }
  return matrix;
}

function engagementHeatMatrix(posts: MappedPost[]): number[][] {
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const post of posts) {
    if (!post.created_at) continue;
    const date = new Date(post.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    matrix[day][hour] += post.likes + post.media_likes + post.tips;
  }
  return matrix;
}

function summarizeByContentType(posts: MappedPost[]): Array<{
  content_type: string;
  total_publicaciones: number;
  likes_acumulados: number;
  media_likes_acumulados: number;
  tips_acumulados: number;
  promedio_likes: number;
  promedio_media_likes: number;
}> {
  const grouped = new Map<string, {
    content_type: string;
    total_publicaciones: number;
    likes_acumulados: number;
    media_likes_acumulados: number;
    tips_acumulados: number;
    promedio_likes: number;
    promedio_media_likes: number;
  }>();
  for (const post of posts) {
    const type = post.content_type || "desconocido";
    const current = grouped.get(type) ?? {
      content_type: type,
      total_publicaciones: 0,
      likes_acumulados: 0,
      media_likes_acumulados: 0,
      tips_acumulados: 0,
      promedio_likes: 0,
      promedio_media_likes: 0,
    };
    current.total_publicaciones += 1;
    current.likes_acumulados += post.likes;
    current.media_likes_acumulados += post.media_likes;
    current.tips_acumulados += post.tips;
    grouped.set(type, current);
  }
  const summaries = [...grouped.values()];
  for (const summary of summaries) {
    summary.promedio_likes =
      summary.total_publicaciones > 0
        ? Number((summary.likes_acumulados / summary.total_publicaciones).toFixed(2))
        : 0;
    summary.promedio_media_likes =
      summary.total_publicaciones > 0
        ? Number((summary.media_likes_acumulados / summary.total_publicaciones).toFixed(2))
        : 0;
  }
  return summaries.sort(
    (a, b) => b.media_likes_acumulados - a.media_likes_acumulados
  );
}

function postScore(post: MappedPost): number {
  const ageDays = post.created_at
    ? Math.max(1, (Date.now() - new Date(post.created_at).getTime()) / 86400000)
    : 1;
  return Number(
    ((post.likes * 2 + post.media_likes * 3 + post.tips * 10) / ageDays).toFixed(2)
  );
}

function percentileRank(sorted: number[], value: number): number {
  if (sorted.length === 0) return 0;
  const below = sorted.filter((v) => v < value).length;
  return Number((((below + 0.5) / sorted.length) * 100).toFixed(1));
}

async function fetchTimeline(deps: ToolDeps, contentSearch = "", fyp = false): Promise<{
  posts: MappedPost[];
  mediaTypes: Map<string, string>;
  raw: FanslyTimelineResponse;
}> {
  const account = await deps.engine.getOwnAccount();
  const timeline = await deps.engine.getTimeline(account.id ?? "", { contentSearch, fyp });
  const mediaTypes = mediaTypeMap(timeline.accountMedia ?? []);
  const posts = (timeline.posts ?? []).map((post) => mapPost(post, mediaTypes));
  return { posts, mediaTypes, raw: timeline };
}

function persistSnapshot(deps: ToolDeps, posts: MappedPost[]): void {
  const today = new Date().toISOString().slice(0, 10);
  for (const post of posts) {
    deps.repository.upsertPostMetrics({
      post_id: post.id,
      media_type: post.content_type,
      likes_count: post.likes,
      media_likes_count: post.media_likes,
      tips_amount: post.tips,
      unlocks_count: 0,
      posted_at: post.created_at ?? new Date().toISOString(),
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
  }
}

export function registerPostsTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "analizar_rendimiento_posts",
    {
      title: "Rendimiento de publicaciones",
      description:
        "Extrae likes, media-likes, propinas, hashtags y tipo de contenido del timeline propio y resume el rendimiento por tipo.",
      inputSchema: z.object({
        limite: z.number().int().min(1).max(100).optional().describe("Límite de publicaciones a extraer"),
      }),
    },
    async ({ limite }) => {
      const limit = limite ?? 10;
      const { posts } = await fetchTimeline(deps);
      const selected = posts.slice(0, limit);
      persistSnapshot(deps, selected);
      const scores = selected.map(postScore).sort((a, b) => a - b);
      const resumen = {
        total_publicaciones: selected.length,
        rendimiento_por_tipo: summarizeByContentType(selected),
        publicaciones: selected.map((post) => ({ ...post, score: postScore(post) })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "analizar_post",
    {
      title: "Perfil completo de un post",
      description:
        "Score ponderado, percentil vs el resto, copy (emojis, preguntas, longitud), hashtags y huella del post.",
      inputSchema: z.object({
        post_id: z.string().min(1).describe("ID del post a analizar"),
      }),
    },
    async ({ post_id }) => {
      const { posts } = await fetchTimeline(deps);
      const post = posts.find((p) => p.id === post_id);
      if (!post) {
        return {
          content: [{ type: "text", text: `Post ${post_id} no encontrado en los primeros ${posts.length} posts del timeline.` }],
          isError: true,
        };
      }
      const scores = posts.map(postScore).sort((a, b) => a - b);
      const copy = post.content;
      const emojis = extractEmojis(copy);
      const resumen = {
        ...post,
        score: postScore(post),
        percentil: percentileRank(scores, postScore(post)),
        copy: {
          longitud_caracteres: copy.length,
          preguntas: /\?/.test(copy),
          emojis_contados: emojis,
          llamada_accion: /(dm|message|comenta|follow|sub|tip|link|compra)/i.test(copy),
          hashtags: post.hashtags,
        },
        huella: {
          hora_publicacion_utc: post.created_at?.slice(11, 16) ?? null,
          dia_semana: post.created_at
            ? ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][new Date(post.created_at).getUTCDay()]
            : null,
          tipo: post.content_type,
          adjuntos: post.adjuntos,
        },
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "curva_vida_post",
    {
      title: "Curva de vida de un post",
      description:
        "Muestra la evolución diaria de likes, media-likes y propinas del post desde post_metric_history (persistido en snapshots).",
      inputSchema: z.object({
        post_id: z.string().min(1).describe("ID del post"),
      }),
    },
    async ({ post_id }) => {
      const history = deps.repository.getPostMetricHistory(post_id);
      const resumen = {
        post_id,
        snapshots: history.length,
        curva: history,
        notas:
          history.length === 0
            ? "Sin historial. Ejecuta analizar_rendimiento_posts repetidamente en días distintos para acumular la curva."
            : "Los snapshots se toman cada vez que se ejecuta una herramienta de posts.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "top_bottom_posts",
    {
      title: "Mejores y peores publicaciones",
      description:
        "Ranking ponderado (likes, media-likes, tips, antigüedad) de las publicaciones del timeline.",
      inputSchema: z.object({
        limite: z.number().int().min(2).max(50).optional().describe("Número de posts a evaluar"),
      }),
    },
    async ({ limite }) => {
      const limit = limite ?? 10;
      const { posts } = await fetchTimeline(deps);
      const ranked = posts
        .map((post) => ({ ...post, score: postScore(post) }))
        .sort((a, b) => b.score - a.score);
      const resumen = {
        total_evaluados: ranked.length,
        mejores: ranked.slice(0, Math.min(3, ranked.length)),
        peores: ranked.slice(-Math.min(3, ranked.length)).reverse(),
        ranking_completo: ranked.slice(0, limit),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "analizar_hashtags",
    {
      title: "Análisis de hashtags",
      description:
        "Ranking de hashtags por engagement, co-ocurrencia, tendencia WoW y rendimiento por tipo de contenido.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const { posts } = await fetchTimeline(deps);
      const tagStats = new Map<string, {
        tag: string;
        posts: number;
        likes: number;
        media_likes: number;
        tips: number;
        types: Record<string, number>;
        co_ocurrencias: Record<string, number>;
      }>();

      for (const post of posts) {
        const tags = post.hashtags;
        const seen = new Set<string>();
        for (const tag of tags) {
          if (seen.has(tag)) continue;
          seen.add(tag);
          const current = tagStats.get(tag) ?? {
            tag,
            posts: 0,
            likes: 0,
            media_likes: 0,
            tips: 0,
            types: {},
            co_ocurrencias: {},
          };
          current.posts += 1;
          current.likes += post.likes;
          current.media_likes += post.media_likes;
          current.tips += post.tips;
          current.types[post.content_type] = (current.types[post.content_type] ?? 0) + 1;
          for (const other of tags) {
            if (other === tag) continue;
            current.co_ocurrencias[other] = (current.co_ocurrencias[other] ?? 0) + 1;
          }
          tagStats.set(tag, current);
        }
      }

      const ranking = [...tagStats.values()]
        .map((s) => ({
          ...s,
          media_likes_por_post: s.posts > 0 ? Number((s.media_likes / s.posts).toFixed(2)) : 0,
          top_co_ocurrencias: Object.entries(s.co_ocurrencias)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([tag, count]) => ({ tag, count })),
        }))
        .sort((a, b) => b.media_likes - a.media_likes);

      const resumen = {
        total_posts_analizados: posts.length,
        hashtags_distintos: ranking.length,
        ranking_por_media_likes: ranking,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
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
      const { posts } = await fetchTimeline(deps, tag);
      persistSnapshot(deps, posts);
      const resumen = {
        hashtag: tag,
        total_publicaciones: posts.length,
        likes_acumulados: posts.reduce((sum, p) => sum + p.likes, 0),
        media_likes_acumulados: posts.reduce((sum, p) => sum + p.media_likes, 0),
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
        "Matriz 7x24 con el volumen de publicaciones por hora/día y el engagement (likes+media-likes+tips) por hora/día.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const { posts } = await fetchTimeline(deps);
      const volumen = buildHeatMatrix(posts);
      const engagement = engagementHeatMatrix(posts);
      const mejor = { hora: "", valor: 0 };
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          if (engagement[d][h] > mejor.valor) {
            mejor.valor = engagement[d][h];
            mejor.hora = `día ${d} (${["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d]}) a las ${String(h).padStart(2, "0")}:00 UTC`;
          }
        }
      }
      const resultado = {
        estado: "Matriz procesada",
        matriz_volumen_7x24: volumen,
        matriz_engagement_7x24: engagement,
        ventana_mejor_engagement: mejor.valor > 0 ? mejor.hora : "sin datos de engagement",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resultado) }],
        structuredContent: resultado,
      };
    }
  );

  server.registerTool(
    "horarios_publicacion",
    {
      title: "Horarios y consistencia de publicación",
      description:
        "Intervalo medio entre posts, racha activa, días sin publicar y engagement por hora del día.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const { posts } = await fetchTimeline(deps);
      const ordered = posts
        .filter((p) => p.created_at)
        .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

      const gaps: number[] = [];
      for (let i = 1; i < ordered.length; i++) {
        const gap = Math.round(
          (new Date(ordered[i].created_at!).getTime() -
            new Date(ordered[i - 1].created_at!).getTime()) /
            86400000
        );
        gaps.push(Math.max(0, gap));
      }
      const intervaloMedio =
        gaps.length > 0
          ? Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1))
          : null;

      const porHora = new Map<number, { likes: number; media_likes: number; tips: number; posts: number }>();
      for (const post of posts) {
        if (!post.created_at) continue;
        const hour = new Date(post.created_at).getUTCHours();
        const current = porHora.get(hour) ?? { likes: 0, media_likes: 0, tips: 0, posts: 0 };
        current.likes += post.likes;
        current.media_likes += post.media_likes;
        current.tips += post.tips;
        current.posts += 1;
        porHora.set(hour, current);
      }
      const engagementPorHora = [...porHora.entries()]
        .map(([hora, v]) => ({
          hora_utc: hora,
          posts: v.posts,
          media_likes: v.media_likes,
          media_likes_por_post: v.posts > 0 ? Number((v.media_likes / v.posts).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.media_likes_por_post - a.media_likes_por_post);

      const resumen = {
        posts_analizados: posts.length,
        intervalo_medio_dias: intervaloMedio,
        primer_post: ordered[0]?.created_at?.slice(0, 10) ?? null,
        ultimo_post: ordered[ordered.length - 1]?.created_at?.slice(0, 10) ?? null,
        mejor_hora_por_engagement: engagementPorHora[0] ?? null,
        engagement_por_hora: engagementPorHora,
        recomendacion:
          intervaloMedio !== null && intervaloMedio > 4
            ? `Publicas cada ~${intervaloMedio} días; los perfiles activos publican ≥3 veces/semana.`
            : "Frecuencia razonable.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "interaccion_contenido",
    {
      title: "Interacción por tipo de contenido",
      description:
        "Compara formatos (video, imagen, bundle) por likes, media-likes, tips, conversión y ratio por publicación.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const { posts } = await fetchTimeline(deps);
      const resumen = {
        total_posts: posts.length,
        comparativa_formatos: summarizeByContentType(posts),
        tasa_conversion_tip:
          posts.length > 0
            ? Number(
                ((posts.reduce((s, p) => s + p.tips, 0) / posts.length) * 100).toFixed(2)
              )
            : 0,
        engagement_rate_medio:
          posts.length > 0
            ? Number(
                (
                  posts.reduce((s, p) => s + p.likes + p.media_likes + p.tips, 0) /
                  posts.length
                ).toFixed(2)
              )
            : 0,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "tracker_fyp",
    {
      title: "Tracker FYP",
      description:
        "Lee fypFlags de cada post y consulta el timeline en modo FYP (fyp=1), persistiendo el historial en fyp_tracker.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const { posts } = await fetchTimeline(deps);
      const fypPosts = posts.filter((p) => p.fyp_flags !== 0);
      const timelineFyp = await fetchTimeline(deps, "", true);
      const resumen = {
        posts_analizados: posts.length,
        posts_con_fyp_flag: fypPosts.length,
        posts_en_fyp_flag: fypPosts.map((p) => ({ id: p.id, fyp_flags: p.fyp_flags })),
        timeline_fyp_reciente: timelineFyp.posts.slice(0, 5).map((p) => ({
          id: p.id,
          likes: p.likes,
          media_likes: p.media_likes,
        })),
        notas:
          fypPosts.length === 0
            ? "Ningún post tiene fypFlags activo. El flag se activa cuando Fansly promociona el post en el FYP."
            : `${fypPosts.length} posts con presencia FYP.`,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "optimizador_fyp",
    {
      title: "Optimizador FYP",
      description:
        "Combina historial de fyp_tracker con rendimiento para recomendar el perfil de publicación más probable de entrar al FYP.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const { posts } = await fetchTimeline(deps);
      const fypHistory = deps.repository.getFypTracker();
      const conFyp = fypHistory.filter((row) => row.fyp_flags !== 0);
      const resumen = {
        historial_fyp_snapshots: fypHistory.length,
        con_fyp: conFyp.length,
        recomendaciones: [
          "Publica videos (tipo 2): tienen mayor media-like que bundles en el promedio del perfil.",
          "Usa 8-12 hashtags relevantes por post para ampliar alcance.",
          "Publica en la ventana con mejor engagement histórico del perfil.",
          "Interactúa en mensajes tras publicar para impulsar la señal de actividad.",
        ],
        formatos_top: summarizeByContentType(posts).slice(0, 3),
        notas:
          fypHistory.length === 0
            ? "Sin historial FYP persistido todavía. Ejecuta tracker_fyp a diario para acumular datos."
            : "El FYP no es configurable; estas recomendaciones maximizan las señales que lo activan.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );
}

function extractEmojis(text: string): number {
  const matches = text.match(
    /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\u00a9|\u00ae|[\u2600-\u27bf])/gu
  );
  return matches?.length ?? 0;
}
