# fansly-mcp — Servidor MCP de analítica para Fansly

Consulta la API real de Fansly con tu propia sesión (token, Chrome CDP o perfil persistente) y persiste métricas en SQLite local. 100% local, transporte STDIO.

**Requiere:** Node.js ≥ 20 · sesión de Fansly

## Features
**49 herramientas MCP**, agrupadas por dominio:

| Dominio | Herramientas |
|---|---|
| Perfil y sesión | `verificar_sesion`, `obtener_metricas_perfil`, `listar_cuentas`, `seleccionar_cuenta` |
| Métricas e ingresos | `obtener_suscriptores`, `obtener_reporte_crecimiento`, `pronostico_crecimiento`, `reporte_ingresos`, `tasa_conversion_audiencia`, `alertas_recesion`, `auditar_promociones_tiers`, `analizar_churn`, `obtener_top_fans` |
| Posts y contenido | `analizar_rendimiento_posts`, `analizar_post`, `curva_vida_post`, `top_bottom_posts`, `ranking_posts`, `analizar_hashtags`, `obtener_tendencias_hashtag`, `generar_mapa_calor_horario`, `horarios_publicacion`, `interaccion_contenido`, `tracker_fyp`, `optimizador_fyp` |
| Mensajería y PPV | `obtener_flujo_mensajes`, `ranking_fans_gasteros`, `metricas_mensajeria`, `correlacion_mensajes_posts`, `calcular_elasticidad_ppv`, `sugerencia_ppv_tipo` |
| Tracking y vault | `registrar_link_tracking`, `registrar_click_link`, `analizar_atribucion_links`, `auditar_caja_fuerte`, `contenido_rezagado` |
| Competencia | `descubrir_competidores`, `registrar_competidor`, `eliminar_competidor`, `snapshot_competidores`, `clasificar_competidores`, `benchmark_competencia`, `analizar_crecimiento_competencia`, `alertas_competencia`, `scoreboard_general`, `benchmark_hashtags`, `copy_competidores`, `monitor_fyp_competitivo` |
| Orquestación | `snapshot_diario` (pipeline completo + scheduler opcional con `SNAPSHOT_INTERVAL_MS`) |

**Recursos:** `fansly://resumen`, `fansly://metricas/{fecha}`, `fansly://post/{postId}`, `fansly://competidores`, `fansly://hashtags`
**Prompts:** `auditar-perfil`, `analizar-contenido-rezagado`, `dashboard-semanal`, `plan-contenido-semanal`, `auditoria-competencia`, `analisis-post-profundo`

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
  tools/             → 49 herramientas MCP (+ helpers.ts, types.ts)
  resources/ prompts/ → recursos y prompts
scripts/login.ts     → auth manual en Chromium persistente
docs/                → documentación técnica (índice: docs/README.md)
```

## Seguridad
- 100% local; solo HTTPS a la API propia de Fansly. `.env`, `browser_data/`, `*.db*` en `.gitignore`.
- Selfbot sobre API interna: revisa los ToS de Fansly. Uso personal/educativo.

**Licencia:** MIT
