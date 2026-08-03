# 02. Configuración del Proyecto y Dependencias

> **Sección original 2 del documento de especificación inicial** (`desorden.txt`, ya eliminado). Configuración de proyecto (package.json), variables de entorno y dependencias.

---

## 2.1. Archivo `package.json`

```json
{
  "name": "fansly-mcp-server-definitive",
  "version": "1.0.0",
  "description": "Servidor MCP integral para automatización y analítica en Fansly",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^9.4.3",
    "dotenv": "^16.4.5",
    "playwright": "^1.42.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.9",
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3"
  }
}
```

### Desglose de dependencias

| Dependencia | Tipo | Propósito |
|-------------|------|-----------|
| `@modelcontextprotocol/sdk` | runtime | SDK de Model Context Protocol (servidor y tipos JSON-RPC) |
| `better-sqlite3` | runtime | Base de datos SQLite síncrona de alto rendimiento |
| `dotenv` | runtime | Carga de variables de entorno desde `.env` |
| `playwright` | runtime | Navegador Chromium persistente para sesión y headers |
| `@types/better-sqlite3` | dev | Tipos de TypeScript para better-sqlite3 |
| `@types/node` | dev | Tipos de TypeScript para Node.js |
| `typescript` | dev | Compilador TypeScript |

### Scripts

| Script | Comando | Descripción |
|--------|---------|-------------|
| `build` | `tsc` | Compila TypeScript a JavaScript |
| `start` | `node dist/index.js` | Ejecuta el servidor compilado |

> ⚠️ **Nota:** Este `package.json` usa la API antigua del SDK (`@modelcontextprotocol/sdk`). La documentación oficial de MCP 2026-07-28 recomienda el paquete `@modelcontextprotocol/server`. Ver [08-conformidad-mcp-oficial.md](./08-conformidad-mcp-oficial.md) → C1 y [06-auditoria-1-codigo.md](./06-auditoria-1-codigo.md) → A1-14.

---

## 2.2. Variables de Entorno `.env`

```dotenv
USER_DATA_DIR="./browser_data"
DB_PATH="./fansly_analytics.db"
HEADLESS="true"
MAX_RETRIES="3"
BACKOFF_BASE_MS="1000"
```

### Descripción de variables

| Variable | Valor por defecto | Descripción |
|----------|-------------------|-------------|
| `USER_DATA_DIR` | `./browser_data` | Directorio del perfil persistente del navegador Chromium |
| `DB_PATH` | `./fansly_analytics.db` | Ruta del archivo de base de datos SQLite |
| `HEADLESS` | `true` | Ejecuta el navegador en modo headless (`"true"` = sí) |
| `MAX_RETRIES` | `3` | Número máximo de reintentos del motor resiliente |
| `BACKOFF_BASE_MS` | `1000` | Base del backoff exponencial en milisegundos |

> ⚠️ **Nota:** No existe `.env.example` en el original. Se propone añadirlo. Ver [07-auditoria-2-arquitectura-seguridad.md](./07-auditoria-2-arquitectura-seguridad.md) → A2-6.
