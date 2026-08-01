# Fansly MCP Server

Servidor **Model Context Protocol (MCP)** para automatización y analítica de cuentas de Fansly. Expone herramientas, recursos y prompts que un LLM puede usar para consultar métricas reales del perfil (seguidores, contenido, tiers, mensajes, media) y persistirlas en una base de datos SQLite local para análisis de series temporales.

> 100% local. El servidor se autentica con tu propia sesión de Fansly (token o perfil de Chromium persistente) y hace peticiones HTTPS directas a `apiv3.fansly.com`. No se sube ningún dato a terceros.

## Características

- **12+ herramientas analíticas** sobre la API real de Fansly (ver [herramientas](#herramientas)).
- **Motor resiliente**: reintentos con backoff exponencial, refresco automático de sesión en `401`, timeout configurable.
- **Doble modo de autenticación**: `FANSLY_TOKEN` (HTTP puro, sin navegador) o perfil de Chromium persistente (`browser_data/`).
- **SQLite local** (`fansly_analytics.db`) con WAL para snapshots diarios y métricas de posts.
- **Transporte STDIO**: compatible con Claude Desktop, Cursor, Zed, Codex CLI, OpenCode, GitHub Copilot, Roo Code.
- **Documentación completa** en `docs/` (arquitectura, configuración, esquema, auditorías, conformidad MCP, activación).

## Requisitos

- Node.js ≥ 20
- Una cuenta de Fansly y su token de sesión (o acceso para login manual una vez)

## Instalación

```bash
npm install
npm run build
```

## Configuración

Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

Las variables clave:

| Variable | Descripción |
|----------|-------------|
| `FANSLY_TOKEN` | Token de sesión de Fansly (recomendado, funciona en headless) |
| `USER_DATA_DIR` | Perfil persistente de Chromium (`./browser_data`) |
| `DB_PATH` | Ruta de la base de datos SQLite (`./fansly_analytics.db`) |
| `HEADLESS` | `true` para headless, `false` para la primera autenticación manual |

### Obtener el token de sesión

En `fansly.com`, con DevTools abierto en la pestaña **Console**:

```js
JSON.parse(localStorage.getItem("session_active_session")).token
```

Pega el valor en `FANSLY_TOKEN` de tu `.env`.

> Alternativa sin token: ejecuta `npm run login` una vez, inicia sesión en la ventana de Chromium que se abre y la sesión quedará guardada en `browser_data/`.

## Uso

El servidor se ejecuta sobre **STDIO** (JSON-RPC). Úsalo desde cualquier cliente MCP.

### Verificación rápida

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node build/index.js
```

Debe responder con `"serverInfo":{"name":"fansly-mcp"}`.

### Activación por cliente

Consulta la [guía de activación](./docs/09-activacion-mcp-fansly.md). Los archivos de configuración incluidos:

- `opencode.json` — OpenCode
- `.mcp.json` — Cursor, Zed, Copilot, Roo Code
- `claude_desktop_config.json` — Claude Desktop

## Herramientas

| Herramienta | Fuente de datos |
|---|---|
| `verificar_sesion` | token local / `FANSLY_TOKEN` |
| `obtener_metricas_perfil` | `GET /api/v1/account/me` → `response.account` |
| `obtener_reporte_crecimiento` | SQLite (`daily_snapshots`) |
| `analizar_rendimiento_posts` | `GET /api/v1/timelinenew/{id}` → `response.posts` |
| `obtener_tendencias_hashtag` | `GET /api/v1/timelinenew/{id}?contentSearch=` |
| `obtener_top_fans` | `GET /api/v1/messaging/groups` |
| `obtener_flujo_mensajes` | `GET /api/v1/messaging/groups` + `GET /api/v1/message` |
| `analizar_churn` | SQLite (`daily_snapshots`) |
| `calcular_elasticidad_ppv` | SQLite (`post_metrics`) |
| `analizar_atribucion_links` | SQLite (`post_metrics`) |
| `generar_mapa_calor_horario` | `GET /api/v1/timelinenew/{id}` |
| `auditar_caja_fuerte` | `GET /api/v1/mediaoffers/location` |
| `auditar_promociones_tiers` | `GET /api/v1/account/me` → `subscriptionTiers` |

Todas las peticiones añaden `ngsw-bypass=true` y los headers `fansly-client-ts`, `Origin` y `Referer`, validan `success` y desempaquetan la clave `response` de la API.

## Recursos y prompts

- **Recursos**: `fansly://resumen`, `fansly://metricas/{fecha}` (desde SQLite).
- **Prompts**: `auditar-perfil`, `analizar-contenido-rezagado`.

## Estructura del proyecto

```
src/
├── config.ts            # Carga de configuración (dotenv + zod)
├── index.ts             # Punto de entrada MCP (servidor + shutdown)
├── engine/
│   └── fansly.ts        # Motor resiliente de la API de Fansly
├── db/
│   └── repository.ts    # SQLite (WAL, migraciones, upserts)
├── tools/               # 13 herramientas MCP
├── resources/           # Recursos MCP
└── prompts/             # Prompts MCP
docs/                    # Documentación técnica completa
scripts/login.ts         # Login manual en Chromium persistente
```

## Documentación

- [docs/README.md](./docs/README.md) — índice completo de la documentación técnica
- [01-arquitectura.md](./docs/01-arquitectura.md) — arquitectura y flujo de datos
- [02-configuracion.md](./docs/02-configuracion.md) — configuración y dependencias
- [03-base-de-datos.md](./docs/03-base-de-datos.md) — esquema SQLite
- [04-servidor-mcp.md](./docs/04-servidor-mcp.md) — implementación del servidor y endpoints reales
- [05-orquestacion-cliente.md](./docs/05-orquestacion-cliente.md) — configuración de clientes
- [06-auditoria-1-codigo.md](./docs/06-auditoria-1-codigo.md) — auditoría de código y lógica
- [07-auditoria-2-arquitectura-seguridad.md](./docs/07-auditoria-2-arquitectura-seguridad.md) — auditoría de arquitectura y seguridad
- [08-conformidad-mcp-oficial.md](./docs/08-conformidad-mcp-oficial.md) — conformidad con MCP 2026-07-28
- [09-activacion-mcp-fansly.md](./docs/09-activacion-mcp-fansly.md) — activación en cualquier harness

## Seguridad y privacidad

- Los datos nunca salen de tu máquina salvo las peticiones HTTPS a la propia API de Fansly.
- `.env`, `browser_data/` y `*.db` están en `.gitignore` — **nunca subas tu token ni tu sesión**.
- El token se lee del entorno (`FANSLY_TOKEN`) o del perfil de Chromium local.

## Limitaciones y advertencias

- Se usa la API interna de Fansly con tu propia sesión (**selfbot**). Revisa los Términos de Servicio de Fansly antes de usarlo.
- Métricas como churn, elasticidad PPV o atribución de ingresos se calculan desde los datos persistidos en SQLite; Fansly no expone esos endpoints públicamente.
- Este proyecto es de uso personal/educativo.

## Licencia

MIT
