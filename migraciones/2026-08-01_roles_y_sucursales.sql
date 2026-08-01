-- =====================================================================
-- KMAlumnos — Migración: roles (jefe/empleado) y sucursales
-- Fecha: 2026-08-01
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   1. Crea la tabla `perfiles` (une usuarios de Supabase Auth con una
--      empresa y un rol: jefe o empleado). Rompe la equivalencia actual
--      "empresa = usuario": varios usuarios podrán compartir empresa_id.
--   2. Crea la tabla `sucursales`.
--   3. Añade la columna `sucursal_id` a las tablas operativas (NULL =
--      sede principal / sin asignar, así los datos actuales no cambian).
--   4. Crea dos funciones auxiliares SECURITY DEFINER para leer el
--      perfil del usuario actual sin caer en recursión de RLS.
--   5. Sustituye la política `empresa_all` de las tablas operativas por
--      una versión compatible con el modelo anterior (usa COALESCE, así
--      que un usuario sin fila en `perfiles` sigue viendo exactamente lo
--      mismo que hoy).
--   6. Restringe la tabla `pagos` (dato financiero) a usuarios con rol
--      `jefe`, con la misma compatibilidad hacia atrás.
--   7. Activa RLS en `perfiles` y `sucursales` con políticas propias.
--   8. Da de alta un perfil `jefe` para cada usuario que ya existe hoy
--      (backfill), para que nada cambie de comportamiento al aplicar
--      esta migración.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md.
--
-- Tabla NO tocada deliberadamente: `meta` (sigue siendo solo SELECT para
-- `authenticated`, no tiene empresa_id ni sentido de "dato por empresa").
-- `logs` SÍ se actualiza en el bloque 5, igual que las demás tablas de
-- datos, para que un empleado con perfil propio pueda seguir
-- escribiendo/leyendo su registro de operaciones.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Tabla `perfiles`: usuario -> empresa + rol (+ sucursal opcional)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.perfiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id   uuid NOT NULL,
  rol          text NOT NULL DEFAULT 'empleado' CHECK (rol IN ('jefe', 'empleado')),
  sucursal_id  bigint,
  nombre       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.perfiles IS
  'Une cada usuario de Supabase Auth con su empresa y su rol (jefe/empleado). '
  'Permite que varios usuarios compartan empresa_id, cosa que antes de esta '
  'migración no existía (empresa_id era siempre = auth.uid()).';

-- ---------------------------------------------------------------------
-- 2) Tabla `sucursales`
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sucursales (
  id          bigserial PRIMARY KEY,
  empresa_id  uuid NOT NULL,
  nombre      text NOT NULL,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3) Columna sucursal_id en las tablas operativas (NULL = sede
--    principal / sin asignar; los datos existentes quedan intactos).
-- ---------------------------------------------------------------------
ALTER TABLE public.vehiculos  ADD COLUMN IF NOT EXISTS sucursal_id bigint;
ALTER TABLE public.alumnos    ADD COLUMN IF NOT EXISTS sucursal_id bigint;
ALTER TABLE public.practicas  ADD COLUMN IF NOT EXISTS sucursal_id bigint;
ALTER TABLE public.profesores ADD COLUMN IF NOT EXISTS sucursal_id bigint;
ALTER TABLE public.tarifas    ADD COLUMN IF NOT EXISTS sucursal_id bigint;
ALTER TABLE public.pagos      ADD COLUMN IF NOT EXISTS sucursal_id bigint;

-- ---------------------------------------------------------------------
-- 4) Funciones auxiliares SECURITY DEFINER.
--    Se ejecutan con los privilegios de quien las crea (el propietario
--    de las tablas), así que su SELECT interno sobre `perfiles` NO pasa
--    por las políticas RLS de `perfiles` — evita la recursión infinita
--    que se produciría si una política de `perfiles` llamase a una
--    función que a su vez consulta `perfiles` con RLS activo.
--    `set search_path = public` evita que alguien cuele un `perfiles`
--    falso en otro esquema del search_path (mismo aviso que ya emite el
--    linter de Supabase sobre `reparar_secuencias`).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.empresa_actual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.perfiles WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.empresa_actual() IS
  'Devuelve el empresa_id del perfil del usuario autenticado, o NULL si '
  'no tiene fila en perfiles (usuarios previos a esta migración).';

CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.perfiles WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.rol_actual() IS
  'Devuelve el rol (jefe/empleado) del perfil del usuario autenticado, o '
  'NULL si no tiene fila en perfiles.';

-- Solo el rol `authenticated` necesita poder ejecutar estas funciones
-- (las políticas RLS las invocan en nombre del usuario que hace la
-- consulta). Igual que reparar_secuencias(), son SECURITY DEFINER
-- ejecutables por cualquier usuario autenticado; es aceptable porque
-- solo devuelven datos del propio usuario que llama (auth.uid()), nunca
-- reciben parámetros ni exponen datos ajenos. Detalle en el README.
REVOKE ALL ON FUNCTION public.empresa_actual() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rol_actual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.empresa_actual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rol_actual() TO authenticated;

-- ---------------------------------------------------------------------
-- 4b) buscar_uid_por_email(): traduce el email de un empleado a su
--     user_id. Hace falta para dar de alta empleados desde la app: la
--     tabla auth.users no es consultable con la anon key, así que la
--     única vía es una función SECURITY DEFINER.
--
--     RIESGO QUE MITIGA LA COMPROBACIÓN DE ROL INTERNA: sin ella, esta
--     función convertiría a cualquier usuario autenticado en un oráculo
--     para averiguar qué emails están registrados en el sistema
--     (enumeración de cuentas). Por eso, antes de mirar auth.users,
--     exige que quien llama sea jefe; si no lo es, ni siquiera consulta.
--     El coalesce a 'jefe' mantiene la compatibilidad con usuarios que
--     todavía no tengan fila en `perfiles`, igual que en el resto de la
--     migración.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buscar_uid_por_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF coalesce(public.rol_actual(), 'jefe') <> 'jefe' THEN
    RAISE EXCEPTION 'Solo un jefe puede buscar usuarios por email';
  END IF;

  -- Los emails se guardan tal cual los escribió el usuario al
  -- registrarse, así que se normalizan los dos lados de la comparación.
  SELECT id INTO v_uid
  FROM auth.users
  WHERE lower(btrim(email)) = lower(btrim(p_email))
  LIMIT 1;

  RETURN v_uid;
END;
$$;

COMMENT ON FUNCTION public.buscar_uid_por_email(text) IS
  'Devuelve el user_id del usuario con ese email, o NULL si no existe. '
  'Solo ejecutable por un jefe: sin esa comprobación permitiría enumerar '
  'las cuentas registradas en el sistema.';

REVOKE ALL ON FUNCTION public.buscar_uid_por_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_uid_por_email(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Políticas de las tablas operativas: compatibilidad hacia atrás.
--    USING/WITH CHECK con COALESCE: si el usuario NO tiene fila en
--    `perfiles`, empresa_actual() devuelve NULL y el COALESCE cae en
--    auth.uid() — exactamente el comportamiento de hoy. Solo cuando el
--    usuario tiene un perfil de verdad se usa el empresa_id compartido.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS empresa_all ON public.vehiculos;
CREATE POLICY empresa_all ON public.vehiculos
  FOR ALL TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()))
  WITH CHECK (empresa_id = coalesce(empresa_actual(), auth.uid()));

DROP POLICY IF EXISTS empresa_all ON public.alumnos;
CREATE POLICY empresa_all ON public.alumnos
  FOR ALL TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()))
  WITH CHECK (empresa_id = coalesce(empresa_actual(), auth.uid()));

DROP POLICY IF EXISTS empresa_all ON public.practicas;
CREATE POLICY empresa_all ON public.practicas
  FOR ALL TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()))
  WITH CHECK (empresa_id = coalesce(empresa_actual(), auth.uid()));

DROP POLICY IF EXISTS empresa_all ON public.profesores;
CREATE POLICY empresa_all ON public.profesores
  FOR ALL TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()))
  WITH CHECK (empresa_id = coalesce(empresa_actual(), auth.uid()));

