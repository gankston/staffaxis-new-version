-- Fuerza nombre y apellido de empleados a MAYUSCULAS directamente en la base.
-- Se aplica solo, sin que las apps (Android / StaffAdmin) tengan que cambiar nada:
-- mandan "juan perez" y la base guarda "JUAN PEREZ".
-- UPPER respeta acentos y ñ (josé núñez -> JOSÉ NÚÑEZ).

CREATE OR REPLACE FUNCTION employees_upper_names()
RETURNS TRIGGER AS $$
BEGIN
    -- TRIM ademas limpia espacios sobrantes al principio/final.
    -- UPPER(NULL) e TRIM(NULL) devuelven NULL, asi que los vacios quedan intactos.
    NEW.first_name := UPPER(TRIM(NEW.first_name));
    NEW.last_name  := UPPER(TRIM(NEW.last_name));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employees_upper_names ON employees;

CREATE TRIGGER trg_employees_upper_names
    BEFORE INSERT OR UPDATE OF first_name, last_name ON employees
    FOR EACH ROW
    EXECUTE FUNCTION employees_upper_names();
