-- ROLLBACK de 2026-10-02_firma_profesor_fracciones.sql
-- OJO: borra las firmas de los profesores, las fracciones de clase (todas
-- vuelven a contar como clase entera) y los minutos acumulados de los alumnos.
BEGIN;

ALTER TABLE public.practicas DROP CONSTRAINT IF EXISTS practicas_fraccion_rango;
ALTER TABLE public.alumnos   DROP CONSTRAINT IF EXISTS alumnos_minutos_sobrantes_rango;
ALTER TABLE public.profesores DROP COLUMN IF EXISTS firma;
ALTER TABLE public.practicas  DROP COLUMN IF EXISTS fraccion;
ALTER TABLE public.alumnos    DROP COLUMN IF EXISTS minutos_sobrantes;

COMMIT;
