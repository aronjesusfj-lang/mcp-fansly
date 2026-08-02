# fansly-mcp — Servidor MCP para analítica de cuentas de Fansly

Servidor **Model Context Protocol (STDIO)** que consulta la API real de Fansly con tu propia sesión y persiste métricas en SQLite local. 100% local.

**Requiere:** Node.js ≥ 20 · una sesión de Fansly (token o `npm run login`)

## Setup
```bash
npm install && npm run build
cp .env.example .env
```
**Env:** `FANSLY_TOKEN=<token>` · `USER_DATA_DIR=./browser_data` · `DB_PATH=./fansly_analytics.db` · `HEADLESS=true`

Token (fansly.com → DevTools → Console): `JSON.parse(localStorage.getItem("session_active_session")).token`

## Uso
```bash
npm run dev        # tsx watch src/index.ts
npm run build      # tsc → build/index.js (verificar antes de deploy)
npm start          # node build/index.js
npm run login      # auth manual en Chromium persistente (guarda en browser_data/)
npm run typecheck  # tsc --noEmit
```

**Smoke test STDIO:**
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' | node build/index.js
```
→ responde `"serverInfo":{"name":"fansly-mcp"}`

Activación por cliente (OpenCode, Claude Desktop, Cursor, Zed, Codex, Copilot/Roo): [docs/09](./docs/09-activacion-mcp-fansly.md) — configs: `opencode.json` · `.mcp.json` · `claude_desktop_config.json`

## Herramientas (13)
| Herramienta | Fuente de datos |
|---|---|
| `verificar_sesion` | token local / `FANSLY_TOKEN` |
| `obtener_metricas_perfil` | `GET /api/v1/account/me` → `account` |
| `obtener_reporte_crecimiento` | SQLite `daily_snapshots` |
| `analizar_rendimiento_posts` | `GET /api/v1/timelinenew/{id}` → `posts` |
| `obtener_tendencias_hashtag` | `timelinenew?contentSearch=` |
| `obtener_top_fans` | `GET /api/v1/messaging/groups` |
| `obtener_flujo_mensajes` | `groups` + `GET /api/v1/message` |
| `analizar_churn` | SQLite `daily_snapshots` |
| `calcular_elasticidad_ppv` | SQLite `post_metrics` |
| `analizar_atribucion_links` | SQLite `post_metrics` |
| `generar_mapa_calor_horario` | `timelinenew/{id}` |
| `auditar_caja_fuerte` | `GET /api/v1/mediaoffers/location` |
| `auditar_promociones_tiers` | `account/me` → `subscriptionTiers` |

Todas añaden `ngsw-bypass=true` + headers `fansly-client-ts`, `Origin`, `Referer`; validan `success` y desempaquetan `response`.

**Recursos:** `fansly://resumen`, `fansly://metricas/{fecha}` · **Prompts:** `auditar-perfil`, `analizar-contenido-rezagado`

## Estructura
```
src/
  config.ts          → env (dotenv + zod)
  index.ts           → entrada MCP (STDIO + shutdown)
  engine/fansly.ts   → motor API resiliente (retries/backoff, refresh en 401)
  db/repository.ts   → SQLite (WAL, migraciones, upserts)
  tools/ resources/ prompts/ → 13 herramientas + recursos + prompts
scripts/login.ts     → auth manual
docs/                → documentación técnica (índice: docs/README.md)
```

## Seguridad
- 100% local; solo HTTPS a la propia API de Fansly. `.env`, `browser_data/`, `*.db*` en `.gitignore` — nunca subas token/sesión.
- Selfbot sobre API interna: revisa los ToS de Fansly. Uso personal/educativo.

**Licencia:** MIT
