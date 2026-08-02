# Activación del MCP Fansly en cualquier harness (Compatibilidad Universal)

Este servidor MCP se conecta exclusivamente por **STDIO** (estándar nativo del Model Context Protocol), por lo que es **100% universal y compatible** con cualquier arnés / cliente que implemente la especificación MCP:
- **OpenCode**
- **Claude Code (CLI)**
- **Gemini Antigravity AI (IDE / Agent)**
- **Claude Desktop**
- **Cursor IDE**
- **Zed Editor**
- **Windsurf (Codeium)**
- **Continue.dev**
- **Codex CLI (OpenAI)**
- **GitHub Copilot / Roo Code / Cline**

---

## Requisitos Previos

- **Node.js** ≥ 20 instalado en el sistema.
- **Compilación previa**: Ejecutar `npm run build` para generar el artefacto ejecutable en `./build/index.js`.
- **Sesión activa de Fansly**: `FANSLY_TOKEN` en `.env` / entorno, o primera autenticación visual con `npm run login`.

---

## Archivos de Configuración Incluidos en el Repositorio

| Archivo | Harneses / Clientes Objetivo |
|---------|------------------------------|
| `.mcp.json` (raíz) | Cursor, Zed, GitHub Copilot, Roo Code, Gemini Antigravity, Claude Code |
| `opencode.json` (raíz) | OpenCode AI Agent |
| `claude_desktop_config.json` | Claude Desktop |

---

## Configuración Detallada por Harnés / Cliente

### 1. OpenCode
Utiliza el archivo `opencode.json` ubicado en la raíz del proyecto. Si utilizas la configuración global de OpenCode, copia el bloque a `~/.config/opencode/opencode.json`:
```json
{
  "mcp": {
    "fansly-mcp": {
      "type": "local",
      "command": ["node", "/RUTA_ABSOLUTA/build/index.js"],
      "enabled": true,
      "environment": {
        "USER_DATA_DIR": "/RUTA_ABSOLUTA/browser_data",
        "DB_PATH": "/RUTA_ABSOLUTA/fansly_analytics.db",
        "FANSLY_TOKEN": "",
        "HEADLESS": "true"
      }
    }
  }
}
```

### 2. Claude Code (CLI)
Claude Code lee las configuraciones MCP desde `.mcp.json` en la raíz del proyecto o globalmente en `~/.claude.json`. Para configurar en `.claude.json`:
```json
{
  "mcpServers": {
    "fansly-mcp": {
      "command": "node",
      "args": ["/RUTA_ABSOLUTA/build/index.js"],
      "env": {
        "USER_DATA_DIR": "/RUTA_ABSOLUTA/browser_data",
        "DB_PATH": "/RUTA_ABSOLUTA/fansly_analytics.db",
        "FANSLY_TOKEN": "",
        "HEADLESS": "true"
      }
    }
  }
}
```

### 3. Gemini Antigravity AI (Agentic IDE)
Gemini Antigravity detecta automáticamente `.mcp.json` en el directorio de trabajo actual. También puede registrarse en los servidores MCP globales del IDE (`~/.gemini/antigravity-ide/mcp/`) mediante el formato estándar:
```json
{
  "mcpServers": {
    "fansly-mcp": {
      "command": "node",
      "args": ["/RUTA_ABSOLUTA/build/index.js"],
      "env": {
        "USER_DATA_DIR": "/RUTA_ABSOLUTA/browser_data",
        "DB_PATH": "/RUTA_ABSOLUTA/fansly_analytics.db",
        "FANSLY_TOKEN": "",
        "HEADLESS": "true"
      }
    }
  }
}
```

### 4. Claude Desktop
Copia `claude_desktop_config.json` a:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### 5. Cursor / Zed / Roo Code / Cline
Utilizan el archivo `.mcp.json` de la raíz del proyecto. En Cursor, también se puede añadir manualmente en *Settings → MCP*.

