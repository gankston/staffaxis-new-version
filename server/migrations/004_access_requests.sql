-- Sistema de autorización de dispositivos (reemplaza el auto-aprobado de siempre).
-- Un empleado pide autorización con nombre completo -> queda pendiente en access_requests
-- -> alguien con StaffAdmin la autoriza (o rechaza) -> el device queda habilitado 1 año.

-- ─── Solicitudes de autorización ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_requests (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_id       UUID        NOT NULL REFERENCES sectors(id),
    device_id       VARCHAR(200) NOT NULL,
    full_name       VARCHAR(150) NOT NULL,
    phone_model     VARCHAR(150),
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | authorized | rejected
    authorized_by   VARCHAR(200),   -- email de Google de quien lo autorizo/rechazo
    authorized_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status    ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_device_id ON access_requests(device_id);

-- ─── Dispositivos: teléfono maestro, revocación, modelo de teléfono ────────
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_master   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS revoked     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS phone_model VARCHAR(150);

-- ─── Submissions: ubicación de cada tarja cargada ──────────────────────────
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
