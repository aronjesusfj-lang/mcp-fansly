import { chromium } from "playwright";
import { loadConfig } from "../src/config.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.fanslyToken) {
    console.log("FANSLY_TOKEN ya está configurado en el entorno. No es necesario el login manual.");
    return;
  }

  console.log("Abriendo Chromium visible para iniciar sesión en Fansly...");
  console.log("1) Inicia sesión en fansly.com en la ventana.");
  console.log("2) Cuando termines, cierra la ventana.");
  console.log("La sesión quedará guardada en:", config.userDataDir);

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: false,
  });
  const page = await context.newPage();
  await page.goto("https://fansly.com/creator", { waitUntil: "domcontentloaded" });
  await new Promise<void>((resolve) => {
    const timer = setInterval(async () => {
      const token = await page.evaluate(() => {
        const raw = localStorage.getItem("session_active_session") ?? localStorage.getItem("session_token");
        if (!raw) return "";
        try {
          const parsed = JSON.parse(raw);
          return typeof parsed?.token === "string" ? parsed.token : String(parsed);
        } catch {
          return raw;
        }
      });
      if (token) {
        clearInterval(timer);
        resolve();
      }
    }, 3000);
    page.on("close", () => {
      clearInterval(timer);
      resolve();
    });
  });
  await context.close();
  console.log("Proceso de login terminado. La sesión quedó guardada en", config.userDataDir);
}

main().catch((error: unknown) => {
  console.error("Error en login:", error);
  process.exit(1);
});
