-- =====================================================================
-- AulaMovil — Migración: columnas del flujo móvil de prácticas
-- Fecha: 2026-09-29
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE:
--   Añade 4 columnas NULLABLE a `practicas`, todas opcionales, para el
--   nuevo flujo del móvil (iniciar práctica → km final → firma del alumno):
--     · firma        text   imagen de la firma del alumno (data URL PNG pequeña)
--     · trabajado    jsonb  lista de lo practicado, p. ej. ["Glorietas","Cambios de carril"]
--     · tipo_detalle text   tipo elegido en el móvil (Circulación urbana, Maniobras...)
--     · hora_fin     text   hora en que se cerró la clase, "HH:MM"
--   No cambia ningún comportamiento existente ni toca datos.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Mientras no
-- se aplique, TODO sigue funcionando:
--   · la app de escritorio detecta en runtime que las columnas no existen
--     (sync.js `_practicasMovilDisponible`) y nunca las incluye al subir;
--   · la web del móvil detecta el mismo caso (api/_utils.js
--     `escribirConFallback`) y guarda km, hora y observación sin esas
--     columnas; la firma se puede dibujar pero avisa de que no se ha
--     podido guardar en la nube.
-- Aplicar solo con la confirmación del propietario (ver
-- migraciones/README.md): node .claude/scripts/sql.js < este archivo.
-- =====================================================================

BEGIN;

ALTER TABLE public.practicas ADD COLUMN IF NOT EXISTS firma text;
ALTER TABLE public.practicas ADD COLUMN IF NOT EXISTS trabajado jsonb;
ALTER TABLE public.practicas ADD COLUMN IF NOT EXISTS tipo_detalle text;
ALTER TABLE public.practicas ADD COLUMN IF NOT EXISTS hora_fin text;

COMMENT ON COLUMN public.practicas.firma IS 'Firma del alumno al terminar la clase (data URL de una imagen PNG pequeña). NULL = sin firmar.';
COMMENT ON COLUMN public.practicas.trabajado IS 'Lo practicado en la clase (array JSON de textos). NULL = sin registrar.';
COMMENT ON COLUMN public.practicas.tipo_detalle IS 'Tipo de práctica elegido en el móvil (texto libre acotado). NULL = sin registrar.';
COMMENT ON COLUMN public.practicas.hora_fin IS 'Hora en que se cerró la clase, formato HH:MM. NULL = sin registrar.';

COMMIT;

-- ROLLBACK: ejecutar 2026-09-29_practica_movil_ROLLBACK.sql
