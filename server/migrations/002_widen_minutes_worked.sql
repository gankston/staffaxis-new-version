-- Amplía minutes_worked para el nuevo formato compuesto con Cajas/Cajones
-- Ej: "H 4|C:33|AB:47573,53|Cajas 999 Cajones 999" (~45 chars) supera el VARCHAR(20) original.
ALTER TABLE submissions ALTER COLUMN minutes_worked TYPE VARCHAR(80);
