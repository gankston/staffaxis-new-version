-- StaffAxis — esquema inicial PostgreSQL

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Sectores ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sectors (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    tipo_carga  VARCHAR(20)  NOT NULL DEFAULT 'importe',
    encargado   VARCHAR(100),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Dispositivos (auth device-based) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       VARCHAR(200) UNIQUE NOT NULL,
    sector_id       UUID        REFERENCES sectors(id),
    encargado_name  VARCHAR(100) NOT NULL,
    token           TEXT        UNIQUE,
    approved        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);

-- ─── Empleados ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_id   UUID        NOT NULL REFERENCES sectors(id),
    first_name  VARCHAR(100) NOT NULL,
    last_name   VARCHAR(100) NOT NULL DEFAULT '',
    dni         VARCHAR(20),
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_sector   ON employees(sector_id);
CREATE INDEX IF NOT EXISTS idx_employees_dni      ON employees(dni) WHERE dni IS NOT NULL;

-- ─── Submissions (horas) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID        NOT NULL REFERENCES employees(id),
    sector_id       UUID        NOT NULL REFERENCES sectors(id),
    date            DATE        NOT NULL,
    minutes_worked  VARCHAR(20),
    notes           TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'approved',
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_dedup
    ON submissions(employee_id, date) WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_submissions_sector_date
    ON submissions(sector_id, date);

CREATE INDEX IF NOT EXISTS idx_submissions_updated
    ON submissions(updated_at);

-- ─── Ausencias ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS absences (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID        NOT NULL REFERENCES employees(id),
    start_date      DATE        NOT NULL,
    end_date        DATE        NOT NULL,
    is_justified    BOOLEAN     NOT NULL DEFAULT FALSE,
    observations    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_absences_employee  ON absences(employee_id);
CREATE INDEX IF NOT EXISTS idx_absences_dates     ON absences(start_date, end_date);

-- ─── Trigger: updated_at automático en submissions ───────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_submissions_updated_at ON submissions;
CREATE TRIGGER trg_submissions_updated_at
    BEFORE UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
