-- Deshace 2026-10-03_profesor_vehiculo.sql (se pierde solo el coche habitual
-- elegido para cada profesor; el escritorio y la web detectan que falta la
-- columna y siguen funcionando sin ella).
alter table public.profesores drop column if exists vehiculo_id;
