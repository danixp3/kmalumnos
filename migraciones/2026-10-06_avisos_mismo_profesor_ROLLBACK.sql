-- Vuelta atrás de 2026-10-06_avisos_mismo_profesor.sql: los avisos vuelven a
-- entregarse a cualquier teléfono que los programó, sea cual sea su perfil.
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
  join public.push_suscripciones s on s.endpoint = m.endpoint and s.empresa_id = m.empresa_id;
end;
$$;
revoke all on function public.tomar_avisos_vencidos(text) from public;
grant execute on function public.tomar_avisos_vencidos(text) to anon, authenticated;
