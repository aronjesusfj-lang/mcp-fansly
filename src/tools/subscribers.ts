import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";

interface MessagingGroup {
  id?: string;
  users?: Array<{ userId?: string; username?: string; displayName?: string; [key: string]: unknown }>;
  lastMessage?: { content?: string; createdAt?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function registerSubscribersTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "obtener_top_fans",
    {
      title: "Fans con conversación activa",
      description:
        "Lista los fans con chats activos desde /messaging/groups, el origen de datos real para perfiles que interactúan.",
      inputSchema: z.object({
        limite: z.number().int().min(1).max(100).optional().describe("Número máximo de fans a listar"),
      }),
    },
    async ({ limite }) => {
      const limit = limite ?? 10;
      const data = await deps.engine.fetchApi<{ groups?: MessagingGroup[] }>(
        "/messaging/groups?limit=100&offset=0"
      );
      const groups = data.groups ?? [];
      const fans = groups
        .slice(0, limit)
        .map((group, index) => {
          const user = group.users?.find((u) => typeof u.username === "string" && u.username.length > 0);
          return {
            rank: index + 1,
            grupo_id: safeText(group.id),
            fan_username: user?.username ?? null,
            display_name: user?.displayName ?? null,
            ultimo_mensaje: safeText(group.lastMessage?.content).slice(0, 80) || null,
          };
        });
      const resumen = { total_grupos: groups.length, fans: fans };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "analizar_churn",
    {
      title: "Análisis de churn",
      description:
        "Mide la cancelación de suscriptores (churn) a partir de los snapshots diarios registrados en SQLite.",
      inputSchema: z.object({
        dias: z.number().int().min(7).max(365).optional().describe("Días de historial a analizar"),
      }),
    },
    async ({ dias }) => {
      const days = dias ?? 30;
      const rows = deps.repository.getDailySnapshots(days);
      const churned = rows.reduce((sum, row) => sum + (row.churned_subscribers || 0), 0);
      const total = rows[0]?.total_followers ?? 0;
      const resumen = {
        dias_analizados: rows.length,
        churn_total_registrado: churned,
        seguidores_recientes: total,
        notas:
          rows.length === 0
            ? "Sin snapshots en SQLite. Ejecuta obtener_metricas_perfil diariamente para acumular historial."
            : "Churn calculado desde snapshots locales; Fansly no expone cancelaciones vía API.",
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
      const tiers = (account.subscriptionTiers ?? []).map((tier) => ({
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
      const resumen = { total_tiers: tiers.length, tiers: tiers };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );
}
