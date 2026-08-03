-- =====================================================================
-- KMAlumnos — ROLLBACK de 2026-08-04_unique_matricula_vehiculos.sql
--
-- Quita el índice único parcial de matrícula. No borra ni modifica
-- ninguna fila de `vehiculos`: el índice es una restricción, no
-- almacena datos por sí mismo, así que revertirlo es seguro y no hay
-- pérdida de información posible.
-- =====================================================================

DROP INDEX IF EXISTS public.vehiculos_empresa_matricula_activa_uidx;
