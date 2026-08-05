-- =====================================================================
-- KMAlumnos — Migración: ficha ampliada del alumno (teléfono, DNI,
-- fecha de nacimiento, dirección, fecha de alta, observaciones)
-- Fecha: 2026-08-06
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Añade 6 columnas de texto, todas nullable y sin valor por defecto,
--   a `alumnos`: `telefono`, `dni`, `fecha_nacimiento`, `direccion`,
--   `fecha_alta`, `observaciones`. Es puramente de datos: enriquece la
--   ficha del alumno con los campos que ya traen otros programas de
--   gestión de autoescuelas, sin cambiar ningún comportamiento existente.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, la app de escritorio sigue funcionando en "modo clásico":
-- sync.js detecta en runtime que las columnas no existen (mismo patrón
-- que `_alumnosEmailDisponible`/`_sucursalesDisponible`) y nunca incluye
-- estos 6 campos en el payload de subida de alumnos, así que el resto
-- de la sincronización no se ve afectado.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Las 6 columnas nuevas: todas texto, nullable, sin default. Las dos
--    fechas (`fecha_nacimiento`, `fecha_alta`) se guardan como texto
--    'YYYY-MM-DD', igual convención que el resto de fechas de la app
--    (sin zona horaria) — no `date` de Postgres, para no arrastrar
--    conversión de tipo alguna en el cliente.
-- ---------------------------------------------------------------------
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS telefono text;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS dni text;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS fecha_nacimiento text;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS fecha_alta text;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS observaciones text;

COMMENT ON COLUMN public.alumnos.telefono IS 'Teléfono de contacto del alumno. NULL = sin registrar.';
COMMENT ON COLUMN public.alumnos.dni IS 'DNI/NIE del alumno. NULL = sin registrar.';
COMMENT ON COLUMN public.alumnos.fecha_nacimiento IS 'Fecha de nacimiento, formato YYYY-MM-DD (texto, sin zona horaria). NULL = sin registrar.';
COMMENT ON COLUMN public.alumnos.direccion IS 'Dirección postal del alumno. NULL = sin registrar.';
COMMENT ON COLUMN public.alumnos.fecha_alta IS 'Fecha de alta del alumno en la autoescuela, formato YYYY-MM-DD (texto, sin zona horaria). NULL = sin registrar.';
COMMENT ON COLUMN public.alumnos.observaciones IS 'Notas libres sobre el alumno (no confundir con las notas de práctica). NULL = sin registrar.';

COMMIT;

-- =====================================================================
-- ROLLBACK — ejecutar 2026-08-06_alumno_datos_ROLLBACK.sql para deshacer.
-- =====================================================================
