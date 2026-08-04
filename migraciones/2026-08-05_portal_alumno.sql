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
-- DEPENDENCIA OPCIONAL — módulo `portal_alumno`: desde esta versión, las
-- dos funciones del portal exigen (vía la función auxiliar
-- `empresa_tiene_portal`) que la empresa del alumno tenga contratado el
-- módulo 'portal_alumno' en `modulos_empresa` (ver
-- `2026-08-04_modulos_empresa.sql`, ROADMAP-SAAS.md → Fase 0 · Bloque 1).
-- Es GRACEFUL: si esa migración no se ha aplicado todavía (la tabla
-- `modulos_empresa` no existe), el gating no bloquea nada y el portal
-- funciona exactamente igual que antes de existir el sistema de módulos.
-- No hace falta ningún orden de aplicación entre ambas migraciones.
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
-- 0) Función auxiliar `empresa_tiene_portal(p_empresa_id)`: gating por
--    módulo contratado, GRACEFUL y compartido por las dos funciones del
--    portal. "Graceful" significa que mientras el sistema de módulos
--    (ROADMAP-SAAS.md → Fase 0 · Bloque 1, tabla `modulos_empresa`) no
--    se haya aplicado en Supabase, esta función devuelve TRUE siempre
--    (modo clásico: el portal funciona igual que antes de existir el
--    concepto de módulos, no se bloquea nada). Solo cuando la tabla
--    existe de verdad se exige que la empresa tenga de alta el módulo
--    'portal_alumno' con activo = true; cualquier error inesperado
--    leyendo esa tabla también se trata como TRUE, para no dejar el
--    portal caído por un fallo ajeno a la lógica de negocio.
--    Clave del módulo: 'portal_alumno' — así se llamará la fila que
--    haya que insertar en `modulos_empresa` el día que se dé de alta
--    este módulo comercialmente.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.empresa_tiene_portal(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activo boolean;
BEGIN
  -- Modo clásico: si la tabla de módulos no existe todavía, no bloquear.
  IF to_regclass('public.modulos_empresa') IS NULL THEN
    RETURN true;
  END IF;

  SELECT activo INTO v_activo
    FROM public.modulos_empresa
   WHERE empresa_id = p_empresa_id
     AND modulo = 'portal_alumno';

  RETURN coalesce(v_activo, false);
EXCEPTION
  WHEN undefined_table OR others THEN
    -- Cualquier fallo inesperado leyendo modulos_empresa tampoco bloquea.
    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.empresa_tiene_portal(uuid) IS
  'Gating del portal del alumno por módulo contratado (clave ''portal_alumno'' '
  'en modulos_empresa). Graceful: si la tabla modulos_empresa no existe '
  '(sistema de módulos aún no aplicado) o falla la consulta, devuelve TRUE '
  '(modo clásico, no bloquea). Solo devuelve FALSE cuando la tabla existe y '
  'la empresa no tiene el módulo activo.';

-- Función SOLO de uso interno: la llaman `alumno_email_existe` y
-- `portal_mis_datos` (ambas SECURITY DEFINER, corren como su dueño, que
-- conserva EXECUTE), así que ningún rol externo la necesita. Supabase
-- concede EXECUTE por defecto a anon/authenticated en toda función nueva
-- del esquema public, por eso hay que revocarlo explícitamente (no basta
-- con no otorgarlo). Evita que un tercero use la función como oráculo de
-- "¿esta empresa tiene el portal contratado?".
REVOKE EXECUTE ON FUNCTION public.empresa_tiene_portal(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1) Función `alumno_email_existe(p_email)`: único booleano, sin
--    revelar nada más del alumno. La llama el endpoint que pide el
--    código, ANTES de que el alumno tenga ningún JWT. Además de existir
--    el alumno, exige que la empresa de ese alumno tenga contratado el
--    módulo 'portal_alumno' (empresa_tiene_portal) — así no se envían
--    códigos OTP a alumnos de empresas que no han contratado el portal.
--    Si hay varios alumnos con el mismo email en empresas distintas,
--    basta con que uno de ellos pertenezca a una empresa con el portal
--    activo para devolver true.
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
       AND public.empresa_tiene_portal(empresa_id)
  ) INTO v_existe;

  RETURN v_existe;
END;
$$;

COMMENT ON FUNCTION public.alumno_email_existe(text) IS
  'Portal del alumno: ¿hay algún alumno activo, de una empresa con el '
  'módulo portal_alumno activo (empresa_tiene_portal), con este email? '
  'Solo devuelve un booleano, nunca datos del alumno. La usa el endpoint '
  'que pide el código OTP, antes de que el alumno tenga sesión.';

GRANT EXECUTE ON FUNCTION public.alumno_email_existe(text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Función `portal_mis_datos()`: única puerta de entrada a los datos
--    del portal. Sin parámetros a propósito — el email sale del JWT ya
--    verificado por Supabase Auth (auth.jwt() ->> 'email'), así no se
--    puede falsear pidiendo los datos de otro alumno. Ver arriba por
--    qué SECURITY DEFINER es seguro en este caso concreto.
--    Tras localizar al alumno, comprueba también empresa_tiene_portal
--    (mismo gating graceful que alumno_email_existe): si la empresa del
--    alumno no tiene el módulo 'portal_alumno' activo, se devuelve NULL,
--    como si no hubiera datos — el alumno nunca sabe si es por no tener
--    módulo contratado o por no tener prácticas, mismo comportamiento
--    externo en ambos casos.
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
  SELECT id, nombre, permiso, empresa_id
    INTO v_alumno
    FROM public.alumnos
   WHERE lower(email) = lower(v_email)
     AND deleted = false
   ORDER BY id DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Gating por módulo contratado: si la empresa de este alumno no tiene
  -- 'portal_alumno' activo, se responde igual que si no hubiera alumno.
  IF NOT public.empresa_tiene_portal(v_alumno.empresa_id) THEN
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
  'comentario dentro de la función). Devuelve NULL si la empresa del '
  'alumno no tiene el módulo portal_alumno activo (empresa_tiene_portal). '
  'Ver cabecera de esta migración para el detalle de seguridad de '
  'SECURITY DEFINER.';

-- Solo `authenticated`: el alumno ya tiene JWT de Auth (ha verificado
-- su código) para cuando llama a esta función. Supabase concede EXECUTE
-- por defecto a anon en toda función nueva del esquema public, así que
-- se revoca explícitamente de anon/PUBLIC (para anon devolvería NULL de
-- todos modos —no hay email en el JWT—, pero se cierra por higiene).
GRANT EXECUTE ON FUNCTION public.portal_mis_datos() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_mis_datos() FROM PUBLIC, anon;

COMMIT;
