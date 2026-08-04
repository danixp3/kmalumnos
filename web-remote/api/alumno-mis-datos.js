// Portal del alumno (Fase 0 · Bloque 2 de ROADMAP-SAAS.md): paso 2 del
// login por email OTP. El alumno ya ha verificado su código con
// Supabase Auth (verifyOtp, hecho en el navegador desde alumno.html) y
// tiene un access_token normal de Auth. Este endpoint NO usa el
// requireAuth/getSupabase(token) de _utils.js porque ese está pensado
// para JWT de EMPRESA (exige un claim `sub` legible del que se saca el
// empresa_id); aquí no hace falta empresa_id, así que se replica un
// cliente Supabase mínimo inline (mismo patrón que getSupabase(token)
// de _utils.js: anon key + el token del alumno reenviado como header
// Authorization, para que PostgREST valide el JWT del lado de la BD).
//
// GET /api/alumno-mis-datos   header: Authorization: Bearer <access_token>
//
// SIN TEST UNITARIO A PROPÓSITO: ninguno de los endpoints de web-remote/api
// tiene tests unitarios hoy (son funciones serverless de Vercel, ES modules,
// y la suite de Jest del proyecto solo corre en modo CommonJS sobre tests/ —
// forzar un transform de ESM para un único archivo no compensa). Cómo
// probar a mano tras desplegar y completar el login desde alumno.html
// (para conseguir un access_token real de un alumno):
//   curl https://aulamovil.vercel.app/api/alumno-mis-datos \
//     -H "Authorization: Bearer <access_token>"
//   → 200 { ok:true, alumno, total, practicas }.
// Casos de error a probar a mano:
//   - sin header Authorization → 401.
//   - migración no aplicada (función RPC inexistente) → 503.
//   - token caducado o inválido → 401 "Sesión no válida".
//   - token válido pero el email no corresponde a ningún alumno → 404.
import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders } from './_utils.js';

// Cliente con la anon key + el token del alumno reenviado: PostgREST
// valida ese JWT al ejecutar la RPC, y `portal_mis_datos()` lee el
// email verificado directamente de auth.jwt() del lado de la BD.
function getSupabaseConToken(token) {
  return createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || '',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    }
  );
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ') || header.length <= 7) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  const token = header.slice(7);

  try {
    const supabase = getSupabaseConToken(token);

    const { data, error } = await supabase.rpc('portal_mis_datos');

    if (error) {
      // La función RPC todavía no existe (migración 2026-08-05 no aplicada):
      // degradación limpia, no un 500 feo. Código típico de Postgres para
      // "función inexistente" es 42883; PostgREST lo envuelve con PGRST202.
      if (error.code === '42883' || error.code === 'PGRST202' || /portal_mis_datos/i.test(error.message || '')) {
        return res.status(503).json({ ok: false, error: 'Portal no disponible' });
      }
      // JWT inválido o caducado según PostgREST.
      if (error.code === 'PGRST301') {
        return res.status(401).json({ ok: false, error: 'Sesión no válida' });
      }
      console.error('Error en portal_mis_datos', error);
      return res.status(500).json({ ok: false, error: 'Error al obtener los datos' });
    }

    if (!data) {
      return res.status(404).json({ ok: false, error: 'No hay datos asociados a este correo' });
    }

    return res.status(200).json({ ok: true, ...data });
  } catch (err) {
    console.error('Error inesperado en alumno-mis-datos', err);
    return res.status(500).json({ ok: false, error: 'Error al obtener los datos' });
  }
}
