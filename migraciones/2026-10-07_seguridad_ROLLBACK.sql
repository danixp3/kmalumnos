-- Deshace 2026-10-07_seguridad.sql (vuelve a los permisos anteriores).
grant execute on function public.empresa_actual() to anon;
grant execute on function public.rol_actual() to anon;
grant execute on function public.proteger_campos_criticos_propios() to anon, authenticated;
grant execute on function public.buscar_uid_por_email(text) to anon, authenticated;
grant execute on function public.alumno_email_existe(text) to anon, authenticated;
drop function if exists public.alumno_email_existe_srv(text, text);

-- Portal: vuelve a leer el email del token sin comprobar que esté confirmado
create or replace function public.portal_email_confirmado()
returns text language sql stable security definer set search_path = public
as $$ select lower(auth.jwt() ->> 'email'); $$;

create policy perfiles_insert_jefe on public.perfiles for insert to authenticated
  with check ((coalesce(rol_actual(), 'jefe'::text) = 'jefe'::text) and (empresa_id = coalesce(empresa_actual(), auth.uid())));
drop trigger if exists perfiles_usuario_inmutable on public.perfiles;
drop function if exists public.perfiles_usuario_inmutable();
