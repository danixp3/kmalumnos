-- =====================================================================
-- KMAlumnos — Migración: libro de registro de alumnos (RD 1295/2003 art. 39)
-- Fecha: 2026-08-06
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Añade 5 columnas a `alumnos`, todas nullable y opcionales:
--   `n_inscripcion` (entero, nº secuencial en el libro), `permisos_posee`
--   (texto libre), `fecha_inicio`/`fecha_fin` (fechas de la enseñanza) y
--   `resultado` (apto | no_apto | baja). Es puramente de datos: no cambia
--   ningún comportamiento existente.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, la app de escritorio sigue funcionando en "modo clásico":
-- sync.js detecta en runtime que la columna `n_inscripcion` no existe
-- (mismo patrón que `_alumnosDatosDisponible`) y nunca incluye estos 5
-- campos en el payload de subida de alumnos, así que el resto de la
-- sincronización no se ve afectado.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Las 5 columnas nuevas: todas nullable, sin default.
--    `resultado` valores válidos que escribe la app: 'apto' | 'no_apto'
--    | 'baja'. Cualquier otro valor (o NULL) se guarda como NULL.
-- ---------------------------------------------------------------------
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS n_inscripcion integer;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS permisos_posee text;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS fecha_inicio date;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS fecha_fin date;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS resultado text;

COMMENT ON COLUMN public.alumnos.n_inscripcion IS 'Nº secuencial de inscripción en el libro de registro (RD 1295/2003 art. 39).';
COMMENT ON COLUMN public.alumnos.permisos_posee IS 'Permisos que el alumno YA posee (texto libre, ej. "B, A2").';
COMMENT ON COLUMN public.alumnos.fecha_inicio IS 'Fecha de inicio de la enseñanza para el permiso al que aspira.';
COMMENT ON COLUMN public.alumnos.fecha_fin IS 'Fecha de fin de la enseñanza.';
COMMENT ON COLUMN public.alumnos.resultado IS 'Resultado final: apto | no_apto | baja. NULL = sin resultado todavía.';

COMMIT;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- ALTER TABLE public.alumnos DROP COLUMN IF EXISTS n_inscripcion;
-- ALTER TABLE public.alumnos DROP COLUMN IF EXISTS permisos_posee;
-- ALTER TABLE public.alumnos DROP COLUMN IF EXISTS fecha_inicio;
-- ALTER TABLE public.alumnos DROP COLUMN IF EXISTS fecha_fin;
-- ALTER TABLE public.alumnos DROP COLUMN IF EXISTS resultado;
