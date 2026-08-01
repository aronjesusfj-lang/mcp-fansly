# 05. Orquestación del Cliente IA (Claude Desktop / Cursor)

> **Sección original 5 de `desorden.txt`.** Para activar las capacidades locales de estas herramientas dentro de tu IDE o cliente LLM, inyecta la siguiente configuración en tu archivo `claude_desktop_config.json` o en la configuración de Cursor.

---

## 5.1. Configuración del cliente

```json
{
  "mcpServers": {
    "fansly-mcp-engine": {
      "command": "node",
      "args": ["/ruta/absoluta/a/fansly-mcp-server/dist/index.js"],
      "env": {
        "USER_DATA_DIR": "/ruta/absoluta/a/fansly-mcp-server/browser_data",
        "DB_PATH": "/ruta/absoluta/a/fansly-mcp-server/fansly_analytics.db",
        "HEADLESS": "true",
        "MAX_RETRIES": "3",
        "BACKOFF_BASE_MS": "1000"
      }
    }
  }
}
```

---

## 5.2. Nota Arquitectónica

> 📌 **Nota Arquitectónica:** Asegúrate de compilar primero TypeScript ejecutando `npm run build`, y reemplaza las rutas base por las absolutas de tu máquina local.

### Pasos

1. **Compilar** el servidor: `npm run build`.
2. **Reemplazar** `/ruta/absoluta/a/fansly-mcp-server/` por la ruta real del proyecto en tu máquina (obténla con `pwd`).
3. **Guardar** el archivo y **reiniciar** Claude Desktop / Cursor.

### Desglose de la configuración

| Campo | Valor | Descripción |
|-------|-------|-------------|
| `mcpServers.fansly-mcp-engine` | — | Nombre del servidor registrado en el cliente |
| `command` | `node` | Ejecutable de Node.js |
| `args` | `["…/dist/index.js"]` | Ruta absoluta al servidor compilado |
| `env` | `USER_DATA_DIR`, `DB_PATH`, `HEADLESS`, `MAX_RETRIES`, `BACKOFF_BASE_MS` | Variables de entorno inyectadas por el cliente (duplican el `.env`) |

---

## 5.3. Consideraciones detectadas en auditoría

> ⚠️ **Inconsistencia:** `package.json` compila a `dist/index.js` (script `start`), y aquí se apunta a `dist/index.js`, pero no existe `tsconfig.json` en el original que garantice esa salida. Además, el nombre del servidor difiere entre archivos:
> - `package.json` → `fansly-mcp-server-definitive`
> - `Server` en código → `fansly-mcp-server`
> - Cliente MCP → `fansly-mcp-engine`
>
> Ver [07-auditoria-2-arquitectura-seguridad.md](./07-auditoria-2-arquitectura-seguridad.md) → A2-4.

> ⚠️ **Doble fuente de config:** las variables de entorno están tanto en `.env` (cargado con `dotenv`) como en el bloque `env` del cliente MCP, lo que puede producir valores divergentes. Ver [07] → A2-6.
