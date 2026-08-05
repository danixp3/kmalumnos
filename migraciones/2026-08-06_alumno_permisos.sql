-- =====================================================================
-- KMAlumnos — Migración: permisos múltiples del alumno (tarea B1)
-- Fecha: 2026-08-06
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Añade 1 columna a `alumnos`, nullable: `permisos` (jsonb, array de
--   códigos de permiso que el alumno cursa ADEMÁS del `permiso` principal,
--   que NO cambia — sigue siendo la columna que rige tarifas/pagos). Es
--   puramente de datos: no cambia ningún comportamiento existente.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, la app de escritorio sigue funcionando en "modo clásico":
-- sync.js detecta en runtime que la columna `permisos` no existe (mismo
-- patrón que `_alumnosLibroDisponible`) y nunca la incluye en el payload
-- de subida de alumnos, así que el resto de la sincronización no se ve
-- afectado.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) La columna nueva: nullable, sin default. Se sube desde la app como
--    JSON string (JSON.stringify) y postgres la guarda como jsonb; el
--    valor por defecto en local es [] (array vacío), nunca null.
-- ---------------------------------------------------------------------
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS permisos jsonb;

COMMENT ON COLUMN public.alumnos.permisos IS 'Permisos que el alumno cursa ADEMÁS del permiso principal (array de códigos, ej. ["A2","BE"]). El permiso principal sigue en la columna `permiso` y no cambia.';

COMMIT;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- ALTER TABLE public.alumnos DROP COLUMN IF EXISTS permisos;
