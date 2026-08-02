import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps, MessagingGroup } from "./types.js";
import { safeText } from "./helpers.js";

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
        "Mide cancelación de suscriptores combinando subscribers_history real (/subscriptions) y snapshots diarios.",
      inputSchema: z.object({
        dias: z.number().int().min(7).max(365).optional().describe("Días de historial a analizar"),
      }),
    },
    async ({ dias }) => {
      const days = dias ?? 30;
      const rows = deps.repository.getDailySnapshots(days);
      const subsHistory = deps.repository.getSubscribersHistory(days);
      const churned = rows.reduce((sum, row) => sum + (row.churned_subscribers || 0), 0);
      const total = rows[0]?.total_followers ?? 0;

      let vencidos_recientes = 0;
      let activos_recientes: number | null = null;
      if (subsHistory.length > 0) {
        const primer = subsHistory[subsHistory.length - 1];
        const ultimo = subsHistory[0];
        activos_recientes = ultimo.total_active ?? 0;
        if (primer.total_active > 0) {
          vencidos_recientes = Math.max(0, primer.total_active - ultimo.total_active);
        } else {
          vencidos_recientes = ultimo.total_expired ?? 0;
        }
      }

      const resumen = {
        dias_analizados: rows.length,
        churn_total_registrado: churned,
        vencidos_segun_api: vencidos_recientes,
        suscriptores_activos: activos_recientes,
        seguidores_recientes: total,
        tasa_churn_pct:
          activos_recientes && activos_recientes > 0
            ? Number(((vencidos_recientes / activos_recientes) * 100).toFixed(2))
            : null,
        notas:
          activos_recientes === null
            ? "Sin historial real de suscripciones. Ejecuta obtener_suscriptores diariamente."
            : "Churn calculado con datos reales de /subscriptions.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );
}
