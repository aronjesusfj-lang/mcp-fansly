# 03. Esquema de Base de Datos Local (SQLite)

> **Sección original 3 del documento de especificación inicial** (`desorden.txt`, ya eliminado). El sistema utiliza `better-sqlite3` para almacenar series temporales y realizar cálculos de crecimiento, churn y proyecciones.

---

## 3.1. Esquema completo

```sql
-- Snapshots diarios de rendimiento general
CREATE TABLE IF NOT EXISTS daily_snapshots (
  date TEXT PRIMARY KEY,
  total_followers INTEGER NOT NULL,
  active_subscribers INTEGER NOT NULL,
  gross_earnings REAL NOT NULL,
  churned_subscribers INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Métricas individuales por publicación
CREATE TABLE IF NOT EXISTS post_metrics (
  post_id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  tips_amount REAL DEFAULT 0.0,
  unlocks_count INTEGER DEFAULT 0,
  posted_at TIMESTAMP NOT NULL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rendimiento de enlaces de seguimiento (Tracking Links)
CREATE TABLE IF NOT EXISTS tracking_links (
  link_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_generated REAL DEFAULT 0.0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3.2. Tabla `daily_snapshots` — Snapshots diarios de rendimiento general

Captura el estado del perfil una vez al día para calcular crecimiento (WoW/MoM), churn y proyecciones.

| Columna | Tipo | Restricción | Descripción |
|---------|------|-------------|-------------|
| `date` | TEXT | **PRIMARY KEY** | Fecha del snapshot (formato ISO `YYYY-MM-DD`) |
| `total_followers` | INTEGER | NOT NULL | Total de seguidores |
| `active_subscribers` | INTEGER | NOT NULL | Suscriptores activos |
| `gross_earnings` | REAL | NOT NULL | Ingresos brutos |
| `churned_subscribers` | INTEGER | NOT NULL | Suscriptores cancelados / churn |
| `created_at` | TIMESTAMP | DEFAULT `CURRENT_TIMESTAMP` | Marca de tiempo de inserción |

---

## 3.3. Tabla `post_metrics` — Métricas individuales por publicación

Métricas de engagement y monetización por publicación.

| Columna | Tipo | Restricción | Descripción |
|---------|------|-------------|-------------|
| `post_id` | TEXT | **PRIMARY KEY** | Identificador único de la publicación |
| `media_type` | TEXT | NOT NULL | Tipo de media (imagen, video, audio…) |
| `likes_count` | INTEGER | DEFAULT `0` | Número de likes |
| `tips_amount` | REAL | DEFAULT `0.0` | Importe total de propinas |
| `unlocks_count` | INTEGER | DEFAULT `0` | Número de desbloqueos (compras) |
| `posted_at` | TIMESTAMP | NOT NULL | Fecha de publicación |
| `fetched_at` | TIMESTAMP | DEFAULT `CURRENT_TIMESTAMP` | Fecha de extracción del dato |

---

## 3.4. Tabla `tracking_links` — Rendimiento de enlaces de seguimiento (Tracking Links)

Rendimiento de enlaces de atribución externos.

| Columna | Tipo | Restricción | Descripción |
|---------|------|-------------|-------------|
| `link_id` | TEXT | **PRIMARY KEY** | Identificador único del enlace |
| `label` | TEXT | NOT NULL | Etiqueta / nombre del enlace |
| `clicks` | INTEGER | DEFAULT `0` | Clics recibidos |
| `conversions` | INTEGER | DEFAULT `0` | Conversiones logradas |
| `revenue_generated` | REAL | DEFAULT `0.0` | Ingresos generados |
| `updated_at` | TIMESTAMP | DEFAULT `CURRENT_TIMESTAMP` | Última actualización |

---

## 3.5. Modelo de datos y observaciones

- Las tres tablas usan `IF NOT EXISTS` y se crean directamente desde el código del servidor (sin migraciones versionadas).
- `date` como `PRIMARY KEY` en `daily_snapshots` garantiza un snapshot por día (upsert natural con `INSERT OR REPLACE`).
- `post_id` como `PRIMARY KEY` evita duplicados al re-extraer métricas.
- `link_id` como `PRIMARY KEY` idempotencia las actualizaciones de tracking links.

> ⚠️ **Hallazgo de auditoría:** El código del servidor **nunca escribe** en estas tablas: solo lee `daily_snapshots` en `obtener_reporte_crecimiento`. Las tablas `post_metrics` y `tracking_links`, y la escritura de snapshots, no se implementan. Ver [06-auditoria-1-codigo.md](./06-auditoria-1-codigo.md) → A1-7.
