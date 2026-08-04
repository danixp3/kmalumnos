-- =====================================================================
-- KMAlumnos — Migración: módulos contratados por empresa (entitlements)
-- Fecha: 2026-08-04
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Crea la tabla `modulos_empresa`, el cimiento del pivote a SaaS
--   modular (ver ROADMAP-SAAS.md → Fase 0 · Bloque 1): una fila por cada
--   módulo que una empresa tiene contratado, con un booleano `activo`.
--   Solo lectura desde la app (SELECT); el alta/baja de módulos se hace
--   por SQL directo o con la service_role key, nunca desde el cliente —
--   así un cliente comprometido no puede autoconcederse módulos de pago.
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
-- convivir con que esta tabla no exista (sync.js → getModulosActivos():
-- cualquier error de la consulta se trata como "modo clásico", ningún
-- módulo nuevo se da por activo).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Tabla `modulos_empresa`: una fila por módulo contratado.
--    PK compuesta (empresa_id, modulo) — evita duplicados por diseño,
--    no hace falta un id propio ni un índice único aparte.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.modulos_empresa (
  empresa_id   uuid NOT NULL,
  modulo       text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  activado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, modulo)
);

COMMENT ON TABLE public.modulos_empresa IS
  'Módulos contratados por cada empresa (entitlements del SaaS). Solo se '
  'gestiona por SQL/rol de servicio: la app únicamente lee (SELECT). Ver '
  'ROADMAP-SAAS.md → Fase 0 · Bloque 1.';

-- ---------------------------------------------------------------------
-- 2) RLS: una única política de SELECT para `authenticated`, mismo
--    patrón de compatibilidad que el resto de tablas desde la migración
--    de roles (COALESCE: si el usuario no tiene fila en `perfiles`,
--    empresa_actual() da NULL y cae en auth.uid()). Sin políticas de
--    INSERT/UPDATE/DELETE a propósito: el alta/baja de módulos es una
--    operación administrativa, no de la app. Nada para `anon`.
-- ---------------------------------------------------------------------
ALTER TABLE public.modulos_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modulos_empresa_select ON public.modulos_empresa;
CREATE POLICY modulos_empresa_select ON public.modulos_empresa
  FOR SELECT TO authenticated
  USING (empresa_id = coalesce(empresa_actual(), auth.uid()));

-- Permiso a nivel de tabla (además de RLS), solo SELECT — sin INSERT/
-- UPDATE/DELETE, ni siquiera para `authenticated`.
GRANT SELECT ON public.modulos_empresa TO authenticated;

COMMIT;
