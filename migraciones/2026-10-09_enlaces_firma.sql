-- =====================================================================
-- AulaMovil — Migración: enlace para que el alumno firme sus clases
-- Fecha: 2026-10-09
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- POR QUÉ: a veces el profesor se olvida de pasarle el móvil al alumno al
-- terminar la clase y la clase se queda «Sin firmar». Ahora la oficina (o el
-- profesor desde el móvil) genera un enlace, se lo manda al alumno por
-- WhatsApp y el alumno, desde su propio teléfono y sin cuenta, ve los datos de
-- esas clases y las firma. La firma se guarda en `practicas.firma` como la del
-- móvil del profesor, así que llega al escritorio por el sync normal.
--
-- QUÉ HACE (aditivo, no toca datos existentes):
--   1) Tabla `enlaces_firma`: un enlace = un alumno + las clases que se le
--      piden firmar. Del enlace solo se guarda la huella (sha256) del código
--      secreto, nunca el código: quien lea la tabla no puede usar los enlaces.
--      Caduca (1-30 días), se puede anular y apunta qué se firmó y cuándo, qué
--      clases no reconoció el alumno y su comentario.
--   2) crear_enlace_firma(...): con la sesión de la autoescuela (RLS). Solo
--      admite clases de ese alumno, sin borrar, sin firma y cerradas (con km
--      final, o de pista sin km). Sin lista de clases = las del móvil de los
--      últimos 60 días que falten por firmar (lo que usa el móvil).
--   3) firma_enlace_ver(secreto, huella) y firma_enlace_firmar(...): las
--      llama SOLO el servidor de la web (/api/firma-alumno) con el secreto de
--      los avisos (Vault 'avisos_secreto'); el alumno no tiene sesión. Ver
--      solo enseña las clases del enlace; firmar solo pone la firma en clases
--      del enlace que sigan sin firmar (nunca sustituye una firma) y sube su
--      updated_at para que el escritorio la baje.
--
-- Compatibilidad: las versiones anteriores del escritorio y de la web no usan
-- nada de esto; el escritorio nuevo y la web nueva detectan si falta y lo
-- dicen («hace falta actualizar la base de datos») en vez de fallar.
-- RLS: por empresa, como el resto de tablas; anon sin acceso a la tabla.
-- =====================================================================

create table if not exists public.enlaces_firma (
  id             bigserial primary key,
  empresa_id     uuid not null default coalesce(public.empresa_actual(), auth.uid()),
  token_hash     text not null unique,
  alumno_id      bigint not null,
  practica_ids   bigint[] not null,
  creado_por     text,
  profesor_id    bigint,
  creado         timestamptz not null default now(),
  caduca         timestamptz not null,
  anulado        timestamptz,
  abierto        timestamptz,
  veces          integer not null default 0,
  firmado        timestamptz,
  firmadas       bigint[] not null default '{}',
  no_confirmadas bigint[] not null default '{}',
  comentario     text,
  agente         text
);
create index if not exists enlaces_firma_alumno on public.enlaces_firma (empresa_id, alumno_id, creado desc);

alter table public.enlaces_firma enable row level security;
drop policy if exists empresa_all on public.enlaces_firma;
create policy empresa_all on public.enlaces_firma for all to authenticated
  using (empresa_id = coalesce(public.empresa_actual(), auth.uid()))
  with check (empresa_id = coalesce(public.empresa_actual(), auth.uid()));
revoke all on public.enlaces_firma from anon;

comment on table public.enlaces_firma is 'Enlaces para que el alumno firme desde su móvil las clases que se quedaron sin firmar. token_hash = sha256 (hex) del código del enlace; el código no se guarda.';

