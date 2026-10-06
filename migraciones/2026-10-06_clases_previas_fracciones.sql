-- =====================================================================
-- AulaMovil — Migración: «clases ya hechas» con ¼ ½ ¾ (2026-10-06)
-- =====================================================================
-- `alumnos.clases_previas` (clases hechas antes de usar la app, el punto de
-- partida de la Puesta en marcha) pasa de integer a numeric(6,2) para admitir
-- fracciones de clase de ¼ en ¼ (12,5 = doce clases y media), igual que las
-- prácticas, que ya llevan su `fraccion` desde la migración 2026-10-02.
--
-- Compatible con lo que ya hay:
--   - Los valores enteros se conservan tal cual (12 → 12.00).
--   - Ninguna vista ni función depende de la columna (comprobado antes).
--   - La web y el escritorio leen el valor como número (PostgREST devuelve
--     numeric como número JSON). El escritorio 1.28.x lo redondea al subir;
--     el 1.29.0 sube el valor con su fracción.
-- =====================================================================

ALTER TABLE public.alumnos
  ALTER COLUMN clases_previas TYPE numeric(6,2) USING clases_previas::numeric(6,2);

ALTER TABLE public.alumnos DROP CONSTRAINT IF EXISTS alumnos_clases_previas_rango;
ALTER TABLE public.alumnos ADD CONSTRAINT alumnos_clases_previas_rango
  CHECK (clases_previas IS NULL OR clases_previas >= 0);

COMMENT ON COLUMN public.alumnos.clases_previas IS 'Clases prácticas hechas antes de usar la app, de ¼ en ¼ (12.5 = doce y media). NULL = 0.';
