import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";
import type { FanslyAccount } from "../engine/fansly.js";
import { mapProfileCompleto, mapTiers } from "./helpers.js";

interface SnapshotRow {
  date: string;
  total_followers: number;
  gross_earnings: number;
  active_subscribers: number;
}

function computeGrowth(rows: SnapshotRow[]): {
  muestra: SnapshotRow[];
  wow_crecimiento_seguidores?: number | null;
  mom_crecimiento_seguidores?: number | null;
} {
  if (rows.length < 2) {
    return { muestra: rows };
  }
  const latest = rows[0];
  const pct = (prev: number, curr: number): number | null =>
    prev === 0 ? null : ((curr - prev) / prev) * 100;

  const findClosest = (daysAgo: number): SnapshotRow | null => {
    const target = new Date(`${latest.date}T00:00:00Z`);
    target.setUTCDate(target.getUTCDate() - daysAgo);
    let closest: SnapshotRow | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const diff = Math.abs(
        new Date(`${row.date}T00:00:00Z`).getTime() - target.getTime()
      );
      if (diff < bestDiff) {
        bestDiff = diff;
        closest = row;
      }
    }
    return closest;
  };

  const weekAgo = findClosest(7);
  const monthAgo = findClosest(30);

  return {
    muestra: rows,
    wow_crecimiento_seguidores: weekAgo
      ? pct(weekAgo.total_followers, latest.total_followers)
      : null,
    mom_crecimiento_seguidores: monthAgo
      ? pct(monthAgo.total_followers, latest.total_followers)
      : null,
  };
}

function linearForecast(rows: SnapshotRow[], daysAhead: number): number | null {
  if (rows.length < 2) return null;
  const ordered = [...rows].reverse();
  const n = ordered.length;
  const xs = ordered.map((_, i) => i);
  const ys = ordered.map((r) => r.total_followers);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  return Math.max(0, Math.round(intercept + slope * (n - 1 + daysAhead)));
}

