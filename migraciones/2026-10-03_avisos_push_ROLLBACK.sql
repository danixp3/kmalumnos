-- Deshace 2026-10-03_avisos_push.sql. Solo hay avisos programados y teléfonos
-- suscritos (nada de alumnos ni prácticas): se pueden borrar sin perder datos.
select cron.unschedule('avisos-push') where exists (select 1 from cron.job where jobname = 'avisos-push');
drop function if exists public.tomar_avisos_vencidos(text);
drop function if exists public.quitar_suscripcion(text, text);
drop table if exists public.avisos_push;
drop table if exists public.push_suscripciones;
delete from vault.secrets where name = 'avisos_secreto';
-- pg_cron y pg_net se dejan instaladas (no molestan; las puede usar otra cosa).
