import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";
import { analyzeCopy, mapPublicAccount, parseHashtags, toNumber } from "./helpers.js";
import { mapPost, type MappedPost } from "./posts.js";

function classifyNiche(followers: number): string {
  if (followers < 1000) return "micro";
  if (followers < 10000) return "mid";
  return "top";
}

function daysSince(ts: number): number | null {
  if (!ts || ts <= 0) return null;
  return Math.floor((Date.now() - ts) / 86400000);
}

async function fetchCompetitorTimelinePosts(
  deps: ToolDeps,
  accountId: string,
  limit = 25
): Promise<MappedPost[]> {
  try {
    const timeline = await deps.engine.getTimeline(accountId, { limit });
    return (timeline.posts ?? []).map((post) => mapPost(post, new Map()));
  } catch {
    return [];
  }
}

function persistCompetitorHashtags(deps: ToolDeps, accountId: string, posts: MappedPost[]): void {
  const today = new Date().toISOString().slice(0, 10);
  deps.repository.runInTransaction(() => {
    for (const post of posts) {
      for (const tag of new Set(post.hashtags)) {
        deps.repository.upsertCompetitorHashtag(accountId, tag, today, 1);
      }
    }
  });
}

function summarizeCopy(posts: MappedPost[]): {
  posts: number;
  longitud_media: number;
  emojis_medio: number;
  pct_preguntas: number;
  pct_cta: number;
  hashtags_por_post: number;
} {
  if (posts.length === 0) {
    return { posts: 0, longitud_media: 0, emojis_medio: 0, pct_preguntas: 0, pct_cta: 0, hashtags_por_post: 0 };
  }
  let longitud = 0;
  let emojis = 0;
  let preguntas = 0;
  let cta = 0;
  let hashtags = 0;
  for (const post of posts) {
    const analysis = analyzeCopy(post.content);
    longitud += analysis.longitud;
    emojis += analysis.emojis;
    if (analysis.pregunta) preguntas += 1;
    if (analysis.cta) cta += 1;
    hashtags += analysis.hashtags.length;
  }
  const n = posts.length;
  return {
    posts: n,
    longitud_media: Number((longitud / n).toFixed(1)),
    emojis_medio: Number((emojis / n).toFixed(2)),
    pct_preguntas: Number(((preguntas / n) * 100).toFixed(1)),
    pct_cta: Number(((cta / n) * 100).toFixed(1)),
    hashtags_por_post: Number((hashtags / n).toFixed(1)),
  };
}

