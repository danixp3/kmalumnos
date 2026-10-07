-- ─────────────────────────────────────────────────────────────────────────────
-- Seguridad (auditoría del 2026-10-07). Aditiva: no borra ni cambia datos.
--
-- 1. Nadie sin sesión (rol anon) puede llamar a las funciones internas
--    (empresa_actual, rol_actual, buscar_uid_por_email, ids_maximos…).
-- 2. «¿Es alumno este correo?» solo lo puede preguntar el servidor de la web
--    (con su secreto, el mismo de los avisos): antes cualquiera con la clave
--    pública podía averiguar si un email era de un alumno.
-- 3. El portal del alumno exige que el correo de la sesión esté confirmado.
-- 4. Un jefe ya no puede meter en su empresa la cuenta de otra persona sin su
--    consentimiento (se quita la inserción directa en perfiles y la búsqueda
--    de usuarios por email) ni cambiar a quién pertenece un perfil.
-- Deshacer: 2026-10-07_seguridad_ROLLBACK.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Funciones internas: solo con sesión
revoke execute on function public.empresa_actual() from public, anon;
grant execute on function public.empresa_actual() to authenticated, service_role;
revoke execute on function public.rol_actual() from public, anon;
grant execute on function public.rol_actual() to authenticated, service_role;
revoke execute on function public.ids_maximos() from public, anon;
grant execute on function public.ids_maximos() to authenticated, service_role;
revoke execute on function public.reparar_secuencias() from public, anon;
grant execute on function public.reparar_secuencias() to authenticated, service_role;
revoke execute on function public.portal_mis_datos() from public, anon;
grant execute on function public.portal_mis_datos() to authenticated, service_role;
revoke execute on function public.portal_solicitar_reserva(text, text, integer, text) from public, anon;
grant execute on function public.portal_solicitar_reserva(text, text, integer, text) to authenticated, service_role;
-- Función de trigger: no se llama nunca por API (el trigger sigue funcionando)
revoke execute on function public.proteger_campos_criticos_propios() from public, anon, authenticated;
-- Búsqueda de usuarios por email: ya no la usa nadie (ver punto 4)
revoke execute on function public.buscar_uid_por_email(text) from public, anon, authenticated;
grant execute on function public.buscar_uid_por_email(text) to service_role;

-- 2. ¿Es alumno este correo? Solo el servidor, con su secreto
create or replace function public.alumno_email_existe_srv(p_secreto text, p_email text)
returns boolean
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
  return public.alumno_email_existe(p_email);
end;
$$;
revoke all on function public.alumno_email_existe_srv(text, text) from public;
grant execute on function public.alumno_email_existe_srv(text, text) to anon, authenticated, service_role;
revoke execute on function public.alumno_email_existe(text) from public, anon, authenticated;
grant execute on function public.alumno_email_existe(text) to service_role;

-- 3. Portal del alumno: solo con el correo confirmado
create or replace function public.portal_email_confirmado()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(u.email) from auth.users u
   where u.id = auth.uid() and u.email_confirmed_at is not null
     and lower(u.email) = lower(auth.jwt() ->> 'email');
$$;
revoke all on function public.portal_email_confirmado() from public, anon;
grant execute on function public.portal_email_confirmado() to authenticated, service_role;

create or replace function public.portal_mis_datos()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text;
  v_alumno    record;
  v_total     int;
  v_practicas json;
  v_reservas  json;
begin
  v_email := public.portal_email_confirmado();
  if v_email is null or trim(v_email) = '' then return null; end if;

  select id, nombre, permiso, empresa_id
    into v_alumno
    from public.alumnos
   where lower(email) = lower(v_email)
     and deleted = false
   order by id desc
   limit 1;
  if not found then return null; end if;

  if not public.empresa_tiene_portal(v_alumno.empresa_id) then return null; end if;

  select count(*) into v_total
    from public.practicas
   where alumno_id = v_alumno.id and deleted = false;

  select json_agg(fila) into v_practicas
    from (
      select pr.fecha, pr.tipo, pr.km_inicial, pr.km_final, pr.nota,
             pf.nombre as profesor_nombre
      from public.practicas pr
      left join public.profesores pf on pf.id = pr.profesor_id and pf.deleted = false
      where pr.alumno_id = v_alumno.id and pr.deleted = false
      order by pr.fecha desc
      limit 50
    ) fila;

  select json_agg(fila2) into v_reservas
    from (
      select rs.fecha, rs.hora_inicio, rs.estado, rs.n_practicas,
             pf.nombre as profesor_nombre
      from public.reservas rs
      left join public.profesores pf on pf.id = rs.profesor_id and pf.deleted = false
      where rs.alumno_id = v_alumno.id
        and rs.deleted = false
        and rs.estado in ('solicitada', 'confirmada')
        and rs.fecha >= to_char(current_date, 'YYYY-MM-DD')
      order by rs.fecha asc, rs.hora_inicio asc nulls last
      limit 50
    ) fila2;

  return json_build_object(
    'alumno', json_build_object('id', v_alumno.id, 'nombre', v_alumno.nombre, 'permiso', v_alumno.permiso),
    'total', v_total,
    'practicas', coalesce(v_practicas, '[]'::json),
    'reservas', coalesce(v_reservas, '[]'::json)
  );
end;
$$;

create or replace function public.portal_solicitar_reserva(p_fecha text, p_hora text, p_n_practicas integer, p_nota text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text;
  v_alumno record;
  v_id     int;
  v_n      int;
begin
  v_email := public.portal_email_confirmado();
  if v_email is null or trim(v_email) = '' then return null; end if;

  select id, empresa_id, sucursal_id
    into v_alumno
    from public.alumnos
   where lower(email) = lower(v_email)
     and deleted = false
   order by id desc
   limit 1;
  if not found then return null; end if;

  if not public.empresa_tiene_portal(v_alumno.empresa_id) then return null; end if;

  if p_fecha is null or p_fecha !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'fecha no válida';
  end if;
  v_n  := greatest(1, least(coalesce(p_n_practicas, 1), 10));
  v_id := nextval('public.reservas_portal_id_seq');

  insert into public.reservas
    (id, alumno_id, empresa_id, sucursal_id, fecha, hora_inicio,
     duracion_min, estado, origen, n_practicas, nota, deleted, updated_at)
  values
    (v_id, v_alumno.id, v_alumno.empresa_id, v_alumno.sucursal_id, p_fecha,
     nullif(btrim(coalesce(p_hora, '')), ''), v_n * 45, 'solicitada', 'portal',
     v_n, left(coalesce(p_nota, ''), 500), false, now());

  return json_build_object(
    'ok', true, 'id', v_id, 'fecha', p_fecha, 'estado', 'solicitada', 'n_practicas', v_n
  );
end;
$$;
revoke execute on function public.portal_mis_datos() from public, anon;
grant execute on function public.portal_mis_datos() to authenticated, service_role;
revoke execute on function public.portal_solicitar_reserva(text, text, integer, text) from public, anon;
grant execute on function public.portal_solicitar_reserva(text, text, integer, text) to authenticated, service_role;

-- 4. Perfiles: sin altas sin consentimiento y sin cambiar el dueño de un perfil
drop policy if exists perfiles_insert_jefe on public.perfiles;

create or replace function public.perfiles_usuario_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el usuario de un perfil' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.perfiles_usuario_inmutable() from public, anon, authenticated;
drop trigger if exists perfiles_usuario_inmutable on public.perfiles;
create trigger perfiles_usuario_inmutable before update on public.perfiles
  for each row execute function public.perfiles_usuario_inmutable();
