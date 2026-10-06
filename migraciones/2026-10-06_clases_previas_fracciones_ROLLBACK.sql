-- Vuelta atrás de 2026-10-06_clases_previas_fracciones.sql: «clases ya hechas»
-- vuelve a ser un número entero (las fracciones se redondean).
ALTER TABLE public.alumnos DROP CONSTRAINT IF EXISTS alumnos_clases_previas_rango;
ALTER TABLE public.alumnos
  ALTER COLUMN clases_previas TYPE integer USING round(clases_previas)::integer;
COMMENT ON COLUMN public.alumnos.clases_previas IS 'Clases prácticas hechas antes de usar la app. NULL = 0.';
