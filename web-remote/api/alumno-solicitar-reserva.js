// Portal del alumno (Fase 0 · Bloque 2 de ROADMAP-SAAS.md): el alumno ya
// autenticado (mismo access_token de Auth que usa alumno-mis-datos.js)
// pide una clase. Crea una reserva en estado 'solicitada' que la
// autoescuela confirmará desde la app de escritorio (Agenda).
//
// POST /api/alumno-solicitar-reserva   header: Authorization: Bearer <access_token>
//   body: { fecha:'YYYY-MM-DD', hora:'HH:MM'|'', n_practicas:1..10, nota:'' }
//
// SIN TEST UNITARIO A PROPÓSITO: ninguno de los endpoints de web-remote/api
// tiene tests unitarios hoy (son funciones serverless de Vercel, ES modules,
// y la suite de Jest del proyecto solo corre en modo CommonJS sobre tests/ —
// forzar un transform de ESM para un único archivo no compensa). Cómo
// probar a mano tras desplegar y completar el login desde alumno.html
// (para conseguir un access_token real de un alumno):
//   curl -X POST https://aulamovil.vercel.app/api/alumno-solicitar-reserva \
//     -H "Authorization: Bearer <access_token>" \
//     -H "Content-Type: application/json" \
//     -d '{"fecha":"2026-08-10","hora":"17:00","n_practicas":1,"nota":"prueba"}'
//   → 200 { ok:true, reserva:{...} }.
// Casos de error a probar a mano:
//   - sin header Authorization → 401.
//   - fecha con formato distinto de YYYY-MM-DD, o ausente → 400.
//   - n_practicas fuera de 1..10 → 400.
//   - migración/RPC no aplicada (portal_solicitar_reserva inexistente) → 503.
//   - token caducado o inválido → 401 "Sesión no válida".
import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders } from './_utils.js';

// Mismo patrón que getSupabaseConToken de alumno-mis-datos.js: anon key +
// el token del alumno reenviado, para que PostgREST valide el JWT y la RPC
// pueda leer auth.jwt() del lado de la BD.
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
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ') || header.length <= 7) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  const token = header.slice(7);

  const { fecha, hora, n_practicas, nota } = req.body || {};

  if (!fecha || typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ ok: false, error: 'Formato de fecha inválido (usar YYYY-MM-DD)' });
  }

  let n = 1;
  if (n_practicas !== undefined && n_practicas !== null && n_practicas !== '') {
    n = parseInt(n_practicas);
    if (isNaN(n) || n < 1 || n > 10) {
      return res.status(400).json({ ok: false, error: 'El número de prácticas debe estar entre 1 y 10' });
    }
  }

  let horaValida = null;
  if (hora && typeof hora === 'string' && hora.trim()) {
    horaValida = hora.trim();
  }

  let notaValida = '';
  if (nota && typeof nota === 'string') {
    notaValida = nota.trim().slice(0, 500);
  }

  try {
    const supabase = getSupabaseConToken(token);

    const { data, error } = await supabase.rpc('portal_solicitar_reserva', {
      p_fecha: fecha,
      p_hora: horaValida,
      p_n_practicas: n,
      p_nota: notaValida
    });

    if (error) {
      // La función RPC todavía no existe: degradación limpia, no un 500 feo.
      if (error.code === '42883' || error.code === 'PGRST202' || /portal_solicitar_reserva/i.test(error.message || '')) {
        return res.status(503).json({ ok: false, error: 'Portal no disponible' });
      }
      // JWT inválido o caducado según PostgREST.
      if (error.code === 'PGRST301') {
        return res.status(401).json({ ok: false, error: 'Sesión no válida' });
      }
      console.error('Error en portal_solicitar_reserva', error);
      return res.status(500).json({ ok: false, error: 'No se pudo crear la solicitud' });
    }

    if (!data) {
      return res.status(403).json({ ok: false, error: 'No se pudo crear la solicitud' });
    }

    return res.status(200).json({ ok: true, reserva: data });
  } catch (err) {
    console.error('Error inesperado en alumno-solicitar-reserva', err);
    return res.status(500).json({ ok: false, error: 'No se pudo crear la solicitud' });
  }
}
