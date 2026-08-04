-- =====================================================================
-- KMAlumnos — ROLLBACK de 2026-08-04_modulos_empresa.sql
--
-- Borra por completo la tabla `modulos_empresa` (DROP TABLE ... CASCADE,
-- se lleva por delante la política de SELECT). Si para cuando se ejecuta
-- este rollback ya hay módulos contratados dados de alta de verdad, esos
-- datos se pierden para siempre. Antes de ejecutar esto, haz una copia
-- de seguridad (SELECT * FROM modulos_empresa guardado a un archivo).
--
-- No toca `2026-08-01_roles_y_sucursales.sql` ni sus funciones
-- (`empresa_actual()`/`rol_actual()`): esta migración solo las USA,
-- nunca las modifica.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS public.modulos_empresa CASCADE;

COMMIT;