-- ─── Crear un enlace (con la sesión de la autoescuela) ───────────────────────
create or replace function public.crear_enlace_firma(
  p_token_hash text, p_alumno_id bigint, p_practica_ids bigint[], p_dias integer,
  p_creado_por text, p_profesor_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa uuid := coalesce(public.empresa_actual(), auth.uid());
  v_ids bigint[];
  v_faltan bigint[] := '{}';
  v_id bigint;
  v_caduca timestamptz;
begin
  if v_empresa is null then
    raise exception 'no autorizado' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'codigo', 'token_no_valido');
  end if;
  if p_practica_ids is not null and cardinality(p_practica_ids) > 100 then
    return jsonb_build_object('ok', false, 'codigo', 'demasiadas');
  end if;
  if not exists (select 1 from public.alumnos a where a.id = p_alumno_id and a.empresa_id = v_empresa and not a.deleted) then
    return jsonb_build_object('ok', false, 'codigo', 'alumno_no_existe');
  end if;

  select coalesce(array_agg(p.id order by p.fecha, coalesce(p.hora_inicio, ''), p.id), '{}') into v_ids
  from public.practicas p
  where p.empresa_id = v_empresa and p.alumno_id = p_alumno_id and not p.deleted
    and p.firma is null
    and (p.km_final > 0 or (coalesce(p.tipo, '') = 'pista' and coalesce(p.km_inicial, 0) = 0))
    and (
      (p_practica_ids is not null and p.id = any(p_practica_ids))
      or (p_practica_ids is null and p.source = 'web-remote'
          and p.fecha >= to_char((now() at time zone 'Europe/Madrid') - interval '60 days', 'YYYY-MM-DD'))
    );

  if p_practica_ids is not null then
    select coalesce(array_agg(x), '{}') into v_faltan
    from unnest(p_practica_ids) x where not (x = any(v_ids));
  end if;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', false, 'codigo', 'nada_que_firmar', 'faltan', to_jsonb(v_faltan));
  end if;

  v_caduca := now() + make_interval(days => least(30, greatest(1, coalesce(p_dias, 7))));
  insert into public.enlaces_firma (empresa_id, token_hash, alumno_id, practica_ids, creado_por, profesor_id, caduca)
  values (v_empresa, p_token_hash, p_alumno_id, v_ids, left(nullif(trim(coalesce(p_creado_por, '')), ''), 80), p_profesor_id, v_caduca)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'practica_ids', to_jsonb(v_ids), 'n', cardinality(v_ids),
    'caduca', v_caduca, 'faltan', to_jsonb(v_faltan));
end;
$$;
revoke all on function public.crear_enlace_firma(text, bigint, bigint[], integer, text, bigint) from public, anon;
grant execute on function public.crear_enlace_firma(text, bigint, bigint[], integer, text, bigint) to authenticated, service_role;

