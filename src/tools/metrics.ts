import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";
import type { FanslyAccount } from "../engine/fansly.js";

interface SnapshotRow {
  date: string;
  total_followers: number;
  gross_earnings: number;
}

function sanitizeProfile(account: FanslyAccount): Record<string, unknown> {
  const timelineStats = account.timelineStats ?? {};
  return {
    perfil: {
      id: account.id ?? null,
      username: account.username ?? null,
      email: account.email ?? null,
    },
    seguidores: account.followCount ?? 0,
    contenido_total: {
      imagenes: timelineStats.imageCount ?? 0,
      videos: timelineStats.videoCount ?? 0,
      bundles: timelineStats.bundleCount ?? 0,
    },
    tiers: (account.subscriptionTiers ?? []).map((tier) => ({
      id: tier.id ?? null,
      nombre: tier.name ?? null,
      precio_usd: typeof tier.price === "number" ? tier.price / 1000 : null,
      max_subscriptores: tier.maxSubscribers ?? 0,
      planes: (tier.plans ?? []).map((plan) => ({
        id: plan.id ?? null,
        precio_usd: typeof plan.price === "number" ? plan.price / 1000 : null,
        ciclo_dias: plan.cycle ?? null,
      })),
    })),
    muros: (account.walls ?? []).map((wall) => ({
      id: wall.id ?? null,
      nombre: wall.name ?? null,
      es_defecto: Boolean(wall.defaultWall),
    })),
  };
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
  const previous = rows[1];
  const pct = (prev: number, curr: number): number | null =>
    prev === 0 ? null : ((curr - prev) / prev) * 100;
  return {
    muestra: rows,
    wow_crecimiento_seguidores: pct(previous.total_followers, latest.total_followers),
    mom_crecimiento_seguidores: rows.length >= 3
      ? pct(rows[2].total_followers, latest.total_followers)
      : null,
  };
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
      const resumen = {
        sesion_detectada: hasToken,
        origen: hasToken ? "FANSLY_TOKEN o browser_data/" : "ninguna",
        instrucciones: hasToken
          ? "Sesión detectada. Prueba obtener_metricas_perfil."
          : "Configura FANSLY_TOKEN en .env o ejecuta el primer login con HEADLESS=false.",
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
        "Extrae seguidores, contenido publicado, tiers de suscripción y muros del perfil activo desde /account/me.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const account = await deps.engine.getOwnAccount();
      const resumen = sanitizeProfile(account);
      const now = new Date().toISOString().slice(0, 10);
      deps.repository.upsertDailySnapshot({
        date: now,
        total_followers: account.followCount ?? 0,
        active_subscribers: 0,
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
}
