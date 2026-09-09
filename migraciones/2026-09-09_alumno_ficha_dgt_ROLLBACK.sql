-- ROLLBACK de 2026-09-09_alumno_ficha_dgt.sql
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS primer_apellido;
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS segundo_apellido;
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS codigo_postal;
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS poblacion;
