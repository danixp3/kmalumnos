-- =====================================================================
-- AulaMovil — Migración: exámenes en la nube (los profesores los anotan desde el móvil)
-- Fecha: 2026-11-06
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- POR QUÉ: hasta ahora los exámenes (presentaciones a convocatoria) solo
-- existían en el `data.json` de cada PC: no viajaban a la nube, así que el
-- móvil no podía anotarlos. Con esta tabla el profesor anota el examen desde
-- el móvil cuando lo hace el alumno y el escritorio lo recibe con el sync (y
-- los de la oficina se ven en el móvil).
--
-- QUÉ HACE (aditivo, no toca datos):
--   · Tabla `presentaciones` (RLS por empresa, soft delete, como `reservas`).
--   · Secuencia propia de la web (`presentaciones_web_id_seq`, desde 1e9) para
--     que lo anotado en el móvil nunca choque con los ids del escritorio.
--   · `ids_maximos()` pasa a incluir también `presentaciones`.
--
-- COMPATIBILIDAD: el escritorio y la web detectan si la tabla existe
-- (sync.js → _presentacionesDisponible; web → 501 `examenes_no_disponibles`);
-- las versiones anteriores del escritorio no la conocen y siguen igual.
-- Requiere `empresa_actual()` (2026-08-01_roles_y_sucursales.sql).
-- =====================================================================

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.presentaciones_web_id_seq
  AS integer START 1000000000 MINVALUE 1000000000 MAXVALUE 2147483647;
GRANT USAGE, SELECT ON SEQUENCE public.presentaciones_web_id_seq TO authenticated;

CREATE TABLE IF NOT EXISTS public.presentaciones (
  id              integer PRIMARY KEY DEFAULT nextval('public.presentaciones_web_id_seq'),
  alumno_id       integer,
  profesor_id     integer,
  tipo            text NOT NULL DEFAULT 'circulacion'
                  CHECK (tipo IN ('teorico', 'maniobras', 'circulacion')),
  fecha           text,
  n_convocatoria  integer NOT NULL DEFAULT 1,
  resultado       text NOT NULL DEFAULT 'pendiente'
                  CHECK (resultado IN ('pendiente', 'apto', 'no_apto', 'aplazado', 'no_presentado')),
  nota            text DEFAULT '',
  permiso         text,
  examinador      text,
  vehiculo        text,
  fallos          integer,
  fallos_detalle  text,
  n_solicitud     integer,
  procedencia     text,
  origen          text DEFAULT 'desktop',
  empresa_id      uuid,
  sucursal_id     bigint,
  deleted         boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.presentaciones IS
  'Presentaciones a examen (teórico / maniobras / circulación) de cada alumno: '
  'fecha, convocatoria, resultado y, si se conocen, examinador, coche y fallos. '
  'origen = desktop | web-remote. deleted = soft delete, como el resto de tablas.';

-- Sin claves foráneas, como reservas: un borrado de alumno no debe llevarse el historial de exámenes.

ALTER TABLE public.presentaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empresa_all ON public.presentaciones;
CREATE POLICY empresa_all ON public.presentaciones
  FOR ALL TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()))
  WITH CHECK (empresa_id = coalesce(empresa_actual(), auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.presentaciones TO authenticated;
-- Supabase concede por defecto permisos a anon en las tablas nuevas: aquí se quitan (con RLS no vería filas, pero no debe tener ni el permiso)
REVOKE ALL ON public.presentaciones FROM anon;
REVOKE ALL ON SEQUENCE public.presentaciones_web_id_seq FROM anon;

CREATE INDEX IF NOT EXISTS idx_presentaciones_empresa_fecha
  ON public.presentaciones (empresa_id, fecha)
  WHERE deleted = false;
CREATE INDEX IF NOT EXISTS idx_presentaciones_empresa_alumno
  ON public.presentaciones (empresa_id, alumno_id)
  WHERE deleted = false;

-- ids_maximos() con la tabla nueva (el escritorio pone su contador por encima)
CREATE OR REPLACE FUNCTION public.ids_maximos()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'vehiculos',      (SELECT coalesce(max(id), 0) FROM public.vehiculos      WHERE id < 1000000000),
    'profesores',     (SELECT coalesce(max(id), 0) FROM public.profesores     WHERE id < 1000000000),
    'alumnos',        (SELECT coalesce(max(id), 0) FROM public.alumnos        WHERE id < 1000000000),
    'practicas',      (SELECT coalesce(max(id), 0) FROM public.practicas      WHERE id < 1000000000),
    'tarifas',        (SELECT coalesce(max(id), 0) FROM public.tarifas        WHERE id < 1000000000),
    'pagos',          (SELECT coalesce(max(id), 0) FROM public.pagos          WHERE id < 1000000000),
    'sucursales',     (SELECT coalesce(max(id), 0) FROM public.sucursales     WHERE id < 1000000000),
    'reservas',       (SELECT coalesce(max(id), 0) FROM public.reservas       WHERE id < 1000000000),
    'cargos',         (SELECT coalesce(max(id), 0) FROM public.cargos         WHERE id < 1000000000),
    'presentaciones', (SELECT coalesce(max(id), 0) FROM public.presentaciones WHERE id < 1000000000)
  );
$$;
REVOKE ALL ON FUNCTION public.ids_maximos() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ids_maximos() TO authenticated;

COMMIT;
