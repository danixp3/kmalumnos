-- =====================================================================
-- KMAlumnos — ROLLBACK de 2026-08-06_alumno_estado.sql
--
-- ⚠️ Si para cuando se ejecute este rollback ya hay datos reales guardados
-- en la columna `estado`, ESOS DATOS SE PIERDEN. No hay forma de
-- recuperarlos salvo por un backup previo (`data.json` local de cada PC
-- los conserva igualmente, ya que son datos locales primero).
-- =====================================================================

BEGIN;

ALTER TABLE public.alumnos DROP COLUMN IF EXISTS estado;

COMMIT;
