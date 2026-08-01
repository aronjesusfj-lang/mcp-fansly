# Activación del MCP Fansly en cualquier harness

Este servidor MCP se conecta por **STDIO** (estándar del protocolo), por lo que
funciona en cualquier cliente que soporte MCP: Claude Desktop, Cursor, Zed,
Codex CLI, OpenCode, GitHub Copilot, Roo Code, etc.

## Requisitos

- Node.js ≥ 20 instalado en el sistema.
- El proyecto compilado (`npm run build` ya genera `build/index.js`).
- Primera autenticación manual en Fansly (ver "Primer arranque").

## Archivos de configuración ya incluidos

| Archivo | Clientes que lo leen |
|---------|----------------------|
| `claude_desktop_config.json` | Claude Desktop (copiar a `~/Library/Application Support/Claude/`) |
| `.mcp.json` (raíz del proyecto) | Cursor, Zed, Copilot, Roo Code |
| `opencode.json` (raíz) | OpenCode |

## Configuración por harness

### 1. OpenCode
Usa el `opencode.json` ya presente en la raíz del proyecto. Si OpenCode no lo
detecta, coloca el bloque `mcp.fansly-mcp` en `opencode.json` global:
`~/.config/opencode/opencode.json` (mismo bloque, sin `$schema` local si no existe).

### 2. Claude Desktop
Copia `claude_desktop_config.json` a:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```
Luego reinicia Claude Desktop.

### 3. Cursor
Cursor lee `.mcp.json` de la raíz del proyecto automáticamente. Si no aparece,
ve a *Settings → MCP* y añade manualmente la entrada con `command=node` y
`args=[/ruta/al/build/index.js]` más las variables de entorno.

### 4. Zed
Zed lee `.mcp.json` de la raíz del proyecto. También puedes añadirlo a
`~/.config/zed/settings.json` dentro de la clave `"mcp_servers"`.

### 5. Codex CLI (OpenAI)
Edita `~/.codex/config.toml`:
```toml
[mcp_servers.fansly-mcp]
command = "node"
args = ["/Users/macos/Desktop/HERRAMIENTAS DE GESTION/EXTENSION-FANSLY/build/index.js"]
env = { "USER_DATA_DIR" = "/Users/macos/Desktop/HERRAMIENTAS DE GESTION/EXTENSION-FANSLY/browser_data", "DB_PATH" = "/Users/macos/Desktop/HERRAMIENTAS DE GESTION/EXTENSION-FANSLY/fansly_analytics.db", "HEADLESS" = "false" }
```

### 6. GitHub Copilot / Roo Code / otros
Usan `.mcp.json` de la raíz del proyecto (formato estándar `mcpServers`).

## Variables de entorno

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `USER_DATA_DIR` | `./browser_data` (absoluta en configs) | Perfil persistente de Chromium |
| `DB_PATH` | `./fansly_analytics.db` | Base de datos SQLite local |
| `HEADLESS` | `false` | `false` para primer login manual; `true` después |
| `MAX_RETRIES` | `3` | Reintentos del motor resiliente |
| `BACKOFF_BASE_MS` | `1000` | Base de backoff exponencial |
| `REQUEST_TIMEOUT_MS` | `30000` | Timeout por petición |

## Primer arranque (autenticación manual, una sola vez)

1. Asegúrate de que `HEADLESS="false"` esté en `opencode.json` / `.mcp.json` / `.env`.
2. Ejecuta el servidor una vez para que abra Chromium visible:
   ```bash
   npm run build && node build/index.js
   ```
3. En la ventana de Chromium que se abre, inicia sesión en fansly.com (si ya
   estás logueado, se reutiliza la sesión guardada en `browser_data/`).
4. Cierra el proceso (Ctrl+C).
5. Cambia `HEADLESS="true"` en la configuración del harness para que el servidor
   use la sesión guardada sin ventana.
6. Reinicia tu cliente MCP y prueba con: `obtener_metricas_perfil`.

## Verificación rápida

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node build/index.js
```

Debe responder con `"serverInfo":{"name":"fansly-mcp"}` y las capacidades
`tools/resources/prompts`.
