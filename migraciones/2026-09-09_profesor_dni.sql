-- =====================================================================
-- KMAlumnos — Migración: DNI/NIE del profesor (ficha DGT)
-- Fecha: 2026-09-09
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Añade 1 columna de texto, nullable, a `profesores`: `dni`. Es
--   puramente de datos: rellena el DNI/NIE del profesor que exige el
--   impreso oficial DGT de formación práctica, sin cambiar ningún
--   comportamiento existente.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, la app de escritorio sigue funcionando en "modo clásico":
-- sync.js detecta en runtime que la columna no existe (mismo patrón
-- que `_pagosCamposDisponible`, ver `_profesoresDniDisponible`) y
-- nunca la incluye en el payload de subida de profesores, así que el
-- resto de la sincronización no se ve afectado.
-- =====================================================================

BEGIN;

ALTER TABLE public.profesores ADD COLUMN IF NOT EXISTS dni text;

COMMENT ON COLUMN public.profesores.dni IS 'DNI/NIE del profesor, para la ficha DGT. NULL = sin registrar.';

COMMIT;

-- =====================================================================
-- ROLLBACK — ejecutar 2026-09-09_profesor_dni_ROLLBACK.sql para deshacer.
-- =====================================================================
