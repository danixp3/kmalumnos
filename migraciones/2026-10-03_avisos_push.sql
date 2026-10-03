-- =====================================================================
-- AulaMovil — Migración: avisos de la práctica en el móvil (Web Push)
-- Fecha: 2026-10-03
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- POR QUÉ: el profesor quiere un aviso cuando la práctica va a acabar, al
-- acabar y si se queda abierta. Con la pantalla del móvil apagada una web no
-- puede contar el tiempo: el aviso lo manda el servidor a su hora (Web Push).
--
-- QUÉ HACE (todo aditivo, no toca datos existentes):
--   1) push_suscripciones: teléfonos que reciben avisos (endpoint + claves del
--      servicio de push del navegador). Una fila por empresa y teléfono.
--   2) avisos_push: avisos programados (práctica, hora de envío, texto).
--      Los programa la web; se borran al cerrar/cancelar la práctica.
--   3) tomar_avisos_vencidos(secreto) / quitar_suscripcion(secreto, endpoint):
--      SECURITY DEFINER, solo con el secreto compartido con Vercel (Vault
--      'avisos_secreto'). Marcan los avisos como enviados (sin dobles envíos).
--   4) pg_cron + pg_net: cada 30 s, SOLO si hay algún aviso vencido, llama a
--      https://aulamovil.vercel.app/api/avisos-enviar con el secreto; limpia
--      los avisos de hace más de 3 días.
--
-- El secreto se crea aparte (sin escribirlo en ningún archivo):
--   select vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'avisos_secreto', 'Avisos del móvil: secreto compartido con Vercel');
-- y el mismo valor va a la variable AVISOS_SECRETO del proyecto de Vercel.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.push_suscripciones (
  id          bigserial primary key,
  empresa_id  uuid not null default coalesce(public.empresa_actual(), auth.uid()),
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  profesor_id bigint,
  user_agent  text,
  creada      timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  unique (empresa_id, endpoint)
);

create table if not exists public.avisos_push (
  id          bigserial primary key,
  empresa_id  uuid not null default coalesce(public.empresa_actual(), auth.uid()),
  endpoint    text not null,
  practica_id bigint,
  tipo        text not null,
  enviar_en   timestamptz not null,
  titulo      text not null,
  cuerpo      text not null default '',
  etiqueta    text,
  enviado_en  timestamptz,
  creado      timestamptz not null default now()
);
create index if not exists avisos_push_pendientes on public.avisos_push (enviar_en) where enviado_en is null;
create index if not exists avisos_push_practica on public.avisos_push (practica_id);

alter table public.push_suscripciones enable row level security;
alter table public.avisos_push enable row level security;

drop policy if exists empresa_all on public.push_suscripciones;
create policy empresa_all on public.push_suscripciones for all to authenticated
  using (empresa_id = coalesce(public.empresa_actual(), auth.uid()))
  with check (empresa_id = coalesce(public.empresa_actual(), auth.uid()));

drop policy if exists empresa_all on public.avisos_push;
create policy empresa_all on public.avisos_push for all to authenticated
  using (empresa_id = coalesce(public.empresa_actual(), auth.uid()))
  with check (empresa_id = coalesce(public.empresa_actual(), auth.uid()));

revoke all on public.push_suscripciones from anon;
revoke all on public.avisos_push from anon;

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

create or replace function public.quitar_suscripcion(p_secreto text, p_endpoint text)
returns void
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
  delete from public.avisos_push where endpoint = p_endpoint and enviado_en is null;
  delete from public.push_suscripciones where endpoint = p_endpoint;
end;
$$;

-- Las llama /api/avisos-enviar sin sesión de usuario (clave anon): las protege el secreto
revoke all on function public.tomar_avisos_vencidos(text) from public;
revoke all on function public.quitar_suscripcion(text, text) from public;
grant execute on function public.tomar_avisos_vencidos(text) to anon, authenticated;
grant execute on function public.quitar_suscripcion(text, text) to anon, authenticated;

-- Tarea cada 30 s: solo llama a la web si hay algo que enviar
select cron.unschedule('avisos-push') where exists (select 1 from cron.job where jobname = 'avisos-push');
select cron.schedule('avisos-push', '30 seconds', $cron$
  select net.http_post(
    url := 'https://aulamovil.vercel.app/api/avisos-enviar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-avisos-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_secreto' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000)
  where exists (select 1 from public.avisos_push where enviado_en is null and enviar_en <= now() + interval '15 seconds');
  delete from public.avisos_push where creado < now() - interval '3 days';
$cron$);
