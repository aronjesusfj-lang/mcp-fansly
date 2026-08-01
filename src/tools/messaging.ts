import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";

interface MessagingGroup {
  id?: string;
  users?: Array<{ userId?: string; username?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

interface MessagePayload {
  messages?: Array<{ id?: string; content?: string; createdAt?: string; [key: string]: unknown }>;
  tips?: Array<{ amount?: number; [key: string]: unknown }>;
  [key: string]: unknown;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function registerMessagingTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "obtener_flujo_mensajes",
    {
      title: "Flujo de mensajes",
      description:
        "Lista conversaciones (messaging/groups) y agrega propinas recibidas en los mensajes recientes (message).",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const data = await deps.engine.fetchApi<{ groups?: MessagingGroup[] }>(
        "/messaging/groups?limit=50&offset=0"
      );
      const groups = data.groups ?? [];
      let propinas_total = 0;
      let propinas_contadas = 0;
      const grupos_analizados = Math.min(groups.length, 10);

      for (const group of groups.slice(0, grupos_analizados)) {
        if (!group.id) continue;
        try {
          const payload = await deps.engine.fetchApi<MessagePayload>(
            `/message?groupId=${encodeURIComponent(group.id)}&limit=25`
          );
          const tips = payload.tips ?? [];
          propinas_contadas += tips.length;
          propinas_total += tips.reduce((sum, tip) => sum + toNumber(tip.amount), 0);
        } catch {
          continue;
        }
      }

      const resumen = {
        total_conversaciones: groups.length,
        grupos_analizados,
        propinas_contadas,
        propinas_total,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "calcular_elasticidad_ppv",
    {
      title: "Sugerencia de precio PPV",
      description:
        "Analiza patrones históricos de compra desde SQLite y sugiere un precio orientativo para PPV.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const posts = deps.repository.getPostMetrics(100);
      const desbloqueos = posts.reduce((sum, post) => sum + post.unlocks_count, 0);
      const ingresos = posts.reduce((sum, post) => sum + post.tips_amount, 0);

      const resultado = {
        notas:
          desbloqueos === 0
            ? "Sin datos históricos de desbloqueos en SQLite. Registra snapshots diarios para obtener una sugerencia basada en datos."
            : `Basado en ${posts.length} publicaciones con ${desbloqueos} desbloqueos y ${ingresos.toFixed(2)} en propinas.`,
        sugerencia_precio_orientativa:
          desbloqueos === 0 || ingresos === 0
            ? null
            : (ingresos / desbloqueos).toFixed(2),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultado) }],
        structuredContent: resultado,
      };
    }
  );
}
