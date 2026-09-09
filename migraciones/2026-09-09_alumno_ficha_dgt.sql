-- =====================================================================
-- KMAlumnos — Migración: ficha DGT del alumno (apellidos separados,
-- código postal y población)
-- Fecha: 2026-09-09
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Añade 4 columnas de texto, todas nullable y sin valor por defecto,
--   a `alumnos`: `primer_apellido`, `segundo_apellido`, `codigo_postal`,
--   `poblacion`. Es puramente de datos: rellena los campos que exige el
--   impreso oficial DGT de formación práctica (nombre y apellidos por
--   separado, dirección con CP y población), sin cambiar ningún
--   comportamiento existente. El campo `nombre` (ya existente) sigue
--   guardando el nombre completo tal cual, sin tocarse.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, la app de escritorio sigue funcionando en "modo clásico":
-- sync.js detecta en runtime que las columnas no existen (mismo patrón
-- que `_alumnosLibroDisponible`, ver `_alumnosFichaDgtDisponible`) y
-- nunca las incluye en el payload de subida de alumnos, así que el
-- resto de la sincronización no se ve afectado.
-- =====================================================================

BEGIN;

ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS primer_apellido text;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS segundo_apellido text;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS codigo_postal text;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS poblacion text;

COMMENT ON COLUMN public.alumnos.primer_apellido IS 'Primer apellido del alumno, para la ficha DGT. NULL = sin registrar.';
COMMENT ON COLUMN public.alumnos.segundo_apellido IS 'Segundo apellido del alumno, para la ficha DGT. NULL = sin registrar.';
COMMENT ON COLUMN public.alumnos.codigo_postal IS 'Código postal del alumno, para la ficha DGT. NULL = sin registrar.';
COMMENT ON COLUMN public.alumnos.poblacion IS 'Población del alumno, para la ficha DGT. NULL = sin registrar.';

COMMIT;

-- =====================================================================
-- ROLLBACK — ejecutar 2026-09-09_alumno_ficha_dgt_ROLLBACK.sql para deshacer.
-- =====================================================================
