-- ROLLBACK de 2026-09-09_profesor_dni.sql
ALTER TABLE public.profesores DROP COLUMN IF EXISTS dni;
