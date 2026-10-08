-- Deshace 2026-10-08_procedencia.sql (se pierde solo la etiqueta «traído de…»
-- en la nube; los datos se quedan. El escritorio y la web detectan que falta
-- la columna y siguen funcionando sin ella; cada PC conserva la suya en local).
alter table public.alumnos    drop column if exists procedencia;
alter table public.practicas  drop column if exists procedencia;
alter table public.profesores drop column if exists procedencia;
alter table public.vehiculos  drop column if exists procedencia;
alter table public.pagos      drop column if exists procedencia;
alter table public.cargos     drop column if exists procedencia;