DROP POLICY IF EXISTS empresa_all ON public.tarifas;
CREATE POLICY empresa_all ON public.tarifas
  FOR ALL TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()))
  WITH CHECK (empresa_id = coalesce(empresa_actual(), auth.uid()));

-- `logs` tiene hoy la misma política `empresa_all` que el resto de
-- tablas de datos (verificado por SELECT de solo lectura sobre
-- pg_policies antes de escribir esta migración), así que recibe el
-- mismo tratamiento compatible con roles.
DROP POLICY IF EXISTS empresa_all ON public.logs;
CREATE POLICY empresa_all ON public.logs
  FOR ALL TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()))
  WITH CHECK (empresa_id = coalesce(empresa_actual(), auth.uid()));

-- ---------------------------------------------------------------------
-- 6) `pagos`: además de la empresa, exige rol jefe. coalesce(rol_actual(),
--    'jefe') mantiene el acceso total a quien no tenga perfil todavía
--    (situación de hoy) y solo restringe cuando existe un perfil de
--    empleado de verdad.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS empresa_all ON public.pagos;
CREATE POLICY empresa_all ON public.pagos
  FOR ALL TO authenticated
  USING (
    empresa_id = coalesce(empresa_actual(), auth.uid())
    AND coalesce(rol_actual(), 'jefe') = 'jefe'
  )
  WITH CHECK (
    empresa_id = coalesce(empresa_actual(), auth.uid())
    AND coalesce(rol_actual(), 'jefe') = 'jefe'
  );

-- ---------------------------------------------------------------------
-- 7a) RLS de `perfiles`.
--     - Cada usuario puede ver su propia fila.
--     - Un jefe puede ver/crear/editar/borrar las filas de su empresa.
--     - Nadie (ni siquiera un jefe) puede cambiar su propio rol,
--       empresa_id ni sucursal_id: lo impone un trigger (ver más abajo),
--       no la política, porque RLS no puede comparar el valor viejo y
--       el nuevo de una columna en la misma expresión USING/WITH CHECK
--       de forma fiable para UPDATE.
--     - anon: sin políticas → acceso denegado por defecto.
-- ---------------------------------------------------------------------
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfiles_select_propio ON public.perfiles;
CREATE POLICY perfiles_select_propio ON public.perfiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS perfiles_select_jefe ON public.perfiles;
CREATE POLICY perfiles_select_jefe ON public.perfiles
  FOR SELECT TO authenticated
  USING (coalesce(rol_actual(), 'jefe') = 'jefe' AND empresa_id = coalesce(empresa_actual(), auth.uid()));

DROP POLICY IF EXISTS perfiles_insert_jefe ON public.perfiles;
CREATE POLICY perfiles_insert_jefe ON public.perfiles
  FOR INSERT TO authenticated
  WITH CHECK (coalesce(rol_actual(), 'jefe') = 'jefe' AND empresa_id = coalesce(empresa_actual(), auth.uid()));

DROP POLICY IF EXISTS perfiles_update_propio ON public.perfiles;
CREATE POLICY perfiles_update_propio ON public.perfiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS perfiles_update_jefe ON public.perfiles;
CREATE POLICY perfiles_update_jefe ON public.perfiles
  FOR UPDATE TO authenticated
  USING (coalesce(rol_actual(), 'jefe') = 'jefe' AND empresa_id = coalesce(empresa_actual(), auth.uid()))
  WITH CHECK (coalesce(rol_actual(), 'jefe') = 'jefe' AND empresa_id = coalesce(empresa_actual(), auth.uid()));

DROP POLICY IF EXISTS perfiles_delete_jefe ON public.perfiles;
CREATE POLICY perfiles_delete_jefe ON public.perfiles
  FOR DELETE TO authenticated
  USING (coalesce(rol_actual(), 'jefe') = 'jefe' AND empresa_id = coalesce(empresa_actual(), auth.uid()));