export function registerCompetitorsTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "descubrir_competidores",
    {
      title: "Descubrir competidores",
      description:
        "Escanea seguidores/seguidos de cuentas de referencia y detecta perfiles que son creadoras (timelineStats > 0).",
      inputSchema: z.object({
        cuenta_id: z.string().optional().describe("ID de cuenta de referencia (por defecto la activa)"),
        limite: z.number().int().min(5).max(100).optional().describe("Cuántos perfiles escanear"),
      }),
    },
    async ({ cuenta_id, limite }) => {
      const limit = limite ?? 50;
      const account = await deps.engine.getOwnAccount();
      const refId = cuenta_id ?? account.id ?? "";
      const followers = await deps.engine.getAccountFollowers(refId, limit, 0);
      const following = await deps.engine.getAccountFollowing(refId, limit, 0);
      const candidates = [...new Set([...followers, ...following])].slice(0, limit);
      const profiles = await deps.engine.getPublicAccounts(candidates);
      const creadoras = profiles.filter((p) => {
        const stats = p.timelineStats ?? {};
        return (stats.imageCount ?? 0) + (stats.videoCount ?? 0) + (stats.bundleCount ?? 0) > 0;
      });

      const resumen = {
        cuenta_referencia: refId,
        perfiles_escaneados: profiles.length,
        creadoras_detectadas: creadoras.map((p) => ({
          id: p.id,
          username: p.username,
          seguidores: p.followCount ?? 0,
          subscriptores: p.subscriberCount ?? 0,
          contenido: (p.timelineStats?.imageCount ?? 0) + (p.timelineStats?.videoCount ?? 0),
          niche: classifyNiche(p.followCount ?? 0),
        })),
        notas:
          creadoras.length === 0
            ? "Sin creadoras en la red escaneada. Prueba con otra cuenta de referencia o amplía el límite."
            : "Usa registrar_competidor para añadirlos a la base de seguimiento.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "registrar_competidor",
    {
      title: "Registrar competidor",
      description:
        "Añade (o refresca) un competidor por ID o username y captura su snapshot inicial en SQLite.",
      inputSchema: z.object({
        account_id: z.string().min(1).describe("ID de la cuenta (o username si no hay ID)"),
      }),
    },
    async ({ account_id }) => {
      const profiles = await deps.engine.getPublicAccounts([account_id]);
      const profile = profiles[0];
      if (!profile) {
        return {
          content: [{ type: "text", text: `No se pudo obtener el perfil público de "${account_id}".` }],
          isError: true,
        };
      }
      const stats = profile.timelineStats ?? {};
      deps.repository.upsertCompetitor({
        account_id: profile.id ?? account_id,
        username: profile.username ?? "",
        display_name: profile.displayName ?? "",
        follow_count: profile.followCount ?? 0,
        subscriber_count: profile.subscriberCount ?? 0,
        image_count: stats.imageCount ?? 0,
        video_count: stats.videoCount ?? 0,
        bundle_count: stats.bundleCount ?? 0,
        last_seen_at: profile.lastSeenAt ?? 0,
        niche: classifyNiche(profile.followCount ?? 0),
        active: 1,
      });
      const today = new Date().toISOString().slice(0, 10);
      deps.repository.upsertCompetitorSnapshot({
        account_id: profile.id ?? account_id,
        date: today,
        follow_count: profile.followCount ?? 0,
        subscriber_count: profile.subscriberCount ?? 0,
        image_count: stats.imageCount ?? 0,
        video_count: stats.videoCount ?? 0,
        bundle_count: stats.bundleCount ?? 0,
      });

      const posts = await fetchCompetitorTimelinePosts(deps, profile.id ?? account_id);
      if (posts.length > 0) {
        persistCompetitorHashtags(deps, profile.id ?? account_id, posts);
      }
      const porHora = new Map<number, number>();
      for (const post of posts) {
        if (!post.created_at) continue;
        const hora = new Date(post.created_at).getUTCHours();
        porHora.set(hora, (porHora.get(hora) ?? 0) + 1);
      }
      const horarios_top = [...porHora.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([hora_utc, n]) => ({ hora_utc, posts: n }));

      const resumen = {
        ...mapPublicAccount(profile),
        posts_recientes_analizados: posts.length,
        horarios_publicacion_top: horarios_top,
        hashtags_registrados: new Set(posts.flatMap((p) => p.hashtags)).size,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "eliminar_competidor",
    {
      title: "Eliminar competidor",
      description:
        "Quita un competidor de la base de seguimiento.",
      inputSchema: z.object({
        account_id: z.string().min(1).describe("ID de la cuenta"),
      }),
    },
    async ({ account_id }) => {
      deps.repository.removeCompetitor(account_id);
      return {
        content: [{ type: "text", text: `Competidor ${account_id} eliminado.` }],
        structuredContent: { eliminado: account_id },
      };
    }
  );

  server.registerTool(
    "snapshot_competidores",
    {
      title: "Snapshot de competidores",
      description:
        "Actualiza el snapshot diario de todos los competidores registrados (followers, subscribers, contenido).",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const competitors = deps.repository.getCompetitors();
      const today = new Date().toISOString().slice(0, 10);
      const resultados: Array<Record<string, unknown>> = [];
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
          deps.repository.upsertCompetitor({
            ...competitor,
            follow_count: profile.followCount ?? 0,
            subscriber_count: profile.subscriberCount ?? 0,
            image_count: stats.imageCount ?? 0,
            video_count: stats.videoCount ?? 0,
            bundle_count: stats.bundleCount ?? 0,
            last_seen_at: profile.lastSeenAt ?? 0,
          });
          resultados.push({
            account_id: competitor.account_id,
            username: competitor.username,
            seguidores: profile.followCount ?? 0,
            subscriptores: profile.subscriberCount ?? 0,
          });
        } catch {
          continue;
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ fecha: today, actualizados: resultados.length, competidores: resultados }) }],
        structuredContent: { fecha: today, actualizados: resultados.length, competidores: resultados },
      };
    }
  );

  server.registerTool(
    "clasificar_competidores",
    {
      title: "Clasificar competidores",
      description:
        "Clasifica los competidores registrados por nicho (micro/mid/top), actividad y mezcla de contenido.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const competitors = deps.repository.getCompetitors();
      const resumen = {
        total: competitors.length,
        por_nicho: competitors.reduce<Record<string, number>>((acc, c) => {
          acc[c.niche] = (acc[c.niche] ?? 0) + 1;
          return acc;
        }, {}),
        por_actividad: {
          activos: competitors.filter((c) => c.active === 1).length,
          inactivos: competitors.filter((c) => c.active === 0).length,
        },
        detalle: competitors.map((c) => {
          const totalContenido = c.image_count + c.video_count + c.bundle_count;
          return {
            id: c.account_id,
            username: c.username,
            seguidores: c.follow_count,
            subscriptores: c.subscriber_count,
            contenido: totalContenido,
            ratio_video: totalContenido > 0
              ? Number((c.video_count / totalContenido).toFixed(2))
              : 0,
            niche: c.niche,
            ultima_actividad_dias: daysSince(c.last_seen_at),
            activo: c.active === 1,
          };
        }),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "benchmark_competencia",
    {
      title: "Benchmark de competencia",
      description:
        "Compara KPIs del perfil activo vs competidores: conversión, eficiencia de contenido y posición percentil.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const account = await deps.engine.getOwnAccount();
      const competitors = deps.repository.getCompetitors();
      const miConversion =
        (account.followCount ?? 0) > 0
          ? ((account.subscriberCount ?? 0) / (account.followCount ?? 0)) * 100
          : 0;
      const miContenido: number =
        (account.timelineStats?.imageCount ?? 0) +
        (account.timelineStats?.videoCount ?? 0) +
        (account.timelineStats?.bundleCount ?? 0);

      const filas = competitors.map((c) => {
        const totalContenido = c.image_count + c.video_count + c.bundle_count;
        return {
          username: c.username,
          seguidores: c.follow_count,
          subscriptores: c.subscriber_count,
          conversion_pct: c.follow_count > 0 ? (c.subscriber_count / c.follow_count) * 100 : 0,
          contenido: totalContenido,
          eficiencia: totalContenido > 0 ? c.follow_count / totalContenido : 0,
        };
      });
      filas.push({
        username: `${account.username ?? "nosotros"} (nosotros)`,
        seguidores: account.followCount ?? 0,
        subscriptores: account.subscriberCount ?? 0,
        conversion_pct: miConversion,
        contenido: miContenido,
        eficiencia: miContenido > 0 ? (account.followCount ?? 0) / miContenido : 0,
      });
      filas.sort((a, b) => b.seguidores - a.seguidores);

      const conversionOrdenada = [...filas].sort((a, b) => b.conversion_pct - a.conversion_pct);
      const miPos = conversionOrdenada.findIndex((f) => f.username.includes("(nosotros)"));
      const percentil =
        conversionOrdenada.length > 0
          ? Number(((1 - miPos / conversionOrdenada.length) * 100).toFixed(1))
          : 0;

      const resumen = {
        kpis_por_cuenta: filas,
        nuestra_conversion_pct: Number(miConversion.toFixed(2)),
        percentil_conversion: percentil,
        mejor_conversion: conversionOrdenada[0]?.username ?? null,
        mejor_conversion_valor: conversionOrdenada[0] ? Number(conversionOrdenada[0].conversion_pct.toFixed(2)) : null,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "analizar_crecimiento_competencia",
    {
      title: "Crecimiento de competencia",
      description:
        "Analiza evolución de seguidores/subscriptores de cada competidor desde sus snapshots (ráfagas vs lineal).",
      inputSchema: z.object({
        dias: z.number().int().min(7).max(365).optional().describe("Días de historial a analizar"),
      }),
    },
    async ({ dias }) => {
      const days = dias ?? 30;
      const competitors = deps.repository.getCompetitors();
      const ownSnaps = deps.repository.getDailySnapshots(days);
      const ownDelta =
        ownSnaps.length >= 2
          ? ownSnaps[0].total_followers - ownSnaps[ownSnaps.length - 1].total_followers
          : null;

      const analisis = competitors.map((c) => {
        const snaps = deps.repository.getCompetitorSnapshots(c.account_id).slice(-days);
        if (snaps.length < 2) {
          return {
            id: c.account_id,
            username: c.username,
            snapshots: snaps.length,
            crecimiento: null,
          };
        }
        const primero = snaps[0];
        const ultimo = snaps[snaps.length - 1];
        const delta = ultimo.follow_count - primero.follow_count;
        const deltasDiarios = snaps.slice(1).map((snap, i) => snap.follow_count - snaps[i].follow_count);
        const maxDelta = Math.max(...deltasDiarios);
        const mediaDelta = deltasDiarios.reduce((a, b) => a + b, 0) / deltasDiarios.length;
        const patronCrecimiento =
          mediaDelta > 0 && maxDelta > mediaDelta * 3
            ? "ráfagas"
            : mediaDelta > 0
              ? "lineal"
              : "sin_crecimiento";

        let coMovimiento: string | null = null;
        if (ownDelta !== null) {
          if (ownDelta < 0 && delta > 0) coMovimiento = "te_gana_cuota";
          else if (ownDelta > 0 && delta < 0) coMovimiento = "le_ganas_cuota";
          else if (ownDelta > 0 && delta > 0) coMovimiento = "crece_junto_a_ti";
          else if (ownDelta < 0 && delta < 0) coMovimiento = "cae_contigo";
          else coMovimiento = "sin_movimiento_relevante";
        }

        return {
          id: c.account_id,
          username: c.username,
          snapshots: snaps.length,
          crecimiento: delta,
          crecimiento_pct:
            primero.follow_count > 0 ? Number(((delta / primero.follow_count) * 100).toFixed(2)) : null,
          patron: delta > 0 ? "creciendo" : delta < 0 ? "perdiendo" : "estable",
          patron_crecimiento: patronCrecimiento,
          max_delta_diario: maxDelta,
          co_movimiento: coMovimiento,
        };
      });
      const resumen = {
        dias_analizados: days,
        nuestra_variacion_seguidores: ownDelta,
        analisis,
        notas:
          analisis.every((a) => a.snapshots < 2)
            ? "Snapshots insuficientes. Ejecuta snapshot_competidores a diario (o úsalo en el scheduler)."
            : "patron_crecimiento: ráfagas si el mayor salto diario supera 3x la media. co_movimiento compara la variación del competidor con la nuestra (WoW).",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "alertas_competencia",
    {
      title: "Alertas de competencia",
      description:
        "Detecta cambios en competidores: pérdida de seguidores, inactividad prolongada y temas emergentes (hashtags al alza WoW).",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const competitors = deps.repository.getCompetitors();
      const alertas: string[] = [];
      for (const c of competitors) {
        const snaps = deps.repository.getLatestCompetitorSnapshots(c.account_id, 2);
        if (snaps.length >= 2) {
          const prev = snaps[snaps.length - 2];
          const curr = snaps[snaps.length - 1];
          const delta = curr.follow_count - prev.follow_count;
          if (delta < -Math.max(5, Math.abs(prev.follow_count * 0.05))) {
            alertas.push(`@${c.username}: perdió ${Math.abs(delta)} seguidores respecto al snapshot anterior.`);
          }
        }
        const lastSeen = daysSince(c.last_seen_at);
        if (lastSeen !== null && lastSeen > 30) {
          alertas.push(`@${c.username}: sin actividad visible en ${lastSeen} días.`);
        }
      }

      const hoy = Date.now();
      const hace7 = new Date(hoy - 7 * 86400000).toISOString().slice(0, 10);
      const hace14 = new Date(hoy - 14 * 86400000).toISOString().slice(0, 10);
      const porTag = new Map<string, { actual: number; previo: number }>();
      for (const row of deps.repository.getCompetitorHashtagTrends(hace14)) {
        const bucket = row.date >= hace7 ? "actual" : "previo";
        const entry = porTag.get(row.hashtag) ?? { actual: 0, previo: 0 };
        entry[bucket] += row.frequency;
        porTag.set(row.hashtag, entry);
      }
      const temasEmergentes = [...porTag.entries()]
        .map(([tag, v]) => ({ tag, usos_7d: v.actual, usos_7d_previos: v.previo, delta: v.actual - v.previo }))
        .filter((t) => t.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5);
      for (const tema of temasEmergentes.slice(0, 3)) {
        alertas.push(`Tema emergente: #${tema.tag} (+${tema.delta} usos en la competencia esta semana).`);
      }

      const resumen = {
        competidores_monitoreados: competitors.length,
        alertas,
        temas_emergentes: temasEmergentes,
        estado: alertas.length === 0 ? "Sin cambios relevantes" : "Cambios detectados",
        notas:
          temasEmergentes.length === 0
            ? "Sin temas emergentes todavía: ejecuta benchmark_hashtags o registrar_competidor en semanas distintas para poblar competitor_hashtags."
            : "Temas emergentes = hashtags de la competencia con más usos esta semana vs la anterior.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "scoreboard_general",
    {
      title: "Scoreboard general",
      description:
        "Ranking orquestado por cuenta (nosotros + competidores) con métricas unificadas de seguidores, suscriptores y contenido.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const account = await deps.engine.getOwnAccount();
      const competitors = deps.repository.getCompetitors();
      const filas = [
        {
          cuenta: `${account.username ?? "nosotros"} (nosotros)`,
          seguidores: account.followCount ?? 0,
          subscriptores: account.subscriberCount ?? 0,
          contenido:
            (account.timelineStats?.imageCount ?? 0) +
            (account.timelineStats?.videoCount ?? 0) +
            (account.timelineStats?.bundleCount ?? 0),
        },
        ...competitors.map((c) => ({
          cuenta: `@${c.username}`,
          seguidores: c.follow_count,
          subscriptores: c.subscriber_count,
          contenido: c.image_count + c.video_count + c.bundle_count,
        })),
      ].sort((a, b) => b.seguidores - a.seguidores);

      const resumen = {
        fecha: new Date().toISOString().slice(0, 10),
        ranking: filas.map((f, i) => ({ posicion: i + 1, ...f })),
        total_cuentas: filas.length,
        nota: "Scoreboard orientativo: la API no expone alcance real; se usan proxies públicos.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "benchmark_hashtags",
    {
      title: "Benchmark de hashtags de competencia",
      description:
        "Extrae hashtags de los timelines públicos de los competidores: cobertura vs los nuestros, frecuencia, engagement por uso y hashtags de cola larga.",
      inputSchema: z.object({
        limite_competidores: z.number().int().min(1).max(20).optional().describe("Máximo de competidores a escanear"),
      }),
    },
    async ({ limite_competidores }) => {
      const maxCompetitors = limite_competidores ?? 5;
      const competitors = deps.repository.getCompetitors().slice(0, maxCompetitors);
      const tagAgg = new Map<string, { posts: number; engagement: number; cuentas: Set<string> }>();
      let escaneados = 0;

      for (const competitor of competitors) {
        const posts = await fetchCompetitorTimelinePosts(deps, competitor.account_id);
        if (posts.length === 0) continue;
        escaneados += 1;
        persistCompetitorHashtags(deps, competitor.account_id, posts);
        for (const post of posts) {
          for (const tag of new Set(post.hashtags)) {
            const entry = tagAgg.get(tag) ?? { posts: 0, engagement: 0, cuentas: new Set<string>() };
            entry.posts += 1;
            entry.engagement += post.likes + post.media_likes;
            entry.cuentas.add(competitor.account_id);
            tagAgg.set(tag, entry);
          }
        }
      }

      const ownAccount = await deps.engine.getOwnAccount();
      const ownTimeline = await deps.engine.getTimeline(ownAccount.id ?? "", { limit: 25 });
      const ownTags = new Set<string>();
      for (const post of ownTimeline.posts ?? []) {
        for (const tag of parseHashtags(post.content)) ownTags.add(tag);
      }

      const filas = [...tagAgg.entries()]
        .map(([tag, v]) => ({
          tag,
          posts: v.posts,
          cuentas: v.cuentas.size,
          engagement: v.engagement,
          engagement_por_post: v.posts > 0 ? Number((v.engagement / v.posts).toFixed(2)) : 0,
          la_usamos: ownTags.has(tag),
        }))
        .sort((a, b) => b.engagement - a.engagement);

      const ratios = filas.map((f) => f.engagement_por_post).filter((r) => r > 0).sort((a, b) => a - b);
      const mediana = ratios.length > 0 ? ratios[Math.floor(ratios.length / 2)] : 0;
      const colaLarga = filas
        .filter((f) => f.posts <= 3 && mediana > 0 && f.engagement_por_post >= mediana * 2)
        .slice(0, 10);

      const cubiertos = filas.filter((f) => f.la_usamos).length;
      const resumen = {
        competidores_escaneados: escaneados,
        competidores_registrados: competitors.length,
        hashtags_distintos: filas.length,
        cobertura_pct: filas.length > 0 ? Number(((cubiertos / filas.length) * 100).toFixed(1)) : 0,
        ranking: filas.slice(0, 25),
        cola_larga: colaLarga,
        oportunidades_que_no_usamos: filas.filter((f) => !f.la_usamos).slice(0, 10).map((f) => f.tag),
        notas:
          escaneados === 0
            ? "Sin competidores escaneables. Registra competidores con registrar_competidor primero."
            : "Cola larga = hashtags con ≤3 usos pero engagement por uso ≥2x la mediana (nichos de alto rendimiento).",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "copy_competidores",
    {
      title: "Patrones de copy de la competencia",
      description:
        "Analiza el copy de los posts recientes de los competidores (longitud, emojis, preguntas, CTA, hashtags/post) y lo compara con el nuestro.",
      inputSchema: z.object({
        limite_competidores: z.number().int().min(1).max(20).optional().describe("Máximo de competidores a analizar"),
      }),
    },
    async ({ limite_competidores }) => {
      const maxCompetitors = limite_competidores ?? 5;
      const competitors = deps.repository.getCompetitors().slice(0, maxCompetitors);
      const todosLosPosts: MappedPost[] = [];
      const porCompetidor: Array<Record<string, unknown>> = [];

      for (const competitor of competitors) {
        const posts = await fetchCompetitorTimelinePosts(deps, competitor.account_id);
        if (posts.length === 0) continue;
        todosLosPosts.push(...posts);
        porCompetidor.push({ username: competitor.username, ...summarizeCopy(posts) });
      }

      const ownAccount = await deps.engine.getOwnAccount();
      const ownTimeline = await deps.engine.getTimeline(ownAccount.id ?? "", { limit: 25 });
      const ownPosts = (ownTimeline.posts ?? []).map((post) => mapPost(post, new Map()));

      const competencia = summarizeCopy(todosLosPosts);
      const nuestro = summarizeCopy(ownPosts);
      const brechas: string[] = [];
      if (competencia.posts > 0 && nuestro.posts > 0) {
        if (competencia.hashtags_por_post > nuestro.hashtags_por_post + 1) {
          brechas.push(
            `La competencia usa ~${competencia.hashtags_por_post} hashtags/post vs tus ~${nuestro.hashtags_por_post}. Amplía tu cobertura de hashtags.`
          );
        }
        if (competencia.pct_cta > nuestro.pct_cta + 20) {
          brechas.push(
            `La competencia incluye llamada a la acción en el ${competencia.pct_cta}% de posts vs tu ${nuestro.pct_cta}%.`
          );
        }
        if (competencia.longitud_media > nuestro.longitud_media * 1.5) {
          brechas.push(
            `El copy de la competencia es más largo (~${competencia.longitud_media} vs ~${nuestro.longitud_media} caracteres).`
          );
        } else if (nuestro.longitud_media > competencia.longitud_media * 1.5) {
          brechas.push(
            `Tu copy es más largo que el de la competencia (~${nuestro.longitud_media} vs ~${competencia.longitud_media} caracteres). Prueba copys más directos.`
          );
        }
        if (competencia.emojis_medio > nuestro.emojis_medio + 1) {
          brechas.push(
            `La competencia usa más emojis por post (~${competencia.emojis_medio} vs ~${nuestro.emojis_medio}).`
          );
        }
        if (brechas.length === 0) {
          brechas.push("Tu copy está alineado con los patrones de la competencia analizada.");
        }
      }

      const resumen = {
        competidores_analizados: porCompetidor.length,
        posts_competencia: competencia.posts,
        promedio_competencia: competencia,
        nuestro_promedio: nuestro,
        detalle_por_competidor: porCompetidor,
        brechas,
        notas:
          porCompetidor.length === 0
            ? "Sin posts de competidores analizables. Registra competidores activos primero."
            : "Patrones calculados sobre los posts públicos más recientes de cada competidor.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "monitor_fyp_competitivo",
    {
      title: "Monitor FYP competitivo",
      description:
        "Escanea el feed FYP (fyp=1) y detecta qué competidores registrados aparecen en él, con su rendimiento.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const account = await deps.engine.getOwnAccount();
      const fyp = await deps.engine.getTimeline(account.id ?? "", { limit: 30, fyp: true });
      const competitors = deps.repository.getCompetitors();
      const byId = new Map(competitors.map((c) => [c.account_id, c]));
      const usernames = new Map<string, string>();
      for (const acc of fyp.accounts ?? []) {
        const id = typeof acc.id === "string" ? acc.id : "";
        const username = typeof acc.username === "string" ? acc.username : "";
        if (id && username) usernames.set(id, username);
      }

      const apariciones = new Map<string, { posts: number; likes: number; media_likes: number }>();
      let postsFyp = 0;
      for (const post of fyp.posts ?? []) {
        postsFyp += 1;
        const authorId = String(post.accountId ?? "");
        if (!authorId || !byId.has(authorId)) continue;
        const entry = apariciones.get(authorId) ?? { posts: 0, likes: 0, media_likes: 0 };
        entry.posts += 1;
        entry.likes += toNumber(post.likeCount);
        entry.media_likes += toNumber(post.mediaLikeCount);
        apariciones.set(authorId, entry);
      }

      const competidoresEnFyp = [...apariciones.entries()]
        .map(([id, v]) => ({
          account_id: id,
          username: byId.get(id)?.username || usernames.get(id) || null,
          posts_en_fyp: v.posts,
          likes: v.likes,
          media_likes: v.media_likes,
        }))
        .sort((a, b) => b.posts_en_fyp - a.posts_en_fyp);

      const resumen = {
        posts_fyp_escaneados: postsFyp,
        competidores_monitorizados: competitors.length,
        competidores_en_fyp: competidoresEnFyp,
        notas:
          competidoresEnFyp.length === 0
            ? "Ningún competidor registrado aparece en tu FYP ahora mismo. Repite el escaneo periódicamente."
            : "Estos competidores están recibiendo distribución FYP: analiza sus posts recientes con benchmark_hashtags y copy_competidores.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );
}
