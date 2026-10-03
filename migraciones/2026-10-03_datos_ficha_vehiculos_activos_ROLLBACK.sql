-- ROLLBACK de 2026-10-03_datos_ficha_vehiculos_activos.sql
-- OJO: borra los datos guardados en estas columnas (nº de registro, sexo,
-- nacionalidad... y qué coches están retirados). Solo si hay que volver atrás.

drop index if exists public.alumnos_n_registro_idx;

alter table public.alumnos
  drop column if exists n_registro,
  drop column if exists sexo,
  drop column if exists nacionalidad,
  drop column if exists lugar_nacimiento,
  drop column if exists provincia,
  drop column if exists municipio,
  drop column if exists telefono2,
  drop column if exists dni_caducidad,
  drop column if exists tutor_nombre,
  drop column if exists tutor_dni,
  drop column if exists fecha_teorico,
  drop column if exists centro_medico,
  drop column if exists restricciones,
  drop column if exists n_solicitud,
  drop column if exists convocatoria,
  drop column if exists factura_nombre,
  drop column if exists factura_nif,
  drop column if exists factura_direccion;

alter table public.profesores
  drop column if exists telefono,
  drop column if exists email,
  drop column if exists direccion,
  drop column if exists codigo_postal,
  drop column if exists poblacion,
  drop column if exists fecha_nacimiento,
  drop column if exists fecha_alta,
  drop column if exists fecha_baja,
  drop column if exists n_certificado,
  drop column if exists fecha_certificado;

alter table public.vehiculos
  drop column if exists activo,
  drop column if exists marca,
  drop column if exists modelo,
  drop column if exists fecha_alta,
  drop column if exists fecha_baja,
  drop column if exists aseguradora,
  drop column if exists poliza,
  drop column if exists itv_ultima,
  drop column if exists cambio,
  drop column if exists observaciones;
