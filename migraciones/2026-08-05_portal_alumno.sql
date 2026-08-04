-- =====================================================================
-- KMAlumnos — Migración: portal del alumno (solo lectura)
-- Fecha: 2026-08-05
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Primer entregable de ROADMAP-SAAS.md → Fase 0 · Bloque 2 (portal del
--   alumno). Añade una columna `portal_token` a `alumnos` (un token de
--   capacidad, secreto y aleatorio, que da acceso de solo lectura a las
--   prácticas de ESE alumno concreto) y una función `portal_alumno_datos`
--   que, dado un id de alumno y su token, devuelve sus datos y sus
--   últimas prácticas — sin necesidad de que el alumno tenga cuenta de
--   empresa ni JWT de Supabase Auth.
--
-- POR QUÉ SECURITY DEFINER ES SEGURO AQUÍ:
--   Un alumno no es una cuenta de empresa: con la anon key, sin JWT de
--   empresa, RLS le bloquea todo. El acceso se resuelve con el patrón
--   "enlace inadivinable" (unguessable link): el alumno recibe una URL
--   con su `alumno_id` y un `portal_token` largo y aleatorio que solo
--   conoce quien tenga el enlace. La función es SECURITY DEFINER (corre
--   con permisos del dueño, no del llamante) precisamente para poder
--   saltarse RLS y comprobar el token ella misma — pero es una función
--   de superficie mínima y acotada: NO acepta más parámetros que
--   (id, token), NO permite listar ni buscar alumnos, y solo devuelve
--   datos si el token coincide exactamente con el guardado en esa fila.
--   Si el token es NULL, vacío o no coincide, devuelve NULL sin dar
--   ninguna pista de si el alumno existe o no (mismo comportamiento en
--   ambos casos, para no permitir enumeración de ids). El token es
--   rotable: basta con generar uno nuevo (UPDATE alumnos SET
--   portal_token = ...) para invalidar enlaces filtrados o compartidos
--   de más. Esta función NO escribe nada (solo SELECT) y NO debilita
--   ninguna política RLS existente: las tablas siguen protegidas para
--   cualquier acceso que no pase por esta función.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, el endpoint `web-remote/api/alumno-portal.js` degrada
-- limpiamente (503 "Portal no disponible") porque la función RPC no
-- existe todavía.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Columna `portal_token`: nullable, sin valor por defecto. Un alumno
--    sin token (el caso de hoy, para todos) no tiene portal activo.
--    Índice parcial: solo indexa filas con token asignado, evitando
--    indexar millones de NULL a medida que crece la tabla.
-- ---------------------------------------------------------------------
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS portal_token text;

COMMENT ON COLUMN public.alumnos.portal_token IS
  'Token de capacidad (secreto, largo, aleatorio) para el portal del '
  'alumno en solo lectura. NULL = portal no activado para este alumno. '
  'Rotable: generar uno nuevo invalida cualquier enlace anterior.';

CREATE INDEX IF NOT EXISTS idx_alumnos_portal_token
  ON public.alumnos (portal_token)
  WHERE portal_token IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) Función `portal_alumno_datos(p_alumno_id, p_token)`: única puerta
--    de entrada del portal. Solo lectura. Ver arriba por qué
--    SECURITY DEFINER es seguro en este caso concreto.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_alumno_datos(p_alumno_id int, p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno record;
  v_total int;
  v_practicas json;
  v_resultado json;
BEGIN
  -- Sin token no hay acceso, ni se toca la tabla.
  IF p_token IS NULL OR p_token = '' THEN
    RETURN NULL;
  END IF;

  -- Búsqueda por id + token a la vez: si cualquiera de los dos no
  -- coincide, v_alumno queda sin fila y se responde NULL igual que si
  -- el alumno no existiera (no se revela cuál de los dos falló).
  SELECT id, nombre, permiso
    INTO v_alumno
    FROM public.alumnos
   WHERE id = p_alumno_id
     AND deleted = false
     AND portal_token IS NOT NULL
     AND portal_token = p_token;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Total de prácticas no borradas (puede ser mayor que las 50 que se
  -- devuelven en la lista).
  SELECT count(*) INTO v_total
    FROM public.practicas
   WHERE alumno_id = v_alumno.id
     AND deleted = false;

  -- Últimas 50 prácticas, más recientes primero, con el nombre del
  -- profesor resuelto (LEFT JOIN: si no tiene profesor_id, sale NULL).
  SELECT json_agg(fila) INTO v_practicas
    FROM (
      SELECT
        pr.fecha,
        pr.tipo,
        pr.km_inicial,
        pr.km_final,
        pr.nota,
        pf.nombre AS profesor_nombre
      FROM public.practicas pr
      LEFT JOIN public.profesores pf
        ON pf.id = pr.profesor_id AND pf.deleted = false
      WHERE pr.alumno_id = v_alumno.id
        AND pr.deleted = false
      ORDER BY pr.fecha DESC
      LIMIT 50
    ) fila;

  SELECT json_build_object(
    'alumno', json_build_object('id', v_alumno.id, 'nombre', v_alumno.nombre, 'permiso', v_alumno.permiso),
    'total', v_total,
    'practicas', COALESCE(v_practicas, '[]'::json)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION public.portal_alumno_datos(int, text) IS
  'Portal del alumno (solo lectura). SECURITY DEFINER acotado: solo '
  'devuelve datos si se conoce el portal_token del alumno (token '
  'secreto, largo y rotable). Ver comentario de cabecera de esta '
  'migración para el detalle de seguridad.';

-- Ejecutable por cualquiera (anon incluido: el alumno no tiene sesión
-- de Supabase Auth). La seguridad la da el token, no el rol que llama.
GRANT EXECUTE ON FUNCTION public.portal_alumno_datos(int, text) TO anon, authenticated;

COMMIT;
