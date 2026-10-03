-- =====================================================================
-- AulaMovil — Migración: coche habitual de cada profesor
-- Fecha: 2026-10-03
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- POR QUÉ: cada profesor suele dar sus clases siempre en el mismo coche
-- (aunque a veces use otro). La web del móvil propone ese coche al iniciar o
-- anotar una clase, y se elige en el escritorio (Profesores, Puesta en
-- marcha) o en el móvil (Perfil → Coche de cada profesor).
--
-- QUÉ HACE (aditivo, no toca datos): columna profesores.vehiculo_id (entero,
-- vacía). Sin clave foránea a propósito: el escritorio sube profesores y
-- coches por separado y una FK haría fallar la subida de un profesor cuyo
-- coche aún no ha llegado a la nube.
--
-- Compatibilidad: las versiones anteriores del escritorio no mandan la
-- columna (su upsert no la toca); la web y el escritorio nuevos la detectan
-- en tiempo de ejecución y sin ella siguen funcionando como antes.
-- =====================================================================

alter table public.profesores
  add column if not exists vehiculo_id integer;

comment on column public.profesores.vehiculo_id is
  'Coche habitual del profesor (id de vehiculos). La web lo propone al iniciar o anotar sus clases.';
