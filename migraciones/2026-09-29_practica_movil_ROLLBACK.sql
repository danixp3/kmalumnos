-- ROLLBACK de 2026-09-29_practica_movil.sql
ALTER TABLE public.practicas DROP COLUMN IF EXISTS firma;
ALTER TABLE public.practicas DROP COLUMN IF EXISTS trabajado;
ALTER TABLE public.practicas DROP COLUMN IF EXISTS tipo_detalle;
ALTER TABLE public.practicas DROP COLUMN IF EXISTS hora_fin;
