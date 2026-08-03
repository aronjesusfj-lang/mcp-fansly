import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
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

  server.registerResource(
    "post",
    new ResourceTemplate("fansly://post/{postId}", { list: undefined }),
    {
      title: "Historial de un post",
      mimeType: "application/json",
      description: "Curva de vida y métricas acumuladas de un post concreto.",
    },
    async (uri, variables) => {
      const raw = variables["postId"];
      const postId = Array.isArray(raw) ? raw[0] : raw;
      const history = repository.getPostMetricHistory(postId ?? "");
      const postMetrics = repository.getPostMetricById(postId ?? "");
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ post_id: postId, actual: postMetrics ?? null, curva: history }),
          },
        ],
      };
    }
  );

  server.registerResource(
    "competidores",
    "fansly://competidores",
    {
      title: "Competidores registrados",
      mimeType: "application/json",
      description: "Lista de competidores registrados con sus métricas más recientes.",
    },
    async (uri) => {
      const competitors = repository.getCompetitors();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(competitors),
          },
        ],
      };
    }
  );

  server.registerResource(
    "hashtags",
    "fansly://hashtags",
    {
      title: "Métricas de hashtags",
      mimeType: "application/json",
      description: "Rendimiento acumulado de hashtags registrados en los snapshots.",
    },
    async (uri) => {
      const rows = repository.getAllHashtagMetrics();
      const acumulado = new Map<string, { posts: number; likes: number; media_likes: number; tips: number }>();
      for (const row of rows) {
        const current = acumulado.get(row.hashtag) ?? { posts: 0, likes: 0, media_likes: 0, tips: 0 };
        current.posts += row.post_count;
        current.likes += row.likes;
        current.media_likes += row.media_likes;
        current.tips += row.tips;
        acumulado.set(row.hashtag, current);
      }
      const ranking = [...acumulado.entries()]
        .map(([hashtag, v]) => ({ hashtag, ...v }))
        .sort((a, b) => b.media_likes - a.media_likes)
        .slice(0, 50);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(ranking),
          },
        ],
      };
    }
  );
}
