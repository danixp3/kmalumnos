-- ROLLBACK de 2026-08-06_portal_reservas.sql
-- Quita la función de solicitud, la secuencia del portal, y restaura
-- portal_mis_datos() a su versión anterior (sin el bloque de reservas).
BEGIN;

DROP FUNCTION IF EXISTS public.portal_solicitar_reserva(text, text, int, text);
DROP SEQUENCE IF EXISTS public.reservas_portal_id_seq;

-- Restaurar portal_mis_datos() sin el bloque de "próximas clases".
CREATE OR REPLACE FUNCTION public.portal_mis_datos()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     text;
  v_alumno    record;
  v_total     int;
  v_practicas json;
BEGIN
  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL OR trim(v_email) = '' THEN RETURN NULL; END IF;

  SELECT id, nombre, permiso, empresa_id
    INTO v_alumno
    FROM public.alumnos
   WHERE lower(email) = lower(v_email)
     AND deleted = false
   ORDER BY id DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT public.empresa_tiene_portal(v_alumno.empresa_id) THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_total
    FROM public.practicas
   WHERE alumno_id = v_alumno.id AND deleted = false;

  SELECT json_agg(fila) INTO v_practicas
    FROM (
      SELECT pr.fecha, pr.tipo, pr.km_inicial, pr.km_final, pr.nota,
             pf.nombre AS profesor_nombre
      FROM public.practicas pr
      LEFT JOIN public.profesores pf ON pf.id = pr.profesor_id AND pf.deleted = false
      WHERE pr.alumno_id = v_alumno.id AND pr.deleted = false
      ORDER BY pr.fecha DESC
      LIMIT 50
    ) fila;

  RETURN json_build_object(
    'alumno', json_build_object('id', v_alumno.id, 'nombre', v_alumno.nombre, 'permiso', v_alumno.permiso),
    'total', v_total,
    'practicas', COALESCE(v_practicas, '[]'::json)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.portal_mis_datos() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.portal_mis_datos() TO authenticated;

COMMIT;
