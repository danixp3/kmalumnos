-- =====================================================================
-- KMAlumnos — Migración: nº de prácticas de una reserva (agenda,
-- ROADMAP-SAAS.md → Fase 0 · Bloque 2, mejoras de agenda)
-- Fecha: 2026-08-05
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Añade una columna `n_practicas` a `reservas` (integer, default 1):
--   cuántas prácticas representa la reserva. El modal de la agenda ya
--   no pide "duración en minutos" directamente, pide "nº de prácticas"
--   y calcula la duración sola (n_practicas × minutos por clase,
--   ajuste configurable en Ajustes). Al completar una reserva
--   ('realizada') la app crea automáticamente esas N prácticas para el
--   alumno — ver db/reservas.js:completarReserva.
--
-- REQUIERE: `2026-08-05_reservas.sql` ya aplicada (la tabla `reservas`
-- tiene que existir antes de poder añadirle esta columna).
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, la tabla `reservas` sigue sin existir en Supabase (si
-- `2026-08-05_reservas.sql` tampoco está aplicada) o existe sin esta
-- columna: en ambos casos sync.js sigue tratando reservas como "modo
-- clásico" vía `_reservasDisponible()` y, si la tabla existe pero le
-- falta la columna, el upsert de subida fallaría — por eso esta
-- migración debe aplicarse ANTES de que el código que sube
-- `n_practicas` llegue a producción real con clientes usando la nube.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Columna `n_practicas`: entero >= 1, default 1 (las reservas ya
--    existentes, creadas antes de esta migración, quedan con 1 —
--    coincide con su duracion_min de 45 por defecto de entonces).
-- ---------------------------------------------------------------------
ALTER TABLE public.reservas ADD COLUMN IF NOT EXISTS n_practicas integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.reservas.n_practicas IS
  'Nº de prácticas que representa la reserva. duracion_min = n_practicas × '
  'minutos por clase (ajuste de Ajustes, default 45). Al completar la '
  'reserva (estado=realizada) la app crea automáticamente n_practicas '
  'prácticas para el alumno.';

COMMIT;

-- Rollback (red de seguridad, por si algo sale mal): ver el archivo
-- aparte 2026-08-05_reservas_n_practicas_ROLLBACK.sql, mismo criterio
-- que el resto de migraciones de esta carpeta.
