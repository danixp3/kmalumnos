-- =====================================================================
-- KMAlumnos — Migración: estado del alumno (activo / aprobado / baja)
-- Fecha: 2026-08-06
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Añade 1 columna de texto, nullable y sin valor por defecto, a
--   `alumnos`: `estado`. Es puramente de datos: permite marcar si un
--   alumno sigue en prácticas (activo), ya se ha sacado el permiso
--   (aprobado) o ha causado baja, sin cambiar ningún comportamiento
--   existente. NULL se trata como 'activo' en toda la app.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, la app de escritorio sigue funcionando en "modo clásico":
-- sync.js detecta en runtime que la columna no existe (reutiliza la
-- misma detección que `2026-08-06_alumno_datos.sql`, comprobando
-- `telefono`) y nunca incluye `estado` en el payload de subida de
-- alumnos, así que el resto de la sincronización no se ve afectado.
--
-- Pensada para aplicarse junto con `2026-08-06_alumno_datos.sql` (misma
-- comprobación de columna en sync.js), pero es independiente: no falla
-- si se aplica sola.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) La columna nueva: texto, nullable, sin default. Valores válidos que
--    escribe la app: 'activo' | 'aprobado' | 'baja'. Cualquier otro valor
--    (o NULL) se trata como 'activo' por defecto, tanto en local
--    (db/alumnos.js) como en el resto de dispositivos que lo bajen.
-- ---------------------------------------------------------------------
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS estado text;

COMMENT ON COLUMN public.alumnos.estado IS 'Estado del alumno: activo | aprobado | baja. NULL = activo (valor por defecto en la app).';

COMMIT;

-- =====================================================================
-- ROLLBACK — ejecutar 2026-08-06_alumno_estado_ROLLBACK.sql para deshacer.
-- =====================================================================
