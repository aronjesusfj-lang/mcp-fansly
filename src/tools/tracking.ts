import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";

export function registerTrackingTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "analizar_atribucion_links",
    {
      title: "Atribución de ingresos por publicación",
      description:
        "Analiza qué publicaciones generan más ingresos por propinas desde los datos persistidos en SQLite (post_metrics).",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const posts = deps.repository.getPostMetrics(100);
      const atribucion = posts
        .filter((post) => post.tips_amount > 0)
        .sort((a, b) => b.tips_amount - a.tips_amount)
        .slice(0, 20)
        .map((post) => ({
          post_id: post.post_id,
          ingresos_generados: post.tips_amount,
          likes: post.likes_count,
          publicado: post.posted_at,
        }));

      const total_ingresos = posts.reduce((sum, post) => sum + post.tips_amount, 0);
      const resumen = {
        total_ingresos_rastreados: total_ingresos,
        publicaciones_con_ingresos: atribucion.length,
        atribucion: atribucion,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );
}
