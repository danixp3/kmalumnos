-- =====================================================================
-- KMAlumnos — ROLLBACK de: email de alumno
-- Fecha: 2026-08-05
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- Revierte 2026-08-05_alumno_email.sql. Si para entonces ya hay emails
-- de alumnos guardados de verdad, esos datos se pierden al hacer el
-- DROP COLUMN — confirmar que no hace falta conservarlos (o exportarlos
-- antes con `SELECT id, email FROM alumnos WHERE email IS NOT NULL`)
-- antes de ejecutar este archivo.
-- =====================================================================

BEGIN;

DROP INDEX IF EXISTS public.idx_alumnos_email_lower;
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS email;

COMMIT;
