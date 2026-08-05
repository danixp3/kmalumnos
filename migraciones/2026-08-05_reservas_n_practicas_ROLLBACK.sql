-- =====================================================================
-- KMAlumnos — ROLLBACK de: nº de prácticas de una reserva
-- Fecha: 2026-08-05
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- Revierte 2026-08-05_reservas_n_practicas.sql. Si para entonces ya hay
-- reservas reales con `n_practicas` distinto de 1, ese dato se pierde
-- al hacer el DROP COLUMN — confirmar que no hace falta conservarlo (o
-- exportarlo antes con `SELECT id, n_practicas FROM reservas`) antes de
-- ejecutar este archivo.
-- =====================================================================

BEGIN;

ALTER TABLE public.reservas DROP COLUMN IF EXISTS n_practicas;

COMMIT;
