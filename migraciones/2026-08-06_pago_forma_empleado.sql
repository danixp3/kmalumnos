-- =====================================================================
-- KMAlumnos — Migración: forma de pago y empleado en `pagos` (arqueo de caja)
-- Fecha: 2026-08-06
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Añade 2 columnas a `pagos`, ambas nullable y opcionales: `forma_pago`
--   (texto libre, valores que escribe la app: efectivo | tarjeta |
--   transferencia | bizum | otro) y `empleado` (texto libre, nombre de
--   quien anotó el cobro). Es puramente de datos: no cambia ningún
--   comportamiento existente (tarea D1 del PLAN-MAESTRO, arqueo de caja
--   por empleado/sede + formas de pago + morosidad).
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, la app de escritorio sigue funcionando en "modo clásico":
-- sync.js detecta en runtime que la columna `forma_pago` no existe
-- (mismo patrón que `_alumnosLibroDisponible`) y nunca incluye estos 2
-- campos en el payload de subida de pagos, así que el resto de la
-- sincronización no se ve afectado.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Las 2 columnas nuevas: nullable, sin default.
--    `forma_pago` valores válidos que escribe la app: 'efectivo' |
--    'tarjeta' | 'transferencia' | 'bizum' | 'otro'. Cualquier otro valor
--    (o NULL) se guarda como NULL.
-- ---------------------------------------------------------------------
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS forma_pago text;
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS empleado text;

COMMENT ON COLUMN public.pagos.forma_pago IS 'Forma de pago: efectivo | tarjeta | transferencia | bizum | otro. NULL = sin especificar.';
COMMENT ON COLUMN public.pagos.empleado IS 'Nombre del empleado/jefe que anotó el cobro (texto libre). NULL = sin asignar.';

COMMIT;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- ALTER TABLE public.pagos DROP COLUMN IF EXISTS forma_pago;
-- ALTER TABLE public.pagos DROP COLUMN IF EXISTS empleado;
