-- ROLLBACK de 2026-11-06_examenes.sql
-- Borra la tabla `presentaciones` de la nube (los exámenes siguen en el data.json de cada PC) y
-- devuelve ids_maximos() a la versión anterior. Antes: SELECT * FROM presentaciones guardado en un archivo
-- si ya hay exámenes anotados desde el móvil (esos solo existen en la nube hasta que el escritorio los baje).
BEGIN;

DROP TABLE IF EXISTS public.presentaciones CASCADE;
DROP SEQUENCE IF EXISTS public.presentaciones_web_id_seq;

CREATE OR REPLACE FUNCTION public.ids_maximos()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'vehiculos',  (SELECT coalesce(max(id), 0) FROM public.vehiculos  WHERE id < 1000000000),
    'profesores', (SELECT coalesce(max(id), 0) FROM public.profesores WHERE id < 1000000000),
    'alumnos',    (SELECT coalesce(max(id), 0) FROM public.alumnos    WHERE id < 1000000000),
    'practicas',  (SELECT coalesce(max(id), 0) FROM public.practicas  WHERE id < 1000000000),
    'tarifas',    (SELECT coalesce(max(id), 0) FROM public.tarifas    WHERE id < 1000000000),
    'pagos',      (SELECT coalesce(max(id), 0) FROM public.pagos      WHERE id < 1000000000),
    'sucursales', (SELECT coalesce(max(id), 0) FROM public.sucursales WHERE id < 1000000000),
    'reservas',   (SELECT coalesce(max(id), 0) FROM public.reservas   WHERE id < 1000000000),
    'cargos',     (SELECT coalesce(max(id), 0) FROM public.cargos     WHERE id < 1000000000)
  );
$$;
REVOKE ALL ON FUNCTION public.ids_maximos() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ids_maximos() TO authenticated;

COMMIT;
