-- ROLLBACK de 2026-09-09_practica_hora_inicio.sql
ALTER TABLE public.practicas DROP COLUMN IF EXISTS hora_inicio;
