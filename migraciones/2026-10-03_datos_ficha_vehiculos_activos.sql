-- =====================================================================
-- AulaMovil — Migración: datos completos de alumnos, profesores y coches
-- (los mismos que guarda Ariauto) y coches en uso / retirados
-- Fecha: 2026-10-03
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- POR QUÉ: al traer los datos de Ariauto, lo que la app no tenía como campo
-- (nº de registro, sexo, nacionalidad, tutor...) acababa en las observaciones
-- del alumno. Con estas columnas cada dato tiene su sitio, se puede editar en
-- la ficha y viaja entre los PCs. Además, cada coche puede marcarse como
-- retirado (activo = false): sigue en el historial pero deja de salir para
-- dar clase (móvil, registro rápido, estadísticas).
--
-- QUÉ HACE (aditivo, no toca ningún dato existente):
--  - alumnos: n_registro, sexo, nacionalidad, lugar_nacimiento, provincia,
--    municipio, telefono2, dni_caducidad, tutor_nombre, tutor_dni,
--    fecha_teorico, centro_medico, restricciones, n_solicitud, convocatoria,
--    factura_nombre, factura_nif, factura_direccion.
--  - profesores: telefono, email, direccion, codigo_postal, poblacion,
--    fecha_nacimiento, fecha_alta, fecha_baja, n_certificado, fecha_certificado.
--  - vehiculos: activo (por defecto true: todos siguen en uso), marca, modelo,
--    fecha_alta, fecha_baja, aseguradora, poliza, itv_ultima, cambio,
--    observaciones.
-- Las políticas RLS existentes (empresa_all) cubren las columnas nuevas.
--
-- Compatibilidad: las versiones anteriores del escritorio y de la web no
-- piden ni mandan estas columnas; siguen funcionando igual.
-- =====================================================================

alter table public.alumnos
  add column if not exists n_registro text,
  add column if not exists sexo text,
  add column if not exists nacionalidad text,
  add column if not exists lugar_nacimiento text,
  add column if not exists provincia text,
  add column if not exists municipio text,
  add column if not exists telefono2 text,
  add column if not exists dni_caducidad date,
  add column if not exists tutor_nombre text,
  add column if not exists tutor_dni text,
  add column if not exists fecha_teorico date,
  add column if not exists centro_medico text,
  add column if not exists restricciones text,
  add column if not exists n_solicitud integer,
  add column if not exists convocatoria integer,
  add column if not exists factura_nombre text,
  add column if not exists factura_nif text,
  add column if not exists factura_direccion text;

alter table public.profesores
  add column if not exists telefono text,
  add column if not exists email text,
  add column if not exists direccion text,
  add column if not exists codigo_postal text,
  add column if not exists poblacion text,
  add column if not exists fecha_nacimiento date,
  add column if not exists fecha_alta date,
  add column if not exists fecha_baja date,
  add column if not exists n_certificado text,
  add column if not exists fecha_certificado date;

alter table public.vehiculos
  add column if not exists activo boolean not null default true,
  add column if not exists marca text,
  add column if not exists modelo text,
  add column if not exists fecha_alta date,
  add column if not exists fecha_baja date,
  add column if not exists aseguradora text,
  add column if not exists poliza text,
  add column if not exists itv_ultima date,
  add column if not exists cambio text,
  add column if not exists observaciones text;

-- Búsqueda por nº de registro (lo que más se teclea en la lista de alumnos)
create index if not exists alumnos_n_registro_idx on public.alumnos (empresa_id, n_registro);
