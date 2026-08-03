# AGENTS — Fansly MCP

## Stack canónico
- Node.js ≥ 20 · TypeScript 5.5 · `@modelcontextprotocol/server@2.0.0` (transporte **solo STDIO**, sin HTTP/SSE)
- Playwright **1.58.0** fijado (chromium-1208): NO subir a 1.62.x → error "does not support chromium on mac12"
- better-sqlite3 (WAL) · zod (validación de env) · dotenv

## Convenciones de archivos
- Herramientas MCP → `src/tools/*.ts`, registradas en `src/tools/index.ts`
- Acceso a API de Fansly → **solo** vía `src/engine/fansly.ts` (nunca fetch directo en tools)
- SQLite → `src/db/repository.ts` (migraciones + upserts; sin SQL crudo en tools)
- Lanzamiento de Chrome CDP → `src/engine/chrome-launcher.ts` (compartido con `scripts/chrome-cdp.ts`)
- Extracción de token/sesión → `src/engine/session.ts` (`readTokenFromStorage`, `CLEAN_SESSION_SCRIPT`)
- Helpers compartidos de tools → `src/tools/helpers.ts` (`safeText`, `toNumber`, `mapTiers`, `mapWalls`)
- `tsconfig` solo incluye `src/**/*` → `scripts/*.ts` NO pasa typecheck
- Código sin comentarios ni emojis salvo petición explícita

## Reglas de API de Fansly
- Headers obligatorios: `fansly-client-ts`, `Origin: https://fansly.com`, `Referer: https://fansly.com/`, `Authorization` + `ngsw-bypass=true` en la URL
- Toda respuesta: validar `success` y leer la clave `response`
- `subscriptionTiers[].price` y `plans[].price` están en **milésimas** (÷1000 = USD); `plans[].cycle` en días
- Auth: `FANSLY_TOKEN` (modo token, HTTP puro), Chrome CDP (`FANSLY_CDP_URL`, multi-cuenta con `FANSLY_ACCOUNTS`) o perfil Chromium persistente (modo browser). `401` → refrescar/continuar sesión; `400` → sin sesión válida
- Errores de API: parsear como `Fansly API error (${code}): ${details}`

## Comandos exactos
```bash
dev:        npm run dev       # tsx watch src/index.ts
build:      npm run build     # tsc && chmod 755 build/index.js — verificar antes de deploy
start:      npm start         # node build/index.js
login:      npm run login     # auth manual (guarda sesión en browser_data/)
chrome-cdp: npm run chrome-cdp -- <cuenta>  # lanza Chrome con debug port para una cuenta
typecheck:  npm run typecheck # tsc --noEmit
test:       (no hay suite de tests)
```

## Gotchas críticos
- Hay **49 herramientas**: actualizar conteos en README.md y docs/README.md al añadir/eliminar tools
- NO commitear `.env`, `browser_data/` ni `*.db*` (token y sesión = secretos)
- Token de sesión: `JSON.parse(localStorage.getItem("session_active_session")).token`
- Smoke test STDIO: `printf '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' | node build/index.js` → `"serverInfo":{"name":"fansly-mcp"}`