### 6. Windsurf (Codeium)
Añade la configuración a `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "fansly-mcp": {
      "command": "node",
      "args": ["/RUTA_ABSOLUTA/build/index.js"],
      "env": {
        "USER_DATA_DIR": "/RUTA_ABSOLUTA/browser_data",
        "DB_PATH": "/RUTA_ABSOLUTA/fansly_analytics.db"
      }
    }
  }
}
```

### 7. Continue.dev
Edita `~/.continue/config.json`:
```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "node",
          "args": ["/RUTA_ABSOLUTA/build/index.js"]
        }
      }
    ]
  }
}
```

### 8. Codex CLI (OpenAI)
Edita `~/.codex/config.toml`:
```toml
[mcp_servers.fansly-mcp]
command = "node"
args = ["/RUTA_ABSOLUTA/build/index.js"]
env = { "USER_DATA_DIR" = "/RUTA_ABSOLUTA/browser_data", "DB_PATH" = "/RUTA_ABSOLUTA/fansly_analytics.db", "HEADLESS" = "true" }
```

---

## Variables de Entorno del Servidor MCP

| Variable | Valor Defecto | Descripción |
|----------|---------------|-------------|
| `FANSLY_TOKEN` | `""` | **(Prioridad 1)** Token directo en HTTP (sin navegador). |
| `FANSLY_CDP_URL` | `http://127.0.0.1:9222` | **(Prioridad 2)** Conexión a Chrome activo (`npm run chrome-cdp`). |
| `FANSLY_ACCOUNTS` | `""` | Multi-cuenta: JSON `{"nombre":{"cdpUrl":"http://127.0.0.1:PUERTO","userDataDir":"RUTA_PERFIL"}}`. Cada modelo usa un puerto y un perfil de Chrome propios. |
| `FANSLY_ACTIVE_ACCOUNT` | primera cuenta | Cuenta activa por defecto (clave en `FANSLY_ACCOUNTS`). |
| `USER_DATA_DIR` | `./browser_data` | **(Prioridad 3)** Perfil persistente Chromium en disco. |
| `DB_PATH` | `./fansly_analytics.db` | Ruta a la base de datos SQLite. |
| `HEADLESS` | `true` | `false` abre Chromium visualmente para login manual. |
| `LOGIN_WAIT_MS` | `120000` | Tiempo de espera (ms) en login manual. |
| `MAX_RETRIES` | `3` | Reintentos HTTP ante errores 429/5xx. |
| `BACKOFF_BASE_MS` | `1000` | Base del backoff exponencial en ms. |
| `REQUEST_TIMEOUT_MS` | `30000` | Timeout por solicitud HTTP. |

---

## Modo CDP automático (sin pegar tokens)

Con `FANSLY_TOKEN` vacío y `FANSLY_CDP_URL` configurado, el MCP **reutiliza tu Chrome real**:

1. En el primer uso, el MCP detecta que el puerto de depuración no responde, **relanza Chrome automáticamente** con `--remote-debugging-port` y `--restore-last-session` (se restauran tus pestañas y la sesión de fansly.com).
2. Encuentra la pestaña de fansly.com, lee el token de `localStorage` y **no necesitas pegar nada**.
3. Si no hay sesión iniciada, abre fansly.com para que hagas login manual una vez.
4. Ante un `401`, se re-autentica solo desde el navegador.

**Multi-modelo:** configura una cuenta por modelo en `FANSLY_ACCOUNTS` (cada una con su puerto de depuración). Alterna con las tools `listar_cuentas` y `seleccionar_cuenta`, o lanza el Chrome de cada modelo con `npm run chrome-cdp -- <nombre>`.

---

## Verificación del Servidor (Smoke Test STDIO)

Puedes probar la conformidad del servidor STDIO en cualquier terminal:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n' | node build/index.js
```

**Respuesta esperada:**
```json
{
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "listChanged": true },
      "prompts": { "listChanged": true }
    },
    "serverInfo": { "name": "fansly-mcp", "version": "0.1.0" }
  },
  "jsonrpc": "2.0",
  "id": 1
}
```
