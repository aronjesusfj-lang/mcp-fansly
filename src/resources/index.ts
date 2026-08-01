import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import type { AnalyticsRepository } from "../db/repository.js";

export function registerResources(server: McpServer, repository: AnalyticsRepository): void {
  server.registerResource(
    "resumen",
    "fansly://resumen",
    {
      title: "Resumen del perfil",
      mimeType: "application/json",
      description: "Snapshot más reciente de métricas del perfil desde SQLite.",
    },
    async (uri) => {
      const rows = repository.getDailySnapshots(1);
      const snapshot = rows[0] ?? null;
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(snapshot),
          },
        ],
      };
    }
  );

  server.registerResource(
    "metricas-por-fecha",
    new ResourceTemplate("fansly://metricas/{fecha}", { list: undefined }),
    {
      title: "Métricas por fecha",
      mimeType: "application/json",
      description: "Snapshot de métricas para una fecha concreta (formato YYYY-MM-DD).",
    },
    async (uri, variables) => {
      const raw = variables["fecha"];
      const fecha = Array.isArray(raw) ? raw[0] : raw;
      const rows = repository.getDailySnapshots(365);
      const match = rows.find((row) => row.date === fecha) ?? null;
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: match === null ? "null" : JSON.stringify(match),
          },
        ],
      };
    }
  );
}
