-- =====================================================================
-- KMAlumnos — Migración: email de alumno (prerequisito del portal del
-- alumno por email, ROADMAP-SAAS.md → Fase 0 · Bloque 2)
-- Fecha: 2026-08-05
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Añade una columna `email` a `alumnos` (nullable, sin valor por
--   defecto) para que la app de escritorio pueda guardar el email del
--   alumno. Es el primer paso, puramente de datos, para que el alumno
--   pueda acceder más adelante a su portal con su email + un código
--   enviado por correo (login sin contraseña). Esta migración NO añade
--   ningún mecanismo de login todavía — solo el campo.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, la app de escritorio sigue funcionando en "modo clásico":
-- sync.js detecta en runtime que la columna no existe (mismo patrón que
-- `_sucursalesDisponible`) y nunca incluye `email` en el payload de
-- subida de alumnos, así que el resto de la sincronización no se ve
-- afectado.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Columna `email`: nullable, sin valor por defecto. Un alumno sin
--    email (el caso de hoy, para todos) simplemente no tiene portal
--    disponible por este camino.
-- ---------------------------------------------------------------------
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.alumnos.email IS
  'Email del alumno, para el futuro portal del alumno (login por email + '
  'código enviado por correo). NULL = sin email registrado.';

-- ---------------------------------------------------------------------
-- 2) Índice parcial en minúsculas: para cuando el portal busque un
--    alumno por email en el login, sin tener que normalizar mayúsculas
--    a mano en cada consulta ni indexar filas sin email.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_alumnos_email_lower
  ON public.alumnos (lower(email))
  WHERE email IS NOT NULL;

COMMIT;
