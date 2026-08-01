# Fansly MCP Server — Documentación Técnica

Índice de documentación del servidor **Model Context Protocol (MCP)** para Fansly.

> **Fuente original:** `desorden.txt` — Documentación Técnica Definitiva: Servidor MCP para Fansly.
> Este repositorio separa cada componente del documento original en su propia documentación, **sin omitir ninguna información**, y añade dos auditorías de calidad más una verificación de conformidad contra la documentación oficial de MCP (build-server 2026-07-28).

---

## Mapa de componentes

| # | Documento | Contenido | Sección original |
|---|-----------|-----------|------------------|
| 1 | [01-arquitectura.md](./01-arquitectura.md) | Diagrama de operación, flujo de datos, principios de seguridad y aislamiento | 1 |
| 2 | [02-configuracion.md](./02-configuracion.md) | `package.json`, `.env` y dependencias | 2 |
| 3 | [03-base-de-datos.md](./03-base-de-datos.md) | Esquema SQLite (`daily_snapshots`, `post_metrics`, `tracking_links`) | 3 |
| 4 | [04-servidor-mcp.md](./04-servidor-mcp.md) | Código fuente `src/index.ts`: motor resiliente, sesión y 12 herramientas | 4 |
| 5 | [05-orquestacion-cliente.md](./05-orquestacion-cliente.md) | Configuración de `claude_desktop_config.json` / Cursor | 5 |
| 6 | [06-auditoria-1-codigo.md](./06-auditoria-1-codigo.md) | **Auditoría 1:** código y lógica (bugs, mal criterio, código basura) | — |
| 7 | [07-auditoria-2-arquitectura-seguridad.md](./07-auditoria-2-arquitectura-seguridad.md) | **Auditoría 2:** arquitectura, seguridad y configuración | — |
| 8 | [08-conformidad-mcp-oficial.md](./08-conformidad-mcp-oficial.md) | **Verificación:** estructura contra la documentación oficial de MCP (2026-07-28) | — |
| 9 | [09-activacion-mcp-fansly.md](./09-activacion-mcp-fansly.md) | **Guía:** activación en cualquier harness (OpenCode, Cursor, Zed, Codex, Claude, Copilot) | — |

---

## Resumen del sistema

El sistema conecta modelos de lenguaje (LLM) con la API interna de Fansly de forma 100% local, utilizando un motor de resiliencia HTTP sobre Playwright y una base de datos SQLite para análisis de series temporales.

**Componentes principales:**
- **Cliente de IA** — Claude Desktop / Cursor IDE / Agent (transporte STDIO / JSON-RPC)
- **Servidor MCP Local (Node.js)** — `@modelcontextprotocol/sdk` + `better-sqlite3`
  - Base de datos local SQLite
  - Parser / reductor de tokens JSON
  - Motor resiliente (backoff exponencial + reintentos)
- **Navegador Chromium persistente** — perfil local en disco (`./browser_data`), extracción de headers y sesión
- **API interna de Fansly** — `apiv3.fansly.com` (peticiones HTTPS directas, JSON)

**12 herramientas analíticas:**
1. `verificar_sesion` — comprueba el estado de autenticación
2. `obtener_metricas_perfil` — seguidores, contenido, tiers y muros desde `/account/me`
3. `obtener_reporte_crecimiento` — variación WoW / MoM desde SQLite local
4. `analizar_rendimiento_posts` — likes, comentarios y propinas desde `/timelinenew/{id}`
5. `obtener_tendencias_hashtag` — búsqueda por contenido (`contentSearch`)
6. `obtener_top_fans` — fans con chat activo desde `/messaging/groups`
7. `obtener_flujo_mensajes` — conversaciones y propinas desde `/message`
8. `analizar_churn` — cancelaciones desde SQLite local
9. `calcular_elasticidad_ppv` — sugerencia de precio desde SQLite local
10. `analizar_atribucion_links` — ingresos por publicación desde SQLite local
11. `generar_mapa_calor_horario` — matriz 7x24 de publicación
12. `auditar_caja_fuerte` — media del muro desde `/mediaoffers/location`
13. `auditar_promociones_tiers` — tiers y planes desde `/account/me`

---

## Estado del proyecto

> **Importante:** Las auditorías ([06](./06-auditoria-1-codigo.md), [07](./07-auditoria-2-arquitectura-seguridad.md)) y la conformidad ([08](./08-conformidad-mcp-oficial.md)) detectan fallos importantes. El scaffold corregido de referencia se encuentra en el directorio raíz del proyecto (`package.json`, `tsconfig.json`, `.env.example`, `src/`) y se construyó siguiendo las buenas prácticas de la documentación oficial de MCP.

**Leyenda de auditorías:**
- 🔴 **Crítico** — impide el funcionamiento o compromete la seguridad
- 🟠 **Alto** — fallo importante de lógica o criterio
- 🟡 **Medio** — buena práctica ausente
- 🔵 **Bajo** — mejora opcional
