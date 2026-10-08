-- =====================================================================
-- AulaMovil — Migración: permisos con los que se da clase con cada vehículo
-- Fecha: 2026-10-09
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- POR QUÉ: un profesor tiene un coche «habitual» que la app (escritorio y
-- móvil) propone al empezar una clase, y que se enseñaba también en la ficha
-- de un alumno de moto. Con los permisos marcados en cada vehículo («B» para
-- el coche; «A2,A,A1,AM» para una moto) a un alumno de moto no se le propone
-- ni se le enseña el coche de B, y el registro rápido de una moto lista a los
-- alumnos de ese permiso aunque no la tengan asignada.
--
-- QUÉ HACE (aditivo, no toca datos): columna `permisos` (texto, vacía) en
-- vehiculos. Lista separada por comas, en mayúsculas y sin espacios
-- («A2,A,AM»). Vacía = sin decir: el coche vale para todos, como hasta ahora.
--
-- Compatibilidad: las versiones anteriores del escritorio no mandan la
-- columna (su upsert no la toca) y la web vieja no la pide; el escritorio y
-- la web nuevos la detectan en tiempo de ejecución y sin ella siguen
-- funcionando como antes (el resto de datos del coche sincroniza igual).
-- RLS: la de la tabla vehiculos (por empresa), sin cambios.
-- =====================================================================

alter table public.vehiculos add column if not exists permisos text;

comment on column public.vehiculos.permisos is 'Permisos con los que se da clase con este vehículo, separados por comas (p. ej. «B» o «A2,A,AM»). Vacío = sin decir (vale para todos).';