-- Trigger: nadie puede tocar los campos críticos de su PROPIA fila
-- (`rol`, `empresa_id`, `sucursal_id`), ni siquiera un jefe. Cubre dos
-- ataques distintos:
--   - Autoascenso: cambiar el propio `rol` de 'empleado' a 'jefe'.
--   - Escalada por empresa: cambiar el propio `empresa_id` al de OTRA
--     empresa. La política perfiles_update_propio solo exige
--     `user_id = auth.uid()`, así que sin este trigger un empleado
--     podría actualizar su propia fila con el empresa_id de una empresa
--     ajena (conocido, filtrado en un log, etc.) y, a partir de ahí,
--     empresa_actual() devolvería ese id ajeno: todas las políticas
--     operativas (`empresa_id = coalesce(empresa_actual(), auth.uid())`)
--     se lo concederían sin más. `sucursal_id` se protege igual, por
--     coherencia (evita que se autoasigne a otra sucursal saltándose al
--     jefe).
-- Un jefe SÍ puede cambiar estos campos en la fila de OTRO usuario (esa
-- operación entra por perfiles_update_jefe y no está sujeta a esta
-- restricción porque OLD.user_id <> auth.uid() en ese caso).
CREATE OR REPLACE FUNCTION public.proteger_campos_criticos_propios()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.user_id = auth.uid() AND (
    NEW.rol IS DISTINCT FROM OLD.rol
    OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
    OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
  ) THEN
    RAISE EXCEPTION 'No puedes cambiar tu propio rol, empresa_id ni sucursal_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perfiles_proteger_rol_propio ON public.perfiles;
DROP TRIGGER IF EXISTS perfiles_proteger_campos_criticos_propios ON public.perfiles;
CREATE TRIGGER perfiles_proteger_campos_criticos_propios
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_campos_criticos_propios();

-- Nombre antiguo de la función, de una versión anterior de esta misma
-- migración (solo protegía `rol`); se elimina para no dejar código
-- muerto si este script se reaplica sobre una base donde ya existiera.
DROP FUNCTION IF EXISTS public.proteger_rol_propio();

-- ---------------------------------------------------------------------
-- 7b) RLS de `sucursales`.
--     - Lectura: cualquier miembro autenticado de la empresa.
--     - Escritura (insert/update/delete): solo jefe.
--     - anon: sin políticas → acceso denegado por defecto.
-- ---------------------------------------------------------------------
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sucursales_select ON public.sucursales;
CREATE POLICY sucursales_select ON public.sucursales
  FOR SELECT TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()));

DROP POLICY IF EXISTS sucursales_insert_jefe ON public.sucursales;
CREATE POLICY sucursales_insert_jefe ON public.sucursales
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = coalesce(empresa_actual(), auth.uid())
    AND coalesce(rol_actual(), 'jefe') = 'jefe'
  );

DROP POLICY IF EXISTS sucursales_update_jefe ON public.sucursales;
CREATE POLICY sucursales_update_jefe ON public.sucursales
  FOR UPDATE TO authenticated
  USING (
    empresa_id = coalesce(empresa_actual(), auth.uid())
    AND coalesce(rol_actual(), 'jefe') = 'jefe'
  )
  WITH CHECK (
    empresa_id = coalesce(empresa_actual(), auth.uid())
    AND coalesce(rol_actual(), 'jefe') = 'jefe'
  );

DROP POLICY IF EXISTS sucursales_delete_jefe ON public.sucursales;
CREATE POLICY sucursales_delete_jefe ON public.sucursales
  FOR DELETE TO authenticated
  USING (
    empresa_id = coalesce(empresa_actual(), auth.uid())
    AND coalesce(rol_actual(), 'jefe') = 'jefe'
  );

-- Permisos a nivel de tabla (además de RLS). Sin esto ni siquiera se
-- evalúan las políticas: PostgreSQL exige el GRANT y, encima, la
-- política correspondiente. No se concede nada a `anon`.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfiles   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sucursales TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.sucursales_id_seq  TO authenticated;

-- ---------------------------------------------------------------------
-- 8) Backfill: cada usuario que ya existe hoy pasa a ser "jefe" de su
--    propia empresa (empresa_id = su propio id, igual que el modelo
--    actual). Así el dueño actual no nota ningún cambio.
-- ---------------------------------------------------------------------
INSERT INTO public.perfiles (user_id, empresa_id, rol)
SELECT id, id, 'jefe'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