-- ─── Ver las clases de un enlace (solo el servidor, con su secreto) ──────────
create or replace function public.firma_enlace_ver(p_secreto text, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secreto text;
  e public.enlaces_firma%rowtype;
  v_al record;
  v_centro jsonb;
  v_practicas jsonb;
begin
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'avisos_secreto' limit 1;
  if v_secreto is null or p_secreto is null or p_secreto <> v_secreto then
    raise exception 'no autorizado' using errcode = '42501';
  end if;

  select * into e from public.enlaces_firma where token_hash = p_token_hash;
  if not found then return jsonb_build_object('estado', 'no_existe'); end if;
  if e.anulado is not null then return jsonb_build_object('estado', 'anulado'); end if;
  if e.caduca < now() then return jsonb_build_object('estado', 'caducado'); end if;

  select a.nombre, a.primer_apellido, a.segundo_apellido, a.profesor_id, coalesce(a.clases_previas, 0) as previas
    into v_al
  from public.alumnos a where a.id = e.alumno_id and a.empresa_id = e.empresa_id and not a.deleted;
  if not found then return jsonb_build_object('estado', 'no_existe'); end if;

  update public.enlaces_firma set abierto = coalesce(abierto, now()), veces = veces + 1 where id = e.id;

  select valor into v_centro from public.ajustes_empresa where empresa_id = e.empresa_id and clave = 'centro';

  -- Nº de clase como en el escritorio y el móvil: las «clases antes de la app» + lo que vale cada una (¼ ½ ¾)
  with todas as (
    select p.*, sum(case when p.fraccion > 0 and p.fraccion < 1 then p.fraccion else 1 end)
      over (order by p.fecha, coalesce(p.hora_inicio, ''), p.id rows unbounded preceding) as acum
    from public.practicas p
    where p.alumno_id = e.alumno_id and p.empresa_id = e.empresa_id and not p.deleted
  )
  select jsonb_agg(jsonb_build_object(
      'id', t.id, 'fecha', t.fecha, 'hora_inicio', t.hora_inicio, 'hora_fin', t.hora_fin,
      'km_inicial', t.km_inicial, 'km_final', t.km_final, 'fraccion', t.fraccion,
      'tipo', coalesce(t.tipo, 'circulacion'), 'km_auto', coalesce(t.tipo_detalle, '') = 'km_auto',
      'zonas', t.zonas, 'trabajado', t.trabajado,
      'vehiculo_id', t.vehiculo_id, 'vehiculo', v.nombre, 'matricula', v.matricula,
      'profesor', coalesce(pr.nombre, pa.nombre),
      'clase_n', ceil(t.acum + v_al.previas - 0.000001),
      'firmada', t.firma is not null,
      'firmable', t.firma is null and (t.km_final > 0 or (coalesce(t.tipo, '') = 'pista' and coalesce(t.km_inicial, 0) = 0))
    ) order by t.fecha, coalesce(t.hora_inicio, ''), t.id)
    into v_practicas
  from todas t
  left join public.vehiculos v on v.id = t.vehiculo_id and v.empresa_id = e.empresa_id
  left join public.profesores pr on pr.id = t.profesor_id and pr.empresa_id = e.empresa_id
  left join public.profesores pa on pa.id = v_al.profesor_id and pa.empresa_id = e.empresa_id
  where t.id = any(e.practica_ids);

  return jsonb_build_object(
    'estado', 'ok',
    'alumno', jsonb_build_object('nombre', v_al.nombre, 'primer_apellido', v_al.primer_apellido, 'segundo_apellido', v_al.segundo_apellido),
    'centro', case when v_centro is null then null else jsonb_build_object(
      'nombre', coalesce(nullif(trim(v_centro->>'razon_social'), ''), nullif(trim(v_centro->>'denominacion'), '')),
      'comercial', nullif(trim(v_centro->>'denominacion'), ''),
      'telefono', nullif(trim(v_centro->>'telefono'), ''),
      'email', nullif(trim(v_centro->>'email'), '')) end,
    'creado_por', e.creado_por, 'creado', e.creado, 'caduca', e.caduca, 'firmado', e.firmado,
    'practicas', coalesce(v_practicas, '[]'::jsonb));
end;
$$;

-- ─── Firmar (solo el servidor, con su secreto) ───────────────────────────────
-- p_ids vacío + p_comentario = el alumno no confirma ninguna y solo avisa.
create or replace function public.firma_enlace_firmar(
  p_secreto text, p_token_hash text, p_ids bigint[], p_firma text,
  p_no_confirmadas bigint[], p_comentario text, p_agente text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secreto text;
  e public.enlaces_firma%rowtype;
  v_firmadas bigint[] := '{}';
  v_ya bigint[] := '{}';
  v_no bigint[] := '{}';
  v_com text := nullif(left(trim(coalesce(p_comentario, '')), 500), '');
begin
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'avisos_secreto' limit 1;
  if v_secreto is null or p_secreto is null or p_secreto <> v_secreto then
    raise exception 'no autorizado' using errcode = '42501';
  end if;

  select * into e from public.enlaces_firma where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'no_existe'); end if;
  if e.anulado is not null then return jsonb_build_object('ok', false, 'codigo', 'anulado'); end if;
  if e.caduca < now() then return jsonb_build_object('ok', false, 'codigo', 'caducado'); end if;

  if coalesce(cardinality(p_ids), 0) > 0 then
    if p_firma is null or length(p_firma) > 200000 or p_firma !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
      return jsonb_build_object('ok', false, 'codigo', 'firma_no_valida');
    end if;
    with upd as (
      update public.practicas p set firma = p_firma, updated_at = now()
      where p.id = any(p_ids) and p.id = any(e.practica_ids)
        and p.empresa_id = e.empresa_id and p.alumno_id = e.alumno_id and not p.deleted
        and p.firma is null
        and (p.km_final > 0 or (coalesce(p.tipo, '') = 'pista' and coalesce(p.km_inicial, 0) = 0))
      returning p.id
    )
    select coalesce(array_agg(id), '{}') into v_firmadas from upd;

    -- Las que ya estaban firmadas (un reenvío, o se firmaron en el móvil mientras tanto): no es un error
    select coalesce(array_agg(p.id), '{}') into v_ya
    from public.practicas p
    where p.id = any(p_ids) and p.id = any(e.practica_ids) and not (p.id = any(v_firmadas))
      and p.empresa_id = e.empresa_id and not p.deleted and p.firma is not null;
  elsif v_com is null then
    return jsonb_build_object('ok', false, 'codigo', 'nada');
  end if;

  if p_no_confirmadas is not null then
    select coalesce(array_agg(x), '{}') into v_no from unnest(p_no_confirmadas) x where x = any(e.practica_ids);
  end if;

  update public.enlaces_firma set
    firmadas = (select coalesce(array_agg(distinct x), '{}') from unnest(firmadas || v_firmadas) x),
    firmado = case when cardinality(v_firmadas) > 0 then now() else firmado end,
    no_confirmadas = case when p_no_confirmadas is null then no_confirmadas else v_no end,
    comentario = coalesce(v_com, comentario),
    agente = coalesce(left(nullif(trim(coalesce(p_agente, '')), ''), 300), agente)
  where id = e.id;

  return jsonb_build_object('ok', true, 'firmadas', to_jsonb(v_firmadas), 'ya_firmadas', to_jsonb(v_ya), 'no_confirmadas', to_jsonb(v_no));
end;
$$;

-- Las llama /api/firma-alumno sin sesión de usuario (clave anon): las protege el secreto
revoke all on function public.firma_enlace_ver(text, text) from public, authenticated;
revoke all on function public.firma_enlace_firmar(text, text, bigint[], text, bigint[], text, text) from public, authenticated;
grant execute on function public.firma_enlace_ver(text, text) to anon, service_role;
grant execute on function public.firma_enlace_firmar(text, text, bigint[], text, bigint[], text, text) to anon, service_role;
