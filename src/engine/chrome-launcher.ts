import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { portFromCdpUrl } from "../config.js";

export { portFromCdpUrl };

const CHROME_APP = "/Applications/Google Chrome.app";
const CHROME_BIN = `${CHROME_APP}/Contents/MacOS/Google Chrome`;

export function isChromeInstalled(): boolean {
  return existsSync(CHROME_BIN);
}

export function isChromeRunning(): boolean {
  try {
    execSync('pgrep -x "Google Chrome" >/dev/null 2>&1');
    return true;
  } catch {
    return false;
  }
}

export function debugPortResponds(port: string): boolean {
  try {
    const out = execSync(`curl -s --max-time 2 http://127.0.0.1:${port}/json/version`);
    return out.toString().includes("Browser");
  } catch {
    return false;
  }
}

export async function ensureDebugChrome(port: string, userDataDir = ""): Promise<void> {
  if (debugPortResponds(port)) return;
  if (!isChromeInstalled()) {
    throw new Error(`No se encontró Chrome en ${CHROME_BIN}. Instala Google Chrome en /Applications.`);
  }
  const args = [`--remote-debugging-port=${port}`];
  if (userDataDir) {
    args.push(`--user-data-dir=${userDataDir}`);
  } else if (isChromeRunning()) {
    console.error(`Fansly MCP: cerrando Google Chrome para relanzarlo con depuración en el puerto ${port}...`);
    execSync('osascript -e \'tell application "Google Chrome" to quit\'');
    for (let i = 0; i < 20; i++) {
      if (!isChromeRunning()) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  args.push("--restore-last-session");
  console.error(`Fansly MCP: lanzando Google Chrome con --remote-debugging-port=${port}${userDataDir ? ` y perfil ${userDataDir}` : ""}...`);
  const child = spawn(CHROME_BIN, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    if (debugPortResponds(port)) {
      console.error(`Fansly MCP: Chrome listo en http://127.0.0.1:${port}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No se pudo confirmar el puerto de depuración ${port}. Revisa que Chrome arrancó.`);
}
