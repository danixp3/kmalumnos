-- =====================================================================
-- KMAlumnos — ROLLBACK de 2026-08-01_roles_y_sucursales.sql
--
-- ADVERTENCIA: este script BORRA las tablas `perfiles` y `sucursales`
-- por completo (DROP TABLE ... CASCADE). Si para cuando se ejecuta este
-- rollback ya se han creado sucursales reales o perfiles de empleado
-- reales, esos datos se pierden para siempre. Antes de ejecutar esto,
-- haz una copia de seguridad (ver migraciones/README.md).
--
-- Este script deja el esquema EXACTAMENTE como estaba antes de aplicar
-- la migración: las políticas `empresa_all` vuelven a comparar
-- únicamente contra auth.uid(), sin roles ni sucursales.
--
-- Las columnas `sucursal_id` añadidas a vehiculos/alumnos/practicas/
-- profesores/tarifas/pagos NO se eliminan por defecto: son nullable,
-- sin default y el código de la app anterior a esta migración no las
-- toca, así que dejarlas no rompe nada y evita un ALTER TABLE
-- adicional sobre tablas con datos reales. Si se quiere un rollback
-- "a cero" total, hay una sección opcional al final, comentada, para
-- borrarlas también.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Restaurar las políticas originales `empresa_all` (solo auth.uid())
--    en las tablas operativas que la migración modificó.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS empresa_all ON public.vehiculos;
CREATE POLICY empresa_all ON public.vehiculos
  FOR ALL TO authenticated
  USING (empresa_id = auth.uid())
  WITH CHECK (empresa_id = auth.uid());

DROP POLICY IF EXISTS empresa_all ON public.alumnos;
CREATE POLICY empresa_all ON public.alumnos
  FOR ALL TO authenticated
  USING (empresa_id = auth.uid())
  WITH CHECK (empresa_id = auth.uid());

DROP POLICY IF EXISTS empresa_all ON public.practicas;
CREATE POLICY empresa_all ON public.practicas
  FOR ALL TO authenticated
  USING (empresa_id = auth.uid())
  WITH CHECK (empresa_id = auth.uid());

DROP POLICY IF EXISTS empresa_all ON public.profesores;
CREATE POLICY empresa_all ON public.profesores
  FOR ALL TO authenticated
  USING (empresa_id = auth.uid())
  WITH CHECK (empresa_id = auth.uid());

DROP POLICY IF EXISTS empresa_all ON public.tarifas;
CREATE POLICY empresa_all ON public.tarifas
  FOR ALL TO authenticated
  USING (empresa_id = auth.uid())
  WITH CHECK (empresa_id = auth.uid());

DROP POLICY IF EXISTS empresa_all ON public.pagos;
CREATE POLICY empresa_all ON public.pagos
  FOR ALL TO authenticated
  USING (empresa_id = auth.uid())
  WITH CHECK (empresa_id = auth.uid());

DROP POLICY IF EXISTS empresa_all ON public.logs;
CREATE POLICY empresa_all ON public.logs
  FOR ALL TO authenticated
  USING (empresa_id = auth.uid())
  WITH CHECK (empresa_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2) Borrar las tablas nuevas y todo lo que dependa de ellas
--    (políticas propias, trigger, secuencia de sucursales, etc. caen
--    solos con CASCADE).
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.sucursales CASCADE;
DROP TABLE IF EXISTS public.perfiles CASCADE;

-- ---------------------------------------------------------------------
-- 3) Borrar las funciones auxiliares SECURITY DEFINER. El trigger
--    (perfiles_proteger_rol_propio / perfiles_proteger_campos_criticos_
--    propios) NO se dropea aquí a propósito: vivía sobre `public.perfiles`,
--    que el DROP TABLE ... CASCADE del paso 2 ya se llevó por delante
--    junto con el trigger. Un DROP TRIGGER ... ON public.perfiles
--    después de borrar la tabla fallaría (la tabla ya no existe;
--    IF EXISTS solo protege contra que falte el trigger, no la tabla).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.proteger_rol_propio();
DROP FUNCTION IF EXISTS public.proteger_campos_criticos_propios();
DROP FUNCTION IF EXISTS public.buscar_uid_por_email(text);
DROP FUNCTION IF EXISTS public.empresa_actual();
DROP FUNCTION IF EXISTS public.rol_actual();

COMMIT;

-- =====================================================================
-- OPCIONAL — solo si además quieres quitar las columnas sucursal_id
-- de las tablas operativas (rollback "a cero" total). Comentado a
-- propósito: bórralas manualmente descomentando este bloque solo si
-- estás seguro de que ninguna fila las usa todavía.
-- =====================================================================
-- BEGIN;
-- ALTER TABLE public.vehiculos  DROP COLUMN IF EXISTS sucursal_id;
-- ALTER TABLE public.alumnos    DROP COLUMN IF EXISTS sucursal_id;
-- ALTER TABLE public.practicas  DROP COLUMN IF EXISTS sucursal_id;
-- ALTER TABLE public.profesores DROP COLUMN IF EXISTS sucursal_id;
-- ALTER TABLE public.tarifas    DROP COLUMN IF EXISTS sucursal_id;
-- ALTER TABLE public.pagos      DROP COLUMN IF EXISTS sucursal_id;
-- COMMIT;
