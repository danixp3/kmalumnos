-- =====================================================================
-- AulaMovil — Migración: firma del profesor, fracciones de clase y minutos
-- acumulados del alumno
-- Fecha: 2026-10-02
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (todo aditivo, no toca datos existentes):
--   1) `profesores.firma` (text): firma del profesor (data URL de una imagen
--      PNG pequeña). Se dibuja una vez (escritorio o móvil) y firma todas sus
--      clases en la ficha DGT. NULL = sin firma.
--   2) `practicas.fraccion` (numeric): lo que vale la clase si no es entera
--      (0.25 = ¼, 0.5 = ½, 0.75 = ¾). NULL = una clase entera (todas las
--      que ya existen). Cuenta en cobros, ficha DGT y totales.
--   3) `alumnos.minutos_sobrantes` (numeric): minutos que le sobran al
--      alumno de las clases registradas por minutos en el móvil; en cuanto
--      suman ¼ de clase, se anotan como clase. NULL = 0. Solo la escribe la web.
--
-- Compatibilidad: las versiones ya instaladas ignoran las columnas nuevas
-- (sus subidas no las mencionan, así que no las pisan) y cuentan cada
-- práctica como una clase entera hasta actualizarse.
-- ROLLBACK: 2026-10-02_firma_profesor_fracciones_ROLLBACK.sql
-- =====================================================================

BEGIN;

ALTER TABLE public.profesores ADD COLUMN IF NOT EXISTS firma text;
ALTER TABLE public.practicas  ADD COLUMN IF NOT EXISTS fraccion numeric(3,2);
ALTER TABLE public.alumnos    ADD COLUMN IF NOT EXISTS minutos_sobrantes numeric(7,2);

ALTER TABLE public.practicas DROP CONSTRAINT IF EXISTS practicas_fraccion_rango;
ALTER TABLE public.practicas ADD CONSTRAINT practicas_fraccion_rango
  CHECK (fraccion IS NULL OR (fraccion > 0 AND fraccion < 1));
ALTER TABLE public.alumnos DROP CONSTRAINT IF EXISTS alumnos_minutos_sobrantes_rango;
ALTER TABLE public.alumnos ADD CONSTRAINT alumnos_minutos_sobrantes_rango
  CHECK (minutos_sobrantes IS NULL OR minutos_sobrantes >= 0);

COMMENT ON COLUMN public.profesores.firma IS 'Firma del profesor (data URL de una imagen PNG pequeña) para las fichas DGT. NULL = sin firma.';
COMMENT ON COLUMN public.practicas.fraccion IS 'Fracción de clase: 0.25, 0.5 o 0.75. NULL = clase entera.';
COMMENT ON COLUMN public.alumnos.minutos_sobrantes IS 'Minutos acumulados de clases por minutos (menos de ¼ de clase). NULL = 0. Los escribe la web.';

COMMIT;
