-- =====================================================================
-- KMAlumnos — Migración: reservas (solicitudes de práctica, ROADMAP-SAAS.md
-- → Fase 0 · Bloque 2, agenda/reservas)
-- Fecha: 2026-08-05
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Crea la tabla `reservas`: modelo v1 de agenda decidido — una reserva
--   es una "solicitud de práctica" (alumno, profesor, vehículo, fecha,
--   hora) con un estado que la autoescuela confirma o cancela. Todavía
--   no hay ninguna interfaz de usuario que la use: esta migración y el
--   código de sync/db/main/preload que la acompaña son solo la capa de
--   datos, a la espera de la UI (encargo posterior).
--
-- REQUIERE (orden de aplicación obligatorio):
--   Esta migración usa la función `empresa_actual()`, definida en
--   `2026-08-01_roles_y_sucursales.sql`. Esa migración TIENE que estar
--   aplicada antes que esta, o el CREATE POLICY de más abajo falla
--   (función inexistente). Si `2026-08-01_roles_y_sucursales.sql` todavía
--   no se ha aplicado, no apliques esta tampoco.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. La app ya sabe
-- convivir con que esta tabla no exista (sync.js → _reservasDisponible():
-- mismo patrón que `_sucursalesDisponible`, cualquier error de la
-- consulta se trata como "tabla no aplicada todavía", nunca como un
-- error real; reservas simplemente no se sube ni se baja).
--
-- `empresa_id` no lleva valor por defecto ni se rellena aquí: lo estampa
-- el cliente (sync.js) al subir, igual que en el resto de tablas
-- operativas — ver el comentario de la política más abajo.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Tabla `reservas`. `id` es un integer NORMAL (no identity/serial):
--    la app asigna el id en local con nextId('r'), igual que el resto
--    de tablas (vehiculos, alumnos, practicas...) — el id lo pone
--    siempre el cliente, nunca la base de datos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservas (
  id            integer PRIMARY KEY,
  alumno_id     integer,
  profesor_id   integer,
  vehiculo_id   integer,
  fecha         text,
  hora_inicio   text,
  duracion_min  integer NOT NULL DEFAULT 45,
  estado        text NOT NULL DEFAULT 'solicitada'
                CHECK (estado IN ('solicitada', 'confirmada', 'cancelada', 'realizada')),
  origen        text DEFAULT 'desktop',
  nota          text DEFAULT '',
  empresa_id    uuid,
  sucursal_id   bigint,
  deleted       boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reservas IS
  'Solicitudes de práctica (agenda, modelo v1 del Bloque 2 SaaS): una '
  'cita alumno/profesor/vehículo/fecha/hora con un estado que la '
  'autoescuela confirma. origen distingue quién la creó (''desktop''|'
  '''portal''). deleted = soft delete, igual que el resto de tablas.';

-- Sin claves foráneas a propósito, mismo criterio que profesor_id en
-- practicas/alumnos: no hay FK entre sucursal_id y sucursales.id ni
-- entre alumno_id/profesor_id/vehiculo_id y sus tablas — evita que un
-- borrado en cascada se lleve por delante una reserva histórica.

-- ---------------------------------------------------------------------
-- 2) RLS: misma política `empresa_all` que el resto de tablas
--    operativas desde la migración de roles (COALESCE: si el usuario
--    no tiene fila en `perfiles`, empresa_actual() da NULL y cae en
--    auth.uid(), comportamiento idéntico al de antes de la migración
--    de roles). Sin restricción de rol adicional (a diferencia de
--    `pagos`): un empleado puede ver y gestionar la agenda igual que
--    vehículos/alumnos/prácticas.
-- ---------------------------------------------------------------------
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empresa_all ON public.reservas;
CREATE POLICY empresa_all ON public.reservas
  FOR ALL TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()))
  WITH CHECK (empresa_id = coalesce(empresa_actual(), auth.uid()));

-- Permiso a nivel de tabla (además de RLS). Nada para `anon`.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservas TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Índice: consultas típicas de agenda son "reservas de esta empresa
--    en tal fecha", y solo interesan las no borradas.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reservas_empresa_fecha
  ON public.reservas (empresa_id, fecha)
  WHERE deleted = false;

COMMIT;

-- Rollback (red de seguridad, por si algo sale mal): ver el archivo
-- aparte 2026-08-05_reservas_ROLLBACK.sql, mismo criterio que el resto
-- de migraciones de esta carpeta.
