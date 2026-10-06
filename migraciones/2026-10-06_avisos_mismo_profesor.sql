-- =====================================================================
-- AulaMovil — Migración: avisos del móvil solo del profesor del teléfono (2026-10-06)
-- =====================================================================
-- Cada teléfono tiene puesto un perfil de profesor (push_suscripciones.profesor_id,
-- lo actualiza la web al entrar y al cambiar de perfil). Desde ahora un aviso
-- («quedan 5 min», «hora de terminar», «sigue abierta») solo se entrega si la
-- clase es de ese mismo profesor (o la clase no tiene profesor). Así, si un
-- teléfono cambia de perfil con una clase abierta de otro profesor (o la
-- siguió desde «Sin profesor»), no le llegan los avisos de esa clase aunque se
-- hubieran programado antes. Los que no se entregan se dan por enviados (no se
-- reintentan).
--
-- Solo cambia la función tomar_avisos_vencidos (mismas columnas y permisos).
-- =====================================================================

create or replace function public.tomar_avisos_vencidos(p_secreto text)
returns table (id bigint, endpoint text, p256dh text, auth text, titulo text, cuerpo text, etiqueta text, practica_id bigint, tipo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secreto text;
begin
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'avisos_secreto' limit 1;
  if v_secreto is null or p_secreto is null or p_secreto <> v_secreto then
    raise exception 'no autorizado' using errcode = '42501';
  end if;
  return query
  with vencidos as (
    select a.id from public.avisos_push a
    where a.enviado_en is null and a.enviar_en <= now() + interval '15 seconds'
    order by a.enviar_en
    limit 200
    for update skip locked
  ), marcados as (
    update public.avisos_push a set enviado_en = now()
    from vencidos v where a.id = v.id
    returning a.id, a.empresa_id, a.endpoint, a.titulo, a.cuerpo, a.etiqueta, a.practica_id, a.tipo
  )
  select m.id, m.endpoint, s.p256dh, s.auth, m.titulo, m.cuerpo, m.etiqueta, m.practica_id, m.tipo
  from marcados m
  join public.push_suscripciones s on s.endpoint = m.endpoint and s.empresa_id = m.empresa_id
  left join public.practicas p on p.id = m.practica_id and p.empresa_id = m.empresa_id
  -- Solo las clases del profesor que tiene puesto ese teléfono (o sin profesor)
  where p.id is null or p.profesor_id is null or p.profesor_id = s.profesor_id;
end;
$$;

revoke all on function public.tomar_avisos_vencidos(text) from public;
grant execute on function public.tomar_avisos_vencidos(text) to anon, authenticated;
