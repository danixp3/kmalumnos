-- Deshace 2026-10-09_vehiculo_permisos.sql
-- (los permisos marcados en los coches se pierden; el resto de datos no se toca)
alter table public.vehiculos drop column if exists permisos;
