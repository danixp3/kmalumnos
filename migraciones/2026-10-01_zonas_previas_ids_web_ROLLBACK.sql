-- ROLLBACK de 2026-10-01_zonas_previas_ids_web.sql
-- Devuelve los ids por defecto a las secuencias clásicas y quita lo añadido.
-- OJO: borra las zonas registradas, los ajustes compartidos y los puntos de
-- partida de los alumnos. Las filas con id >= 1e9 se conservan.
BEGIN;

ALTER TABLE public.practicas ALTER COLUMN id SET DEFAULT nextval('public.practicas_id_seq');
ALTER TABLE public.alumnos   ALTER COLUMN id SET DEFAULT nextval('public.alumnos_id_seq');
DROP SEQUENCE IF EXISTS public.practicas_web_id_seq;
DROP SEQUENCE IF EXISTS public.alumnos_web_id_seq;

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
      EXECUTE format('SELECT coalesce(max(id), 0) FROM public.%I', t) INTO mx;
      PERFORM setval(seq, mx + 1, false);
    END IF;
  END LOOP;
END;
$function$;

ALTER TABLE public.alumnos DROP COLUMN IF EXISTS clases_previas;
ALTER TABLE public.alumnos DROP COLUMN IF EXISTS km_previos;
ALTER TABLE public.practicas DROP COLUMN IF EXISTS firmada;
ALTER TABLE public.practicas DROP COLUMN IF EXISTS zonas;
DROP TABLE IF EXISTS public.ajustes_empresa;

COMMIT;
