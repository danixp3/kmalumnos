-- =====================================================================
-- KMAlumnos — ROLLBACK: portal del alumno (solo lectura)
-- Revierte 2026-08-05_portal_alumno.sql
--
-- ADVERTENCIA: si para cuando se ejecuta este rollback ya hay alumnos
-- con `portal_token` asignado (portal en uso real), esos tokens se
-- pierden al borrar la columna y cualquier enlace ya repartido a un
-- alumno deja de funcionar. No borra ninguna otra fila ni dato: solo
-- quita la columna, el índice y la función añadidos por la migración.
-- =====================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.portal_alumno_datos(int, text);

DROP INDEX IF EXISTS public.idx_alumnos_portal_token;

ALTER TABLE public.alumnos DROP COLUMN IF EXISTS portal_token;

COMMIT;
