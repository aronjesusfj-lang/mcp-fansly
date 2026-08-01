# 01. Arquitectura del Sistema e Infraestructura de Seguridad

> **Sección original 1 de `desorden.txt`.** Esta especificación técnica constituye el manual completo de ingeniería, arquitectura, base de datos e implementación para el servidor **Model Context Protocol (MCP)** de Fansly. El sistema conecta modelos de lenguaje (LLM) con la API interna de Fansly de forma 100% local, utilizando un motor de resiliencia HTTP sobre Playwright y una base de datos SQLite para análisis de series temporales.

---

## 1.1. Diagrama de Operación y Flujo de Datos

```
┌─────────────────────────────────────────────────────────┐
│              Cliente de IA / Modelo LLM                 │
│        (Claude Desktop / Cursor IDE / Agent)            │
└────────────────────────────┬────────────────────────────┘
                             │ Protocolo STDIO (JSON-RPC)
                             ▼
┌─────────────────────────────────────────────────────────┐
│               Servidor MCP Local (Node.js)              │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Base de Datos Local SQLite (better-sqlite3)       │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Parser / Reductor de Tokens JSON                  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Motor Resiliente (Backoff Exponencial + Reintentos)│  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────┘
                             │ Extracción de Headers y Sesión (Daemon)
                             ▼
┌─────────────────────────────────────────────────────────┐
│             Navegador Chromium Persistente              │
│           (Perfil Local Guardado en Disco)              │
└────────────────────────────┬────────────────────────────┘
                             │ Peticiones HTTPS Directas (JSON)
                             ▼
┌─────────────────────────────────────────────────────────┐
│            API Interna de Fansly (apiv3.fansly.com)     │
└─────────────────────────────────────────────────────────┘
```

### Flujo de datos explicado

1. El **cliente de IA** (Claude Desktop / Cursor / Agent) se comunica con el servidor MCP local mediante el **protocolo STDIO (JSON-RPC)**.
2. El **servidor MCP local** (Node.js) actúa como orquestador e incluye tres subsistemas:
   - **Base de datos local SQLite** (`better-sqlite3`) — persistencia de series temporales.
   - **Parser / Reductor de tokens JSON** — limpia metadatos redundantes de las respuestas masivas de Fansly.
   - **Motor resiliente** — algoritmo de backoff exponencial con reintentos.
3. El servidor extrae **headers y sesión** mediante un daemon sobre el **navegador Chromium persistente**, cuyo perfil queda guardado en disco.
4. Las peticiones **HTTPS directas** (JSON) viajan desde el navegador hacia la **API interna de Fansly** (`apiv3.fansly.com`).

---

## 1.2. Principios de Seguridad y Aislamiento

- **Aislamiento de Credenciales:** Ni el token de sesión (`session_token`), ni las cookies, ni las contraseñas son enviadas al modelo de lenguaje en ningún momento. El modelo solo recibe las métricas de respuesta.
- **Sesión Local Persistente:** El perfil del navegador se almacena de forma segura en el directorio local `./browser_data`. La autenticación inicial se realiza manualmente una sola vez.
- **Sanitización de Datos:** El servidor extrae y limpia los metadatos redundantes de las respuestas JSON masivas de Fansly antes de entregarlas a la IA, garantizando un uso óptimo de la ventana de contexto.

---

## Componentes y responsabilidades

| Componente | Rol | Tecnología |
|------------|-----|------------|
| Cliente de IA | Orquesta llamadas a herramientas | Claude Desktop / Cursor / Agent |
| Servidor MCP | Expone 12 herramientas analíticas sobre STDIO | Node.js + SDK MCP |
| SQLite | Series temporales y cálculos (crecimiento, churn, proyecciones) | `better-sqlite3` |
| Reductor de tokens | Limpia respuestas JSON masivas | Parser propio |
| Motor resiliente | Backoff exponencial + reintentos | Lógica propia |
| Chromium persistente | Sesión autenticada con perfil en disco | Playwright |
| API Fansly | Fuente de datos (endpoints v3) | `apiv3.fansly.com` |

---

## Verificación de conformidad

> Los detalles de conformidad de esta arquitectura frente a la documentación oficial de MCP (build-server 2026-07-28) están documentados en [08-conformidad-mcp-oficial.md](./08-conformidad-mcp-oficial.md).

Hallazgos clave de arquitectura que las auditorías confirman:

1. **Diseño de sesión con Browser Persistente + `fetch` de Node** — el `fetch` de Node (en `src/index.ts`) no reenvía las cookies del navegador, por lo que la sesión real de Fansly probablemente fallará (401). Ver [07-auditoria-2-arquitectura-seguridad.md](./07-auditoria-2-arquitectura-seguridad.md) → A2-1.
2. **`HEADLESS=true` vs autenticación manual inicial** — contradicción: para hacer login manual una sola vez se necesita un navegador visible. Ver [07] → A2-2.
3. **`--disable-blink-features=AutomationControlled`** — flag de evasión de detección automatizada; implica riesgo de incumplimiento de términos de servicio. Ver [07] → A2-3.
