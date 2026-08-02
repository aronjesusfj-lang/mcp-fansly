import { ensureDebugChrome, portFromCdpUrl } from "../src/engine/chrome-launcher.js";
import { loadConfig } from "../src/config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const requested = process.argv[2] ?? config.activeAccount;
  const account = config.accounts.find((a) => a.name === requested);
  if (!account) {
    console.error(`Cuenta "${requested}" no existe. Cuentas configuradas: ${config.accounts.map((a) => a.name).join(", ")}`);
    process.exit(1);
  }
  const port = portFromCdpUrl(account.cdpUrl);
  console.log(`Cuenta "${account.name}" -> ${account.cdpUrl}${account.userDataDir ? ` (perfil ${account.userDataDir})` : ""}`);
  await ensureDebugChrome(port, account.userDataDir);
  console.log("Abre fansly.com e inicia sesión si no lo estás. Luego usa el MCP.");
}

main().catch((error: unknown) => {
  console.error("Error:", error);
  process.exit(1);
});
