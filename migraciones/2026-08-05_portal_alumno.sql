-- =====================================================================
-- KMAlumnos — Migración: portal del alumno (email OTP de Supabase Auth)
-- Fecha: 2026-08-05
-- Proyecto Supabase: dmwoqugdnwgkcqtixhyw
--
-- DEPENDENCIA: requiere haber aplicado antes
-- `2026-08-05_alumno_email.sql` (usa la columna `alumnos.email`). Sin esa
-- migración, esta no falla al aplicarse (las funciones se crean igual),
-- pero `alumno_email_existe`/`portal_mis_datos` siempre devolverán
-- false/NULL porque no hay ningún email guardado.
--
-- QUÉ HACE (resumen, ver migraciones/README.md para el detalle en
-- lenguaje llano):
--   Entregable de ROADMAP-SAAS.md → Fase 0 · Bloque 2 (portal del
--   alumno), reescrito para usar el login por email OTP (código de un
--   solo uso) de Supabase Auth en vez del "enlace inadivinable" con
--   portal_token de la versión anterior de esta migración (descartada:
--   ya no hay columna `portal_token` ni su índice). El flujo es:
--     1. El alumno escribe su email en /alumno.html.
--     2. `alumno_email_existe(email)` comprueba si ese email pertenece
--        a algún alumno (sin revelar nada más) y, si es así, el backend
--        pide a Supabase Auth que envíe un código de 6 dígitos a ese
--        correo (signInWithOtp).
--     3. El alumno introduce el código; Supabase Auth lo verifica
--        (verifyOtp) y le entrega un JWT normal de Auth.
--     4. Con ese JWT, `portal_mis_datos()` devuelve sus datos y sus
--        últimas prácticas — sin parámetros: el email sale del propio
--        JWT verificado, así nadie puede pedir los datos de otro
--        alumno cambiando un id o un email en la petición.
--
-- POR QUÉ SECURITY DEFINER ES SEGURO AQUÍ:
--   `alumno_email_existe` solo devuelve un booleano (¿existe un alumno
--   con este email?), nunca datos del alumno; es la misma superficie
--   que ya expone implícitamente cualquier formulario de "¿olvidaste tu
--   contraseña?" (confirma que un email está registrado, nada más), así
--   que SECURITY DEFINER no añade riesgo nuevo.
--   `portal_mis_datos` NO acepta ningún parámetro: lee el email del
--   alumno directamente de `auth.jwt() ->> 'email'`, es decir, del JWT
--   que Supabase Auth ya ha verificado tras comprobar el código enviado
--   al correo. Un alumno solo puede llegar a tener ese JWT si ha
--   demostrado ser dueño de ese buzón, así que solo puede ver SUS
--   propios datos a través de su propio JWT — nunca los de otro alumno,
--   porque no hay forma de pedir "dame los datos del email X": el
--   parámetro no existe. SECURITY DEFINER aquí sirve únicamente para
--   saltar RLS de forma acotada (leer `alumnos`/`practicas`/`profesores`
--   sin JWT de empresa), sin debilitar ninguna política RLS existente:
--   las tablas siguen protegidas para cualquier acceso que no pase por
--   esta función.
--
-- IMPORTANTE: esta migración NO se ha aplicado a producción. Es un
-- archivo de texto en el repositorio, a la espera de revisión y de
-- ejecución manual siguiendo migraciones/README.md. Mientras no se
-- aplique, los endpoints `web-remote/api/alumno-solicitar-codigo.js` y
-- `web-remote/api/alumno-mis-datos.js` degradan limpiamente (503
-- "Portal no disponible") porque las funciones RPC no existen todavía.
-- Además, en el panel de Supabase hace falta habilitar y configurar el
-- login por email OTP — ver el bloque de prerequisitos documentado en
-- la cabecera de `web-remote/api/alumno-solicitar-codigo.js` y en
-- `migraciones/README.md`.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Función `alumno_email_existe(p_email)`: único booleano, sin
--    revelar nada más del alumno. La llama el endpoint que pide el
--    código, ANTES de que el alumno tenga ningún JWT.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alumno_email_existe(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existe boolean;
BEGIN
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.alumnos
     WHERE lower(email) = lower(p_email)
       AND deleted = false
  ) INTO v_existe;

  RETURN v_existe;
END;
$$;

COMMENT ON FUNCTION public.alumno_email_existe(text) IS
  'Portal del alumno: ¿hay algún alumno activo con este email? Solo '
  'devuelve un booleano, nunca datos del alumno. La usa el endpoint que '
  'pide el código OTP, antes de que el alumno tenga sesión.';

GRANT EXECUTE ON FUNCTION public.alumno_email_existe(text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Función `portal_mis_datos()`: única puerta de entrada a los datos
--    del portal. Sin parámetros a propósito — el email sale del JWT ya
--    verificado por Supabase Auth (auth.jwt() ->> 'email'), así no se
--    puede falsear pidiendo los datos de otro alumno. Ver arriba por
--    qué SECURITY DEFINER es seguro en este caso concreto.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_mis_datos()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_alumno record;
  v_total int;
  v_practicas json;
  v_resultado json;
BEGIN
  v_email := auth.jwt() ->> 'email';

  IF v_email IS NULL OR trim(v_email) = '' THEN
    RETURN NULL;
  END IF;

  -- LIMITACIÓN CONOCIDA: si hubiera más de un alumno con el mismo email
  -- (duplicado por error de captura), se elige el de id MÁS ALTO (el
  -- más reciente) de forma arbitraria pero determinista. No debería
  -- pasar en uso normal (cada alumno tiene su propio correo), pero se
  -- documenta aquí para que quede claro el criterio de desempate.
  SELECT id, nombre, permiso
    INTO v_alumno
    FROM public.alumnos
   WHERE lower(email) = lower(v_email)
     AND deleted = false
   ORDER BY id DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_total
    FROM public.practicas
   WHERE alumno_id = v_alumno.id
     AND deleted = false;

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

COMMENT ON FUNCTION public.portal_mis_datos() IS
  'Portal del alumno (solo lectura). Sin parámetros: el email sale de '
  'auth.jwt(), ya verificado por Supabase Auth tras el código OTP. Si '
  'hay emails duplicados entre alumnos, se usa el de id más alto (ver '
  'comentario dentro de la función). Ver cabecera de esta migración '
  'para el detalle de seguridad de SECURITY DEFINER.';

-- Solo `authenticated`: el alumno ya tiene JWT de Auth (ha verificado
-- su código) para cuando llama a esta función. No se concede a `anon`.
GRANT EXECUTE ON FUNCTION public.portal_mis_datos() TO authenticated;

COMMIT;
