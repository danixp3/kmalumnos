// Página del alumno para firmar sus clases (firmar.html, /f/<código>). Sin
// sesión: el alumno no tiene cuenta. El código del enlace es la única llave y
// solo abre las clases de ese enlace. La base de datos solo acepta estas
// llamadas del servidor (funciones con el secreto de los avisos, migración
// 2026-10-09_enlaces_firma.sql).
//
// GET  /api/firma-alumno?t=<código>
//   → { ok, alumno, centro, creado_por, caduca, firmado, practicas:[{ id, fecha,
//       hora_inicio, hora_fin, km_inicial, km_final, fraccion, tipo, km_auto,
//       zonas, trabajado, vehiculo_id, vehiculo, matricula, profesor, clase_n,
//       firmada, firmable }] }
//   404 no_existe · 410 caducado | anulado
// POST /api/firma-alumno { t, practica_ids, firma, no_confirmadas?, comentario? }
//   Pone la firma en esas clases si siguen sin firmar (nunca sustituye una
//   firma; repetir el envío no hace nada nuevo) → { ok, firmadas, ya_firmadas }
//   Sin clases y con comentario: solo avisa a la autoescuela.
import { setCorsHeaders, getSupabaseAnon, validators, huellaToken, tokenFirmaValido, faltaFuncion } from '../../api/_utils.js';

const MAX_FIRMA = 200000;
const MAX_IDS = 100;
const FIRMA_PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

function listaIds(v, nombre) {
  if (v == null) return { valid: true, value: [] };
  if (!Array.isArray(v) || v.length > MAX_IDS) return { valid: false, error: `${nombre} no válido` };
  const ids = [];
  for (const x of v) {
    const r = validators.positiveInt(x, nombre);
    if (!r.valid) return r;
    if (!ids.includes(r.value)) ids.push(r.value);
  }
  return { valid: true, value: ids };
}

function noDisponible(res) {
  return res.status(503).json({ error: 'La firma por enlace no está disponible ahora mismo. Inténtalo más tarde o avisa a tu autoescuela.', codigo: 'no_disponible' });
}

const ESTADOS = {
  no_existe: [404, 'Este enlace no existe. Revisa que lo has copiado entero o pide otro a tu autoescuela.'],
  caducado: [410, 'Este enlace ha caducado. Pide a tu autoescuela uno nuevo.'],
  anulado: [410, 'La autoescuela ha anulado este enlace. Si aún tienes clases por firmar, pídeles uno nuevo.']
};

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const secreto = process.env.AVISOS_SECRETO;
  if (!secreto) return noDisponible(res);

  const b = req.method === 'POST' ? (req.body || {}) : {};
  const t = req.method === 'GET' ? (req.query && req.query.t) : b.t;
  if (!tokenFirmaValido(t)) return res.status(404).json({ error: ESTADOS.no_existe[1], codigo: 'no_existe' });
  const supabase = getSupabaseAnon();
  const hash = huellaToken(t);

  if (req.method === 'GET') {
    const { data, error } = await supabase.rpc('firma_enlace_ver', { p_secreto: secreto, p_token_hash: hash });
    if (faltaFuncion(error)) return noDisponible(res);
    if (error) { console.error('firma-alumno ver', error); return res.status(500).json({ error: 'No se pudieron cargar las clases. Inténtalo de nuevo.' }); }
    const r = data || {};
    if (r.estado !== 'ok') {
      const [st, msg] = ESTADOS[r.estado] || ESTADOS.no_existe;
      return res.status(st).json({ error: msg, codigo: r.estado || 'no_existe' });
    }
    const { estado, ...resto } = r;
    return res.status(200).json({ ok: true, ...resto });
  }

  const ids = listaIds(b.practica_ids, 'practica_ids');
  if (!ids.valid) return res.status(400).json({ error: ids.error });
  const no = listaIds(b.no_confirmadas, 'no_confirmadas');
  if (!no.valid) return res.status(400).json({ error: no.error });
  const comentario = typeof b.comentario === 'string' ? b.comentario.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  if (ids.value.length) {
    if (typeof b.firma !== 'string' || !FIRMA_PNG.test(b.firma)) return res.status(400).json({ error: 'La firma no es una imagen válida.' });
    if (b.firma.length > MAX_FIRMA) return res.status(400).json({ error: 'La firma es demasiado grande.' });
  } else if (!comentario) {
    return res.status(400).json({ error: 'Marca al menos una clase para firmar.' });
  }

  const { data, error } = await supabase.rpc('firma_enlace_firmar', {
    p_secreto: secreto, p_token_hash: hash, p_ids: ids.value, p_firma: ids.value.length ? b.firma : null,
    p_no_confirmadas: no.value, p_comentario: comentario || null,
    p_agente: String(req.headers['user-agent'] || '').slice(0, 300) || null
  });
  if (faltaFuncion(error)) return noDisponible(res);
  if (error) { console.error('firma-alumno firmar', error); return res.status(500).json({ error: 'No se pudo guardar la firma. Inténtalo de nuevo.' }); }
  const r = data || {};
  if (!r.ok) {
    if (ESTADOS[r.codigo]) { const [st, msg] = ESTADOS[r.codigo]; return res.status(st).json({ error: msg, codigo: r.codigo }); }
    if (r.codigo === 'firma_no_valida') return res.status(400).json({ error: 'La firma no es una imagen válida.', codigo: r.codigo });
    return res.status(400).json({ error: 'Marca al menos una clase para firmar.', codigo: r.codigo || 'nada' });
  }
  return res.status(200).json({ ok: true, firmadas: r.firmadas || [], ya_firmadas: r.ya_firmadas || [], no_confirmadas: r.no_confirmadas || [] });
}
