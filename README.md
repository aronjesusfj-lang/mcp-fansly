# fansly-mcp — Servidor MCP de analítica para Fansly

Consulta la API real de Fansly con tu propia sesión (token, Chrome CDP o perfil persistente) y persiste métricas en SQLite local. 100% local, transporte STDIO.

**Requiere:** Node.js ≥ 20 · sesión de Fansly

## Features
| Herramienta | Comportamiento clave |
|---|---|
| `obtener_metricas_perfil` | seguidores, contenido, tiers (÷1000=USD), muros desde `/account/me` |
| `verificar_sesion` | estado de auth + cuenta activa y cuentas configuradas |
| `listar_cuentas` / `seleccionar_cuenta` | multi-modelo: estado y conmutación de cuentas CDP |
| `analizar_rendimiento_posts` | likes/comentarios/propinas del timeline, persiste en SQLite |
| `obtener_tendencias_hashtag` | interacción acumulada por `contentSearch` |
| `generar_mapa_calor_horario` | matriz 7×24 de volumen de publicaciones |
| `obtener_top_fans` / `obtener_flujo_mensajes` | fans con chat activo + propinas en mensajes |
| `analizar_churn` / `obtener_reporte_crecimiento` | WoW/MoM y cancelaciones desde snapshots SQLite |
| `calcular_elasticidad_ppv` / `analizar_atribucion_links` | precio sugerido e ingresos por post desde SQLite |
| `auditar_caja_fuerte` / `auditar_promociones_tiers` | tipos de media del muro y tiers/planes |

**Recursos:** `fansly://resumen`, `fansly://metricas/{fecha}` · **Prompts:** `auditar-perfil`, `analizar-contenido-rezagado`

## Setup
```bash
npm install && npm run build
cp .env.example .env
# Env: FANSLY_TOKEN=<token|vacío>  FANSLY_CDP_URL=http://127.0.0.1:9222
#      FANSLY_ACCOUNTS='{"luna":{"cdpUrl":"...","userDataDir":"..."}}'  FANSLY_ACTIVE_ACCOUNT=luna
```
Sesión (fansly.com → DevTools → Console): `JSON.parse(localStorage.getItem("session_active_session")).token`

**Flujo CDP (sin pegar tokens):** con `FANSLY_TOKEN` vacío, el MCP relanza tu Chrome con debug port, reutiliza tu sesión de fansly y se re-autentica solo. Por modelo: `npm run chrome-cdp -- <cuenta>`.

**Activación por cliente:** configs `opencode.json` · `.mcp.json` · `claude_desktop_config.json` → guía completa en [docs/09](./docs/09-activacion-mcp-fansly.md)

## Estructura
```
src/
  config.ts          → env (dotenv + zod)
  index.ts           → entrada MCP (STDIO + shutdown)
  engine/fansly.ts   → motor API resiliente (retries/backoff, refresh en 401)
  engine/chrome-launcher.ts → Chrome CDP multi-perfil (compartido con scripts/)
  engine/session.ts  → token/sesión (readTokenFromStorage, CLEAN_SESSION_SCRIPT)
  db/repository.ts   → SQLite (WAL, migraciones, upserts)
  tools/             → 15 herramientas MCP (+ helpers.ts, types.ts)
  resources/ prompts/ → recursos y prompts
scripts/login.ts     → auth manual en Chromium persistente
docs/                → documentación técnica (índice: docs/README.md)
```

## Seguridad
- 100% local; solo HTTPS a la API propia de Fansly. `.env`, `browser_data/`, `*.db*` en `.gitignore`.
- Selfbot sobre API interna: revisa los ToS de Fansly. Uso personal/educativo.

**Licencia:** MIT
