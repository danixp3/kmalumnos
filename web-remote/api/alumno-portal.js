// Portal del alumno (solo lectura, Fase 0 · Bloque 2 de ROADMAP-SAAS.md).
//
// A diferencia del resto de endpoints de esta carpeta, un alumno NO es una
// cuenta de empresa: no tiene JWT de Supabase Auth, así que este endpoint
// NO pasa por requireAuth/getSupabase(token) (ver mapa-web.md). En su lugar
// usa un token de capacidad ("enlace inadivinable"): alumno_id + un token
// secreto y aleatorio guardado en `alumnos.portal_token`, verificado por la
// función SECURITY DEFINER `portal_alumno_datos` (ver
// migraciones/2026-08-05_portal_alumno.sql para el detalle de seguridad).
//
// GET /api/alumno-portal?alumno_id=<int>&token=<str>
//
// SIN TEST UNITARIO A PROPÓSITO: ninguno de los endpoints de web-remote/api
// tiene tests unitarios hoy (son funciones serverless de Vercel, ES modules,
// y la suite de Jest del proyecto solo corre en modo CommonJS sobre tests/ —
// forzar un transform de ESM para un único archivo no compensa). Se prueba:
//   1. En local/manual: tras aplicar migraciones/2026-08-05_portal_alumno.sql
//      y asignar un portal_token de prueba a un alumno (ver
//      migraciones/README.md → sección "portal del alumno" para el SQL),
//      GET /api/alumno-portal?alumno_id=<id>&token=<token> debe devolver
//      200 con { ok:true, alumno, total, practicas }.
//   2. Con el smoke test de la web: scripts/probar_web.py (skill
//      cambiar-web) no cubre este endpoint todavía porque no crea datos de
//      prueba; comprobarlo aparte con curl tras desplegar.
//   3. Casos de error a probar a mano: sin migración aplicada → 503; token
//      incorrecto o alumno_id inexistente → 404 "Acceso no válido"; alumno_id
//      no numérico o token vacío → 400.
import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, validators } from './_utils.js';

// Cliente con la anon key, sin token de usuario: el alumno no tiene sesión
// de empresa. La RPC es SECURITY DEFINER y ejecutable por `anon`, así que
// este cliente "plano" basta para llamarla.
function getSupabaseAnon() {
  return createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const alumnoIdVal = validators.positiveInt(req.query.alumno_id, 'alumno_id');
  if (!alumnoIdVal.valid) {
    return res.status(400).json({ ok: false, error: alumnoIdVal.error });
  }

  const token = req.query.token;
  if (!token || typeof token !== 'string' || !token.trim() || token.length > 200) {
    return res.status(400).json({ ok: false, error: 'token es requerido' });
  }

  try {
    const supabase = getSupabaseAnon();

    const { data, error } = await supabase.rpc('portal_alumno_datos', {
      p_alumno_id: alumnoIdVal.value,
      p_token: token
    });

    if (error) {
      // La función RPC todavía no existe (migración 2026-08-05 no aplicada):
      // degradación limpia, no un 500 feo. Código típico de Postgres para
      // "función inexistente" es 42883; PostgREST lo envuelve con PGRST202.
      if (error.code === '42883' || error.code === 'PGRST202' || /portal_alumno_datos/i.test(error.message || '')) {
        return res.status(503).json({ ok: false, error: 'Portal no disponible' });
      }
      console.error('Error en portal_alumno_datos', error);
      return res.status(500).json({ ok: false, error: 'Error al obtener los datos del portal' });
    }

    if (!data) {
      // NULL: alumno no existe, borrado, sin token o token incorrecto.
      // Mismo mensaje en todos los casos para no revelar cuál fue.
      return res.status(404).json({ ok: false, error: 'Acceso no válido' });
    }

    return res.status(200).json({ ok: true, ...data });
  } catch (err) {
    console.error('Error inesperado en alumno-portal', err);
    return res.status(500).json({ ok: false, error: 'Error al obtener los datos del portal' });
  }
}
