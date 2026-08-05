-- =====================================================================
-- KMAlumnos — ROLLBACK de 2026-08-06_alumno_datos.sql
--
-- ⚠️ Si para cuando se ejecute este rollback ya hay datos reales guardados
-- en cualquiera de estas 6 columnas (teléfono, DNI, fecha de nacimiento,
-- dirección, fecha de alta, observaciones), ESOS DATOS SE PIERDEN. No hay
-- forma de recuperarlos salvo por un backup previo (`data.json` local de
-- cada PC los conserva igualmente, ya que son datos locales primero).
-- =====================================================================

BEGIN;

ALTER TABLE public.alumnos DROP COLUMN IF EXISTS telefono;
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS dni;
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS fecha_nacimiento;
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS direccion;
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS fecha_alta;
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS observaciones;

COMMIT;
