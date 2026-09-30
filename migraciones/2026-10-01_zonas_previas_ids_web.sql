-- =====================================================================
-- AulaMovil — Migración: zonas recorridas, punto de partida del alumno e
-- ids de la web en un rango propio
-- Fecha: 2026-10-01
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (todo aditivo, no toca datos existentes):
--   1) Ajustes compartidos por empresa (`ajustes_empresa`): pares
--      clave → valor JSON que el escritorio edita y la web del móvil lee.
--      Primer uso: clave 'zonas' = lista de zonas de prácticas configurada
--      en Ajustes del escritorio. Lectura para toda la empresa; escritura
--      solo jefe.
--   2) `practicas.zonas` (jsonb): zonas recorridas en la clase, marcadas
--      en el móvil. NULL = sin registrar.
--   3) `alumnos.clases_previas` / `alumnos.km_previos` (integer): clases y
--      km que el alumno ya hizo ANTES de empezar a usar la app (punto de
--      partida). NULL = 0. La numeración de clases y los totales los suman.
--   4) Ids de lo creado desde la web en un rango propio (>= 1.000.000.000),
--      igual que ya se hacía con las reservas del portal: el escritorio
--      numera con su propio contador (< 1e9) y la web con estas secuencias,
--      así nunca eligen el mismo número y una no pisa a la otra.
--      `reparar_secuencias()` se amplía para realinear ambos rangos.
--   5) `practicas.firmada` (boolean GENERADA = firma IS NOT NULL): las listas
--      y el calendario de la web saben si una clase está firmada sin
--      descargar la imagen de cada firma.
--
-- Compatibilidad: la app 1.18.0 ya instalada ignora las columnas/tabla
-- nuevas. Los ids >= 1e9 que baje los trata como uno más (el arreglo que
-- no adelanta su contador con ellos llega en la 1.19.0).
-- ROLLBACK: 2026-10-01_zonas_previas_ids_web_ROLLBACK.sql
-- =====================================================================

BEGIN;

-- 1) Ajustes compartidos por empresa ----------------------------------
CREATE TABLE IF NOT EXISTS public.ajustes_empresa (
  empresa_id  uuid        NOT NULL,
  clave       text        NOT NULL,
  valor       jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, clave)
);
COMMENT ON TABLE public.ajustes_empresa IS
  'Ajustes compartidos entre el escritorio y la web del móvil, por empresa (p. ej. clave zonas = lista de zonas de prácticas).';

ALTER TABLE public.ajustes_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empresa_leer ON public.ajustes_empresa;
CREATE POLICY empresa_leer ON public.ajustes_empresa
  FOR SELECT TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()));

DROP POLICY IF EXISTS jefe_escribir ON public.ajustes_empresa;
CREATE POLICY jefe_escribir ON public.ajustes_empresa
  FOR ALL TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()) AND coalesce(rol_actual(), 'jefe') = 'jefe')
  WITH CHECK (empresa_id = coalesce(empresa_actual(), auth.uid()) AND coalesce(rol_actual(), 'jefe') = 'jefe');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ajustes_empresa TO authenticated;

-- 2) Zonas recorridas en cada práctica ---------------------------------
ALTER TABLE public.practicas ADD COLUMN IF NOT EXISTS zonas jsonb;
COMMENT ON COLUMN public.practicas.zonas IS 'Zonas recorridas en la clase (array JSON de textos). NULL = sin registrar.';

-- 3) Punto de partida del alumno ---------------------------------------
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS clases_previas integer;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS km_previos integer;
COMMENT ON COLUMN public.alumnos.clases_previas IS 'Clases prácticas hechas antes de usar la app. NULL = 0.';
COMMENT ON COLUMN public.alumnos.km_previos IS 'Km recorridos en prácticas antes de usar la app. NULL = 0.';

-- 4) Ids de la web en su propio rango ----------------------------------
CREATE SEQUENCE IF NOT EXISTS public.practicas_web_id_seq
  AS integer START 1000000000 MINVALUE 1000000000 MAXVALUE 2147483647;
CREATE SEQUENCE IF NOT EXISTS public.alumnos_web_id_seq
  AS integer START 1000000000 MINVALUE 1000000000 MAXVALUE 2147483647;
GRANT USAGE, SELECT ON SEQUENCE public.practicas_web_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.alumnos_web_id_seq TO authenticated;

ALTER TABLE public.practicas ALTER COLUMN id SET DEFAULT nextval('public.practicas_web_id_seq');
ALTER TABLE public.alumnos   ALTER COLUMN id SET DEFAULT nextval('public.alumnos_web_id_seq');

-- reparar_secuencias(): la web la llama si un insert choca (23505). Ahora
-- realinea las secuencias clásicas solo con los ids del escritorio (< 1e9)
-- y las de la web con los ids de su rango.
CREATE OR REPLACE FUNCTION public.reparar_secuencias()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t text;
  seq text;
  mx bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['practicas','alumnos','vehiculos','profesores','tarifas','pagos'] LOOP
    seq := coalesce(
      pg_get_serial_sequence('public.' || t, 'id'),
      to_regclass('public.' || t || '_id_seq')::text
    );
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT coalesce(max(id), 0) FROM public.%I WHERE id < 1000000000', t) INTO mx;
      PERFORM setval(seq, mx + 1, false);
    END IF;
  END LOOP;
  SELECT coalesce(max(id), 999999999) INTO mx FROM public.practicas WHERE id >= 1000000000;
  PERFORM setval('public.practicas_web_id_seq', mx + 1, false);
  SELECT coalesce(max(id), 999999999) INTO mx FROM public.alumnos WHERE id >= 1000000000;
  PERFORM setval('public.alumnos_web_id_seq', mx + 1, false);
END;
$function$;

-- 5) ¿Firmada? sin bajar la imagen -------------------------------------
ALTER TABLE public.practicas ADD COLUMN IF NOT EXISTS firmada boolean
  GENERATED ALWAYS AS (firma IS NOT NULL) STORED;

COMMIT;
