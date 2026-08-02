import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";
import { toIso, toNumber } from "./helpers.js";

interface VaultMediaResponse {
  data?: Array<{
    id?: string;
    mediaType?: string;
    price?: number;
    likeCount?: number;
    permissionFlags?: number;
    createdAt?: number | string;
    media?: { type?: number; [key: string]: unknown };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

const CONTENT_TYPES: Record<number, string> = {
  0: "texto",
  1: "imagen",
  2: "video",
  3: "audio",
};

function resolveType(item: Record<string, unknown>): string {
  if (typeof item.mediaType === "string" && item.mediaType.length > 0) {
    return item.mediaType;
  }
  const media = (item.media ?? {}) as { type?: number };
  return CONTENT_TYPES[toNumber(media.type)] ?? "desconocido";
}

export function registerVaultTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "auditar_caja_fuerte",
    {
      title: "Auditoría de la caja fuerte",
      description:
        "Inspecciona el media publicado en el muro del perfil (mediaoffers/location) identificando tipos, precios y likes, y lo persiste en media_vault.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const account = await deps.engine.getOwnAccount();
      const wallId = account.walls?.[0]?.id ?? "";
      const data = await deps.engine.fetchApi<VaultMediaResponse>(
        `/mediaoffers/location?locationId=${encodeURIComponent(wallId)}&locationType=1002&accountId=${encodeURIComponent(account.id ?? "")}&mediaType=&before=&after=0&limit=50&offset=0`
      );
      const media = data.data ?? [];
      const items = media.map((item) => {
        const tipo = resolveType(item);
        const precio = toNumber(item.price);
        deps.repository.upsertVaultMedia({
          media_id: safeId(item.id),
          media_type: tipo,
          price: precio,
          permission_flags: toNumber(item.permissionFlags),
          likes: toNumber(item.likeCount),
          posted_at: toIso(item.createdAt) ?? new Date().toISOString(),
        });
        return {
          id: item.id ?? null,
          tipo,
          precio,
          likes: toNumber(item.likeCount),
        };
      });

      const resumen = {
        muro: account.walls?.[0]?.name ?? wallId,
        total_media: media.length,
        media_con_precio: items.filter((i) => i.precio > 0).length,
        tipos: items.reduce<Record<string, number>>((acc, item) => {
          acc[item.tipo] = (acc[item.tipo] ?? 0) + 1;
          return acc;
        }, {}),
        items,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );

  server.registerTool(
    "contenido_rezagado",
    {
      title: "Contenido rezagado",
      description:
        "Identifica media de la caja fuerte con baja interacción y sugiere reposteo o monetización como PPV.",
      inputSchema: z.object({
        umbral_likes: z.number().int().min(0).optional().describe("Media con likes por debajo de este umbral"),
      }),
    },
    async ({ umbral_likes }) => {
      const umbral = umbral_likes ?? 2;
      const vault = deps.repository.getVaultMedia();
      const rezagado = vault
        .filter((item) => item.likes < umbral)
        .sort((a, b) => a.likes - b.likes);

      const resumen = {
        total_media_analizado: vault.length,
        rezagado: rezagado.length,
        umbral_likes: umbral,
        candidatos: rezagado.slice(0, 20).map((item) => ({
          media_id: item.media_id,
          tipo: item.media_type,
          likes: item.likes,
          precio: item.price,
          publicado: item.posted_at?.slice(0, 10),
        })),
        recomendaciones: [
          "Repostea el media rezagado con nuevo copy y hashtags de alto rendimiento.",
          "Convierte imágenes sueltas en bundles con precio PPV atractivo.",
          "Usa el media rezagado como contenido gratuito de gancho para atraer suscriptores.",
        ],
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );
}

function safeId(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : String(value ?? "");
}
