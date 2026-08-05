-- =====================================================================
-- KMAlumnos — Migración: el alumno solicita reservas desde el portal
-- Fecha: 2026-08-06
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE:
--   1. Crea una SECUENCIA propia para los ids de las reservas creadas
--      desde el PORTAL del alumno, en un rango ALTO y DISJUNTO del que usa
--      el escritorio. El escritorio asigna ids pequeños y secuenciales por
--      dispositivo (1, 2, 3...); el portal usa ids >= 1.000.000.000. Así
--      una reserva creada por un alumno en la web NUNCA choca con una
--      creada en la app de escritorio (rangos que no se solapan). Para
--      que el rango se mantenga separado, sync.js NO avanza su contador
--      local `_seq.r` con ids >= 1.000.000.000 (ver el cambio acompañante
--      en sync.js) — el escritorio nunca invade el rango del portal.
--   2. Función `portal_solicitar_reserva(...)`: el alumno autenticado
--      (email verificado en el JWT) crea una reserva en estado
--      'solicitada' (origen 'portal') para SU propia ficha. La autoescuela
--      la verá en la Agenda como "solicitada" y podrá confirmarla o
--      cancelarla.
--   3. Amplía `portal_mis_datos()` para devolver también las PRÓXIMAS
--      clases del alumno (sus reservas solicitadas/confirmadas de hoy en
--      adelante), para que el alumno vea el estado de lo que ha pedido.
--
-- REQUIERE: `2026-08-05_reservas.sql`, `2026-08-05_reservas_n_practicas.sql`
--   y `2026-08-05_portal_alumno.sql` ya aplicadas (todas lo están).
--
-- SEGURIDAD: mismas garantías que el resto del portal. Ambas funciones son
--   SECURITY DEFINER acotadas: el alumno solo puede tocar SU ficha porque
--   el email sale del JWT verificado (no es un parámetro falseable), y todo
--   queda gateado por `empresa_tiene_portal` (módulo contratado). La
--   duración se estima como n_practicas × 45 min (el servidor no conoce el
--   ajuste "minutos por clase" del escritorio); la autoescuela puede
--   ajustarla al confirmar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Secuencia de ids del portal (rango alto disjunto del escritorio).
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.reservas_portal_id_seq
  START WITH 1000000000 INCREMENT BY 1 MINVALUE 1000000000;

-- ---------------------------------------------------------------------
-- 2) El alumno solicita una reserva (estado 'solicitada', origen 'portal').
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_solicitar_reserva(
  p_fecha text, p_hora text, p_n_practicas int, p_nota text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  text;
  v_alumno record;
  v_id     int;
  v_n      int;
BEGIN
  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL OR trim(v_email) = '' THEN RETURN NULL; END IF;

  SELECT id, empresa_id, sucursal_id
    INTO v_alumno
    FROM public.alumnos
   WHERE lower(email) = lower(v_email)
     AND deleted = false
   ORDER BY id DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT public.empresa_tiene_portal(v_alumno.empresa_id) THEN RETURN NULL; END IF;

  -- Validación de entrada
  IF p_fecha IS NULL OR p_fecha !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'fecha no válida';
  END IF;
  v_n  := GREATEST(1, LEAST(COALESCE(p_n_practicas, 1), 10));
  v_id := nextval('public.reservas_portal_id_seq');

  INSERT INTO public.reservas
    (id, alumno_id, empresa_id, sucursal_id, fecha, hora_inicio,
     duracion_min, estado, origen, n_practicas, nota, deleted, updated_at)
  VALUES
    (v_id, v_alumno.id, v_alumno.empresa_id, v_alumno.sucursal_id, p_fecha,
     NULLIF(btrim(COALESCE(p_hora, '')), ''), v_n * 45, 'solicitada', 'portal',
     v_n, left(COALESCE(p_nota, ''), 500), false, now());

  RETURN json_build_object(
    'ok', true, 'id', v_id, 'fecha', p_fecha, 'estado', 'solicitada', 'n_practicas', v_n
  );
END;
$$;

COMMENT ON FUNCTION public.portal_solicitar_reserva(text, text, int, text) IS
  'Portal del alumno: el alumno autenticado (email del JWT) crea una '
  'reserva ''solicitada'' para su propia ficha. id de la secuencia '
  'reservas_portal_id_seq (rango alto disjunto del escritorio). Gateado '
  'por empresa_tiene_portal.';

REVOKE EXECUTE ON FUNCTION public.portal_solicitar_reserva(text, text, int, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.portal_solicitar_reserva(text, text, int, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) portal_mis_datos(): ahora devuelve también las próximas clases.
--    (CREATE OR REPLACE con el cuerpo anterior + bloque de reservas.)
-- ---------------------------------------------------------------------
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
  v_reservas  json;
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

  -- Próximas clases: reservas solicitadas/confirmadas de hoy en adelante.
  SELECT json_agg(fila2) INTO v_reservas
    FROM (
      SELECT rs.fecha, rs.hora_inicio, rs.estado, rs.n_practicas,
             pf.nombre AS profesor_nombre
      FROM public.reservas rs
      LEFT JOIN public.profesores pf ON pf.id = rs.profesor_id AND pf.deleted = false
      WHERE rs.alumno_id = v_alumno.id
        AND rs.deleted = false
        AND rs.estado IN ('solicitada', 'confirmada')
        AND rs.fecha >= to_char(current_date, 'YYYY-MM-DD')
      ORDER BY rs.fecha ASC, rs.hora_inicio ASC NULLS LAST
      LIMIT 50
    ) fila2;

  RETURN json_build_object(
    'alumno', json_build_object('id', v_alumno.id, 'nombre', v_alumno.nombre, 'permiso', v_alumno.permiso),
    'total', v_total,
    'practicas', COALESCE(v_practicas, '[]'::json),
    'reservas', COALESCE(v_reservas, '[]'::json)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.portal_mis_datos() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.portal_mis_datos() TO authenticated;

COMMIT;

-- Rollback: ver 2026-08-06_portal_reservas_ROLLBACK.sql
