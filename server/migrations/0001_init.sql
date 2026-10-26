-- Esquema inicial del servidor de licencias.
-- No se guardan datos personales: ni nombre, ni mail, ni IP en texto.

CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  -- HMAC-SHA256 del código de activación (nunca el código en texto)
  code_hash TEXT NOT NULL UNIQUE,
  -- HMAC-SHA256 del código de recuperación, creado al activar
  recovery_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  max_devices INTEGER NOT NULL DEFAULT 2,
  batch TEXT,
  -- referencia opcional de la venta (ej. número de orden). Evitar datos personales.
  reference TEXT,
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  revoked_at INTEGER,
  revoke_reason TEXT
);
CREATE INDEX licenses_batch ON licenses (batch);
CREATE INDEX licenses_reference ON licenses (reference);

CREATE TABLE devices (
  -- huella (RFC 7638) de la clave pública del dispositivo
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses (id),
  public_jwk TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  -- último timestamp firmado aceptado (evita reutilizar una firma)
  last_renew_ts INTEGER NOT NULL DEFAULT 0,
  removed_at INTEGER
);
CREATE INDEX devices_license ON devices (license_id, status);

CREATE TABLE transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL REFERENCES licenses (id),
  at INTEGER NOT NULL
);
CREATE INDEX transfers_license ON transfers (license_id, at);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE catalog_versions (
  version INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  recipes INTEGER NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT
);

CREATE TABLE error_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  app_version TEXT,
  place TEXT,
  message TEXT
);
CREATE INDEX error_reports_at ON error_reports (at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  admin TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);

INSERT INTO settings (key, value) VALUES
  ('default_max_devices', '2'),
  ('transfers_per_year', '3'),
  ('current_catalog_version', '0'),
  ('latest_app_version', '1.0.0');
