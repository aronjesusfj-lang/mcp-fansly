import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "link";
}

export function registerTrackingTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "registrar_link_tracking",
    {
      title: "Registrar link de seguimiento",
      description:
        "Crea un link de tracking con UTMs (source, medium, campaign) asociado a un post para medir atribución.",
      inputSchema: z.object({
        label: z.string().min(1).describe("Etiqueta descriptiva del link"),
        utm_source: z.string().min(1).describe("Origen del tráfico (ej: twitter, instagram, google)"),
        utm_medium: z.string().optional().describe("Medio (ej: social, banner, email)"),
        utm_campaign: z.string().optional().describe("Campaña o promoción"),
        post_id: z.string().optional().describe("ID del post al que apunta"),
      }),
    },
    async ({ label, utm_source, utm_medium, utm_campaign, post_id }) => {
      const linkId = slugify(`${label}-${utm_source}-${utm_campaign ?? utm_medium ?? ""}`);
      deps.repository.upsertTrackingLink({
        link_id: linkId,
        label,
        utm_source,
        utm_medium: utm_medium ?? "",
        utm_campaign: utm_campaign ?? "",
        post_id: post_id ?? "",
        clicks: 0,
        conversions: 0,
        revenue_generated: 0,
      });
      const resumen = {
        link_id: linkId,
        url_tracking: `https://fansly.com/?utm_source=${encodeURIComponent(utm_source)}&utm_medium=${encodeURIComponent(utm_medium ?? "")}&utm_campaign=${encodeURIComponent(utm_campaign ?? "")}&fansly_ref=${linkId}`,
        label,
        post_id: post_id ?? null,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "registrar_click_link",
    {
      title: "Registrar click/conversión en link",
      description:
        "Incrementa clics, conversiones e ingresos de un link de tracking existente.",
      inputSchema: z.object({
        link_id: z.string().min(1).describe("ID del link de tracking"),
        clics: z.number().int().min(0).optional().describe("Clics adicionales"),
        conversiones: z.number().int().min(0).optional().describe("Conversiones adicionales"),
        ingresos: z.number().min(0).optional().describe("Ingresos generados (USD)"),
      }),
    },
    async ({ link_id, clics, conversiones, ingresos }) => {
      deps.repository.incrementTrackingLink(link_id, clics ?? 0, conversiones ?? 0, ingresos ?? 0);
      const links = deps.repository.getTrackingLinks();
      const link = links.find((l) => l.link_id === link_id);
      if (!link) {
        return {
          content: [{ type: "text", text: `Link "${link_id}" no existe. Créalo con registrar_link_tracking.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(link) }],
        structuredContent: link,
      };
    }
  );

  server.registerTool(
    "analizar_atribucion_links",
    {
      title: "Atribución de ingresos por publicación",
      description:
        "Analiza qué publicaciones y links generan más ingresos por propinas desde los datos persistidos en SQLite.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const posts = deps.repository.getPostMetrics(100);
      const links = deps.repository.getTrackingLinks();
      const atribucion = posts
        .filter((post) => post.tips_amount > 0)
        .sort((a, b) => b.tips_amount - a.tips_amount)
        .slice(0, 20)
        .map((post) => ({
          post_id: post.post_id,
          ingresos_generados: post.tips_amount,
          likes: post.likes_count,
          media_likes: post.media_likes_count,
          tipo: post.media_type,
          publicado: post.posted_at,
        }));

      const total_ingresos = posts.reduce((sum, post) => sum + post.tips_amount, 0);
      const linksConDatos = links.filter((l) => l.clicks > 0 || l.conversions > 0);
      const resumen = {
        total_ingresos_rastreados: total_ingresos,
        publicaciones_con_ingresos: atribucion.length,
        atribucion,
        links_tracking: links.map((link) => ({
          link_id: link.link_id,
          label: link.label,
          utm_source: link.utm_source,
          utm_campaign: link.utm_campaign,
          post_id: link.post_id,
          clics: link.clicks,
          conversiones: link.conversions,
          ingresos: link.revenue_generated,
          tasa_conversion: link.clicks > 0 ? Number(((link.conversions / link.clicks) * 100).toFixed(2)) : 0,
        })),
        links_con_actividad: linksConDatos.length,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );
}
