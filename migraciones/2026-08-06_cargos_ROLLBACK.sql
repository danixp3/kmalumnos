-- =====================================================================
-- KMAlumnos — ROLLBACK de 2026-08-06_cargos.sql
--
-- Borra por completo la tabla `cargos` (DROP TABLE ... CASCADE, se lleva
-- por delante la política empresa_all y el índice). Si para cuando se
-- ejecuta este rollback ya hay cargos reales dados de alta, esos datos
-- se pierden para siempre. Antes de ejecutar esto, haz una copia de
-- seguridad (SELECT * FROM cargos guardado a un archivo).
--
-- No toca `2026-08-01_roles_y_sucursales.sql` ni sus funciones
-- (`empresa_actual()`/`rol_actual()`): esta migración solo las USA,
-- nunca las modifica.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS public.cargos CASCADE;

COMMIT;