export function registerMetricsTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "verificar_sesion",
    {
      title: "Verificar sesión de Fansly",
      description:
        "Comprueba si existe token de sesión (browser_data/ o FANSLY_TOKEN) y reporta el estado de autenticación.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const hasToken = await deps.engine.hasSession();
      const origen = deps.engine.mode;
      const cuentaActiva = deps.engine.activeAccount.name;
      const cuentas = await deps.engine.listAccounts();
      const resumen = {
        sesion_detectada: hasToken,
        origen,
        cuenta_activa: cuentaActiva,
        cuentas,
        instrucciones: hasToken
          ? "Sesión detectada. Prueba obtener_metricas_perfil."
          : origen === "token"
            ? "No hay token. Define FANSLY_TOKEN en .env o ejecuta npm run login."
            : origen === "cdp"
              ? "No se encontró token en Chrome. Ejecuta npm run chrome-cdp, inicia sesión en fansly.com en tu Chrome y reintenta."
              : "No hay sesión. Ejecuta npm run login y espera a que se abra Chromium para iniciar sesión.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "obtener_metricas_perfil",
    {
      title: "Métricas del perfil",
      description:
        "Extrae seguidores, suscriptores, contenido, wallets, tiers y muros del perfil activo desde /account/me y persiste snapshot diario.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const account = await deps.engine.getOwnAccount();
      const resumen = mapProfileCompleto(account);
      const now = new Date().toISOString().slice(0, 10);
      deps.repository.upsertDailySnapshot({
        date: now,
        total_followers: account.followCount ?? 0,
        active_subscribers: account.subscriberCount ?? 0,
        gross_earnings: 0,
        churned_subscribers: 0,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "obtener_suscriptores",
    {
      title: "Suscriptores reales",
      description:
        "Lee el estado real de suscripciones desde /subscriptions (activos, vencidos, totales, planes) y lo persiste en subscribers_history.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const subs = await deps.engine.getSubscriptions();
      const stats = subs.stats ?? {};
      const now = new Date().toISOString().slice(0, 10);
      deps.repository.upsertSubscribers({
        date: now,
        total_active: stats.totalActive ?? 0,
        total_expired: stats.totalExpired ?? 0,
        total: stats.total ?? 0,
      });
      const resumen = {
        activos: stats.totalActive ?? 0,
        vencidos: stats.totalExpired ?? 0,
        total: stats.total ?? 0,
        planes: (subs.subscriptionPlans ?? []).length,
        suscripciones: (subs.subscriptions ?? []).length,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "obtener_reporte_crecimiento",
    {
      title: "Reporte de crecimiento",
      description:
        "Genera el reporte comparativo de crecimiento (WoW / MoM) analizando SQLite local.",
      inputSchema: z.object({
        dias: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Días de historial a analizar retrospectivamente"),
      }),
    },
    async ({ dias }) => {
      const days = dias ?? 30;
      const rows = deps.repository.getDailySnapshots(days);
      const report = computeGrowth(rows);
      return {
        content: [{ type: "text", text: JSON.stringify(report) }],
        structuredContent: report,
      };
    }
  );

  server.registerTool(
    "pronostico_crecimiento",
    {
      title: "Pronóstico de crecimiento",
      description:
        "Proyecta seguidores y suscriptores a 7 y 30 días mediante regresión lineal sobre los snapshots almacenados.",
      inputSchema: z.object({
        dias: z.number().int().min(7).max(365).optional().describe("Historial a usar para el modelo"),
      }),
    },
    async ({ dias }) => {
      const days = dias ?? 30;
      const rows = deps.repository.getDailySnapshots(days) as SnapshotRow[];
      const forecast7 = linearForecast(rows, 7);
      const forecast30 = linearForecast(rows, 30);
      const resumen = {
        historial_dias: rows.length,
        proyeccion_seguidores_7d: forecast7,
        proyeccion_seguidores_30d: forecast30,
        seguidores_actuales: rows[0]?.total_followers ?? null,
        notas:
          rows.length < 2
            ? "Se necesitan al menos 2 snapshots diarios. Ejecuta obtener_metricas_perfil a diario."
            : "Proyección lineal simple; no tiene en cuenta campañas, virales ni estacionalidad.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "reporte_ingresos",
    {
      title: "Reporte de ingresos",
      description:
        "Consolida ingresos por propinas, suscripciones y PPV desde earnings_history y el snapshot del perfil.",
      inputSchema: z.object({
        dias: z.number().int().min(1).max(365).optional().describe("Días de historial a analizar"),
      }),
    },
    async ({ dias }) => {
      const days = dias ?? 30;
      const rows = deps.repository.getEarnings(days);
      const total_tips = rows.reduce((s, r) => s + r.tips_total, 0);
      const total_subs = rows.reduce((s, r) => s + r.subs_income, 0);
      const total_ppv = rows.reduce((s, r) => s + r.ppv_income, 0);
      const ingreso_total = total_tips + total_subs + total_ppv;
      const resumen = {
        dias_analizados: rows.length,
        total_propinas: total_tips,
        total_suscripciones: total_subs,
        total_ppv: total_ppv,
        ingreso_total,
        saldo_wallet_reciente: rows[0]?.wallet_balance ?? null,
        por_dia: rows,
        notas:
          rows.length === 0
            ? "Sin historial de ingresos. La API no expone un histórico; registra snapshots diarios con snapshot_diario."
            : "Ingresos registrados desde snapshots diarios.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "tasa_conversion_audiencia",
    {
      title: "Conversión de audiencia",
      description:
        "Calcula el ratio seguidores→suscriptores y otros KPIs de embudo del perfil activo.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const account = await deps.engine.getOwnAccount();
      const seguidores = account.followCount ?? 0;
      const subscriptores = account.subscriberCount ?? 0;
      const conversion = seguidores > 0 ? (subscriptores / seguidores) * 100 : 0;
      const resumen = {
        seguidores,
        subscriptores,
        tasa_conversion_pct: Number(conversion.toFixed(2)),
        evaluacion:
          conversion === 0
            ? "Sin suscriptores aún. El embudo no está monetizando seguidores."
            : conversion < 2
              ? "Conversión baja (<2%). Revisa tiers, precio y llamadas a la acción."
              : conversion < 5
                ? "Conversión media (2-5%)."
                : "Conversión alta (>5%).",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "alertas_recesion",
    {
      title: "Alertas de recesión",
      description:
        "Detecta señales de caída: sin publicaciones en X días, caída de engagement WoW o pérdida de seguidores.",
      inputSchema: z.object({
        dias_sin_publicar: z.number().int().min(1).max(90).optional().describe("Umbral de inactividad en días"),
      }),
    },
    async ({ dias_sin_publicar }) => {
      const threshold = dias_sin_publicar ?? 7;
      const account = await deps.engine.getOwnAccount();
      const timeline = await deps.engine.getTimeline(account.id ?? "", { limit: 1 });
      const posts = timeline.posts ?? [];
      const alertas: string[] = [];
      let ultimo_post: string | null = null;

      if (posts.length > 0) {
        const ts = posts[0].createdAt;
        const iso =
          typeof ts === "number"
            ? new Date(ts * 1000).toISOString()
            : typeof ts === "string" && /^\d+$/.test(ts)
              ? new Date(Number(ts) * 1000).toISOString()
              : null;
        if (iso) {
          const daysInactive = Math.floor(
            (Date.now() - new Date(iso).getTime()) / 86400000
          );
          ultimo_post = iso.slice(0, 10);
          if (daysInactive >= threshold) {
            alertas.push(
              `Sin publicaciones en ${daysInactive} días (último post: ${ultimo_post}). Recomendado publicar con frecuencia ≥3/semana.`
            );
          }
        }
      } else {
        alertas.push("No hay publicaciones visibles en el timeline.");
      }

      const rows = deps.repository.getDailySnapshots(10) as SnapshotRow[];
      if (rows.length >= 2) {
        const latest = rows[0];
        const weekAgo = rows.find((r) => {
          const diff = Math.abs(
            new Date(`${latest.date}T00:00:00Z`).getTime() -
              new Date(`${r.date}T00:00:00Z`).getTime()
          );
          return diff >= 5 * 86400000;
        });
        if (weekAgo && latest.total_followers < weekAgo.total_followers) {
          const loss = weekAgo.total_followers - latest.total_followers;
          alertas.push(`Pérdida de ${loss} seguidores respecto a hace una semana.`);
        }
      }

      const resumen = {
        evaluado_el: new Date().toISOString().slice(0, 10),
        ultimo_post,
        alertas,
        estado: alertas.length === 0 ? "Saludable" : "Atención requerida",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "auditar_promociones_tiers",
    {
      title: "Auditoría de tiers y promociones",
      description:
        "Audita tiers de suscripción, precios y planes desde el perfil real (account/me).",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const account = await deps.engine.getOwnAccount();
      const tiers = mapTiers(account);
      const resumen = { total_tiers: tiers.length, tiers: tiers };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );
}
