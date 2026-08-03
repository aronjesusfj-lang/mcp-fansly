# Fansly MCP Server — Documentación Técnica

Índice de documentación del servidor **Model Context Protocol (MCP)** para Fansly.

> **Fuente original:** Documentación Técnica Definitiva: Servidor MCP para Fansly (archivo `desorden.txt`, **eliminado** el 2026-08-03; su contenido íntegro está preservado en los documentos 01–05).
> Este repositorio separa cada componente del documento original en su propia documentación, **sin omitir ninguna información**, y añade dos auditorías de calidad más una verificación de conformidad contra la documentación oficial de MCP (build-server 2026-07-28).

---

## Mapa de componentes

| # | Documento | Contenido | Sección original |
|---|-----------|-----------|------------------|
| 1 | [01-arquitectura.md](./01-arquitectura.md) | Diagrama de operación, flujo de datos, principios de seguridad y aislamiento | 1 |
| 2 | [02-configuracion.md](./02-configuracion.md) | `package.json`, `.env` y dependencias | 2 |
| 3 | [03-base-de-datos.md](./03-base-de-datos.md) | Esquema SQLite (`daily_snapshots`, `post_metrics`, `tracking_links`) | 3 |
| 4 | [04-servidor-mcp.md](./04-servidor-mcp.md) | Código fuente `src/index.ts`: motor resiliente, sesión y herramientas (documento original; la implementación actual tiene 49) | 4 |
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

**49 herramientas analíticas** (implementación actual; el documento original describía 12-15):

- **Perfil y sesión (4):** `verificar_sesion`, `obtener_metricas_perfil`, `listar_cuentas`, `seleccionar_cuenta`
- **Métricas e ingresos (9):** `obtener_suscriptores`, `obtener_reporte_crecimiento`, `pronostico_crecimiento`, `reporte_ingresos`, `tasa_conversion_audiencia`, `alertas_recesion`, `auditar_promociones_tiers`, `analizar_churn`, `obtener_top_fans`
- **Posts y contenido (12):** `analizar_rendimiento_posts`, `analizar_post`, `curva_vida_post`, `top_bottom_posts`, `ranking_posts`, `analizar_hashtags`, `obtener_tendencias_hashtag`, `generar_mapa_calor_horario`, `horarios_publicacion`, `interaccion_contenido`, `tracker_fyp`, `optimizador_fyp`
- **Mensajería y PPV (6):** `obtener_flujo_mensajes`, `ranking_fans_gasteros`, `metricas_mensajeria`, `correlacion_mensajes_posts`, `calcular_elasticidad_ppv`, `sugerencia_ppv_tipo`
- **Tracking y vault (5):** `registrar_link_tracking`, `registrar_click_link`, `analizar_atribucion_links`, `auditar_caja_fuerte`, `contenido_rezagado`
- **Competencia (12):** `descubrir_competidores`, `registrar_competidor`, `eliminar_competidor`, `snapshot_competidores`, `clasificar_competidores`, `benchmark_competencia`, `analizar_crecimiento_competencia`, `alertas_competencia`, `scoreboard_general`, `benchmark_hashtags`, `copy_competidores`, `monitor_fyp_competitivo`
- **Orquestación (1):** `snapshot_diario`

---

## Estado del proyecto

> **Importante:** Las auditorías ([06](./06-auditoria-1-codigo.md), [07](./07-auditoria-2-arquitectura-seguridad.md)) y la conformidad ([08](./08-conformidad-mcp-oficial.md)) detectan fallos importantes. El scaffold corregido de referencia se encuentra en el directorio raíz del proyecto (`package.json`, `tsconfig.json`, `.env.example`, `src/`) y se construyó siguiendo las buenas prácticas de la documentación oficial de MCP.

**Leyenda de auditorías:**
- 🔴 **Crítico** — impide el funcionamiento o compromete la seguridad
- 🟠 **Alto** — fallo importante de lógica o criterio
- 🟡 **Medio** — buena práctica ausente
- 🔵 **Bajo** — mejora opcional
