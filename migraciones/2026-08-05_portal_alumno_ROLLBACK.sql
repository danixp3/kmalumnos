-- =====================================================================
-- KMAlumnos — ROLLBACK: portal del alumno (email OTP de Supabase Auth)
-- Revierte 2026-08-05_portal_alumno.sql
--
-- No hay columna ni índice que borrar en esta migración: la columna
-- `email` pertenece a `2026-08-05_alumno_email.sql` (rollback aparte,
-- `2026-08-05_alumno_email_ROLLBACK.sql`) y no se toca aquí. Este
-- rollback solo quita las dos funciones RPC.
-- =====================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.alumno_email_existe(text);
DROP FUNCTION IF EXISTS public.portal_mis_datos();

COMMIT;
