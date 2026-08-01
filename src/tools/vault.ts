import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";

interface VaultMediaResponse {
  data?: Array<{ id?: string; mediaType?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export function registerVaultTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "auditar_caja_fuerte",
    {
      title: "Auditoría de la caja fuerte",
      description:
        "Inspecciona el media publicado en el muro del perfil (mediaoffers/location) identificando tipos de contenido.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const account = await deps.engine.getOwnAccount();
      const wallId = account.walls?.[0]?.id ?? "";
      const data = await deps.engine.fetchApi<VaultMediaResponse>(
        `/mediaoffers/location?locationId=${encodeURIComponent(wallId)}&locationType=1002&accountId=${encodeURIComponent(account.id ?? "")}&mediaType=&before=&after=0&limit=50&offset=0`
      );
      const media = data.data ?? [];
      const resumen = {
        muro: account.walls?.[0]?.name ?? wallId,
        total_media: media.length,
        tipos: media.reduce<Record<string, number>>((acc, item) => {
          const tipo = typeof item.mediaType === "string" ? item.mediaType : "desconocido";
          acc[tipo] = (acc[tipo] ?? 0) + 1;
          return acc;
        }, {}),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(resumen) }],
        structuredContent: resumen,
      };
    }
  );
}
