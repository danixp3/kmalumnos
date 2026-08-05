-- =====================================================================
-- KMAlumnos — Migración: cargos y descuentos (tarea D2 del PLAN-MAESTRO:
-- descuentos/promociones + cargos automáticos de matrícula/tasas)
-- Fecha: 2026-08-06
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Crea la tabla `cargos`: movimientos de cargo/descuento por alumno
--   (matrícula, tasas, cargos puntuales, descuentos/promociones), con un
--   `importe` CON SIGNO — positivo aumenta la deuda del alumno, negativo la
--   reduce. Se suma al cálculo de deuda existente (getDeudas/
--   getDesglosePagosAlumno) de forma aditiva: sin cargos, el cálculo de
--   deuda es idéntico al de antes de esta tarea.
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
-- convivir con que esta tabla no exista (sync.js → _cargosDisponible():
-- mismo patrón que `_reservasDisponible`, cualquier error de la consulta
-- se trata como "tabla no aplicada todavía", nunca como un error real;
-- cargos simplemente no se sube ni se baja, y en local funciona igual
-- desde ya — solo falta que viaje a la nube).
--
-- `empresa_id` no lleva valor por defecto ni se rellena aquí: lo estampa
-- el cliente (sync.js) al subir, igual que en el resto de tablas
-- operativas — ver el comentario de la política más abajo.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Tabla `cargos`. `id` es un integer NORMAL (no identity/serial): la
--    app asigna el id en local con nextId('cargo'), igual que el resto
--    de tablas (vehiculos, alumnos, practicas, reservas...) — el id lo
--    pone siempre el cliente, nunca la base de datos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cargos (
  id            integer PRIMARY KEY,
  alumno_id     integer,
  concepto      text DEFAULT '',
  tipo          text NOT NULL
                CHECK (tipo IN ('matricula', 'tasa', 'cargo', 'descuento', 'promo')),
  importe       numeric NOT NULL DEFAULT 0,
  fecha         text,
  nota          text DEFAULT '',
  empresa_id    uuid,
  sucursal_id   bigint,
  deleted       boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cargos IS
  'Movimientos de cargo/descuento por alumno (matrícula, tasa, cargo '
  'puntual, descuento/promo — tarea D2). importe lleva signo: positivo '
  'aumenta la deuda, negativo la reduce. deleted = soft delete, igual '
  'que el resto de tablas.';

-- Sin claves foráneas a propósito, mismo criterio que alumno_id en
-- reservas/pagos: evita que un borrado en cascada se lleve por delante
-- un cargo histórico.

-- ---------------------------------------------------------------------
-- 2) RLS: misma política `empresa_all` que el resto de tablas operativas
--    desde la migración de roles (COALESCE: si el usuario no tiene fila
--    en `perfiles`, empresa_actual() da NULL y cae en auth.uid(),
--    comportamiento idéntico al de antes de la migración de roles).
--    Restringida a jefe, igual que `pagos` — los cargos son dinero, como
--    los pagos, así que un empleado sin rol de jefe no debe poder verlos
--    ni tocarlos por RLS.
-- ---------------------------------------------------------------------
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empresa_all ON public.cargos;
CREATE POLICY empresa_all ON public.cargos
  FOR ALL TO authenticated
  USING (
    empresa_id = coalesce(empresa_actual(), auth.uid())
    AND coalesce(rol_actual(), 'jefe') = 'jefe'
  )
  WITH CHECK (
    empresa_id = coalesce(empresa_actual(), auth.uid())
    AND coalesce(rol_actual(), 'jefe') = 'jefe'
  );

-- Permiso a nivel de tabla (además de RLS). Nada para `anon`.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargos TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Índice: consultas típicas son "cargos de este alumno" y "cargos de
--    esta empresa en tal fecha", y solo interesan los no borrados.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cargos_empresa_alumno
  ON public.cargos (empresa_id, alumno_id)
  WHERE deleted = false;

COMMIT;

-- Rollback (red de seguridad, por si algo sale mal): ver el archivo
-- aparte 2026-08-06_cargos_ROLLBACK.sql, mismo criterio que el resto de
-- migraciones de esta carpeta.
