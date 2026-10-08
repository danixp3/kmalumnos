-- =====================================================================
-- AulaMovil — Migración: procedencia de los datos (traídos de otro programa)
-- Fecha: 2026-10-08
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- POR QUÉ: para pasar los datos del programa anterior de forma segura, todo
-- lo que entra desde «Traer de otro programa» (Excel/CSV) o desde la base de
-- Ariauto queda marcado con el nombre de ese programa. Así siempre se ve qué
-- es de antes y qué de después: etiqueta junto al nombre, filtro
-- «Procedencia» y grupos plegables en Alumnos y Prácticas (escritorio), y la
-- etiqueta en la lista de alumnos del móvil.
--
-- QUÉ HACE (aditivo, no toca datos): columna `procedencia` (texto, vacía) en
-- alumnos, practicas, profesores, vehiculos, pagos y cargos. Vacía = creado
-- en AulaMovil; con texto = nombre del programa («Ariauto», «Gesauto»…).
-- La lista de programas y la fecha en que se trajeron viajan en
-- ajustes_empresa (clave «procedencias»), que ya existe: sin cambios ahí.
--
-- Compatibilidad: las versiones anteriores del escritorio no mandan la
-- columna (su upsert no la toca) y la web vieja no la pide; el escritorio y
-- la web nuevos la detectan en tiempo de ejecución y sin ella siguen
-- funcionando como antes. RLS: la de cada tabla (por empresa), sin cambios.
-- =====================================================================

alter table public.alumnos    add column if not exists procedencia text;
alter table public.practicas  add column if not exists procedencia text;
alter table public.profesores add column if not exists procedencia text;
alter table public.vehiculos  add column if not exists procedencia text;
alter table public.pagos      add column if not exists procedencia text;
alter table public.cargos     add column if not exists procedencia text;

comment on column public.alumnos.procedencia    is 'Programa del que se trajo (p. ej. Ariauto). Vacío = creado en AulaMovil.';
comment on column public.practicas.procedencia  is 'Programa del que se trajo la clase. Vacío = dada/registrada con AulaMovil.';
comment on column public.profesores.procedencia is 'Programa del que se trajo. Vacío = creado en AulaMovil.';
comment on column public.vehiculos.procedencia  is 'Programa del que se trajo. Vacío = creado en AulaMovil.';
comment on column public.pagos.procedencia      is 'Programa del que se trajo el pago. Vacío = anotado en AulaMovil.';
comment on column public.cargos.procedencia     is 'Programa del que se trajo el cargo. Vacío = anotado en AulaMovil.';
