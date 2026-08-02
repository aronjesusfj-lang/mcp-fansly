import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolDeps } from "./types.js";

export function registerAccountsTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "listar_cuentas",
    {
      title: "Listar cuentas de Fansly",
      description:
        "Lista las cuentas configuradas (FANSLY_ACCOUNTS), indicando cuál está activa, si su Chrome responde en el puerto CDP y si tiene sesión detectada.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const cuentas = await deps.engine.listAccounts();
      return {
        content: [{ type: "text", text: JSON.stringify({ cuenta_activa: deps.engine.activeAccount.name, cuentas }) }],
        structuredContent: { cuenta_activa: deps.engine.activeAccount.name, cuentas },
      };
    }
  );

  server.registerTool(
    "seleccionar_cuenta",
    {
      title: "Seleccionar cuenta activa",
      description:
        "Cambia la cuenta activa entre las configuradas en FANSLY_ACCOUNTS. El siguiente acceso a la API usará el Chrome/port de esa cuenta.",
      inputSchema: z
        .object({
          cuenta: z.string().min(1).describe("Nombre de la cuenta a activar (clave en FANSLY_ACCOUNTS)"),
        })
        .strict(),
    },
    async ({ cuenta }) => {
      const ok = await deps.engine.selectAccount(cuenta);
      if (!ok) {
        const disponibles = (await deps.engine.listAccounts()).map((a) => a.name).join(", ");
        return {
          content: [
            {
              type: "text",
              text: `Cuenta "${cuenta}" no existe. Cuentas disponibles: ${disponibles}`,
            },
          ],
          isError: true,
        };
      }
      const cuentas = await deps.engine.listAccounts();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ cuenta_activa: deps.engine.activeAccount.name, cuentas }),
          },
        ],
        structuredContent: { cuenta_activa: deps.engine.activeAccount.name, cuentas },
      };
    }
  );
}
