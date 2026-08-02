import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";
import { mapPublicAccount } from "./helpers.js";

function classifyNiche(followers: number): string {
  if (followers < 1000) return "micro";
  if (followers < 10000) return "mid";
  return "top";
}

function daysSince(ts: number): number | null {
  if (!ts || ts <= 0) return null;
  return Math.floor((Date.now() - ts) / 86400000);
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
      return {
        content: [{ type: "text", text: JSON.stringify(mapPublicAccount(profile)) }],
        structuredContent: mapPublicAccount(profile),
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
      const miContenidoNum = miContenido as number;
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
        return {
          id: c.account_id,
          username: c.username,
          snapshots: snaps.length,
          crecimiento: delta,
          crecimiento_pct:
            primero.follow_count > 0 ? Number(((delta / primero.follow_count) * 100).toFixed(2)) : null,
          patron: delta > 0 ? "creciendo" : delta < 0 ? "perdiendo" : "estable",
        };
      });
      const resumen = {
        dias_analizados: days,
        analisis,
        notas:
          analisis.every((a) => a.snapshots < 2)
            ? "Snapshots insuficientes. Ejecuta snapshot_competidores a diario (o úsalo en el scheduler)."
            : "El patrón se calcula comparando el primer y último snapshot del periodo.",
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
        "Detecta cambios en competidores: pérdida de seguidores, inactividad prolongada o caída de conversión.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const competitors = deps.repository.getCompetitors();
      const alertas: string[] = [];
      for (const c of competitors) {
        const snaps = deps.repository.getCompetitorSnapshots(c.account_id);
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
      const resumen = {
        competidores_monitoreados: competitors.length,
        alertas,
        estado: alertas.length === 0 ? "Sin cambios relevantes" : "Cambios detectados",
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
}
