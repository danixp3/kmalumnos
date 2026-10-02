-- =====================================================================
-- AulaMovil — Migración: mayor id de cada tabla (todas las empresas)
-- Fecha: 2026-10-03
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- POR QUÉ: la clave primaria de cada tabla es GLOBAL (id, sin empresa_id),
-- pero cada PC numera sus registros nuevos por su cuenta y, por RLS, solo
-- ve los ids de su empresa. Dos autoescuelas —o la cuenta de prueba y la de
-- la autoescuela en el mismo PC— acababan eligiendo el mismo id y la segunda
-- no podía subirlo (la fila es de otra empresa): se quedaba en la cola para
-- siempre. Caso real: la cuenta de prueba de este PC iba a usar los ids
-- 88 (alumnos), 1403 (prácticas), 12 (vehículos) y 18 (profesores), que ya
-- son de la autoescuela.
--
-- QUÉ HACE (aditivo, no toca datos): función ids_maximos() que devuelve solo
-- el mayor id de cada tabla (sin ninguna fila ni dato de otras empresas). El
-- escritorio (sync.js, _avanzarSeqGlobal) la consulta en cada sincronización
-- y pone su contador por encima. Los ids >= 1e9 son de la web/portal
-- (secuencias propias, nunca chocan) y no cuentan.
--
-- Compatibilidad: las versiones anteriores del escritorio no la llaman; sin
-- la función, la nueva sigue funcionando igual (sin este ajuste).
-- =====================================================================

create or replace function public.ids_maximos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'vehiculos',  (select coalesce(max(id), 0) from public.vehiculos  where id < 1000000000),
    'profesores', (select coalesce(max(id), 0) from public.profesores where id < 1000000000),
    'alumnos',    (select coalesce(max(id), 0) from public.alumnos    where id < 1000000000),
    'practicas',  (select coalesce(max(id), 0) from public.practicas  where id < 1000000000),
    'tarifas',    (select coalesce(max(id), 0) from public.tarifas    where id < 1000000000),
    'pagos',      (select coalesce(max(id), 0) from public.pagos      where id < 1000000000),
    'sucursales', (select coalesce(max(id), 0) from public.sucursales where id < 1000000000),
    'reservas',   (select coalesce(max(id), 0) from public.reservas   where id < 1000000000),
    'cargos',     (select coalesce(max(id), 0) from public.cargos     where id < 1000000000)
  );
$$;

-- Solo usuarios con sesión (Supabase concede EXECUTE a PUBLIC por defecto)
revoke all on function public.ids_maximos() from public, anon;
grant execute on function public.ids_maximos() to authenticated;
