-- =====================================================================
-- KMAlumnos — Migración: hora de inicio de la práctica (ficha DGT)
-- Fecha: 2026-09-09
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Añade 1 columna de texto, nullable, a `practicas`: `hora_inicio`
--   ("HH:MM"). Es puramente de datos: permite rellenar la hora de cada
--   clase práctica en el impreso oficial DGT de formación práctica, sin
--   cambiar ningún comportamiento existente.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, la app de escritorio sigue funcionando en "modo clásico":
-- sync.js detecta en runtime que la columna no existe (mismo patrón
-- que `_pagosCamposDisponible`, ver `_practicasHoraInicioDisponible`)
-- y nunca la incluye en el payload de subida de prácticas, así que el
-- resto de la sincronización no se ve afectado.
-- =====================================================================

BEGIN;

ALTER TABLE public.practicas ADD COLUMN IF NOT EXISTS hora_inicio text;

COMMENT ON COLUMN public.practicas.hora_inicio IS 'Hora de inicio de la clase práctica, formato HH:MM (texto, sin zona horaria). NULL = sin registrar.';

COMMIT;

-- =====================================================================
-- ROLLBACK — ejecutar 2026-09-09_practica_hora_inicio_ROLLBACK.sql para deshacer.
-- =====================================================================
