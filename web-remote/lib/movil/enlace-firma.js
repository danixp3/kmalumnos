// Crea el enlace para que el alumno firme desde su propio móvil las clases que
// se quedaron sin firmar (el profesor se olvidó de pasarle el teléfono). El
// profesor lo comparte por WhatsApp; el alumno lo abre sin cuenta en
// /f/<código> (firmar.html → /api/firma-alumno).
//
// POST /api/enlace-firma (con sesión)
//   { alumno_id, practica_ids?, dias?, profesor_id?, token? }
//   Sin practica_ids: las clases del móvil de los últimos 60 días que le
//   falten por firmar. `token` (opcional, lo genera el teléfono): repetir la
//   misma petición (doble toque, mala cobertura) devuelve el mismo enlace.
//   → { ok, url, caduca, n, practica_ids, faltan }
//   409 nada_que_firmar · 404 alumno_no_existe · 501 enlaces_no_disponibles
// La comprobación de qué clases se pueden firmar la hace la base de datos
// (crear_enlace_firma, migración 2026-10-09_enlaces_firma.sql).
import {
  setCorsHeaders, requireAuth, getSupabase, validators, handleSupabaseError,
  nuevoTokenFirma, huellaToken, tokenFirmaValido, urlFirma, faltaFuncion
} from '../../api/_utils.js';

const MAX_IDS = 100;

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);
  const b = req.body || {};

  const al = validators.positiveInt(b.alumno_id, 'alumno_id');
  if (!al.valid) return res.status(400).json({ error: al.error });
  let ids = null;
  if (b.practica_ids != null) {
    if (!Array.isArray(b.practica_ids) || !b.practica_ids.length) return res.status(400).json({ error: 'Faltan las clases' });
    if (b.practica_ids.length > MAX_IDS) return res.status(400).json({ error: `Como mucho ${MAX_IDS} clases por enlace` });
    ids = [];
    for (const v of b.practica_ids) {
      const x = validators.positiveInt(v, 'practica_id');
      if (!x.valid) return res.status(400).json({ error: x.error });
      if (!ids.includes(x.value)) ids.push(x.value);
    }
  }
  const dias = Math.min(30, Math.max(1, parseInt(b.dias) || 7));
  const prof = b.profesor_id == null ? null : validators.positiveInt(b.profesor_id, 'profesor_id');
  if (prof && !prof.valid) return res.status(400).json({ error: prof.error });
  if (b.token != null && !tokenFirmaValido(b.token)) return res.status(400).json({ error: 'Código de enlace no válido' });

  // Quién lo manda (lo ve el alumno: «Te lo envía Javier»)
  let creadoPor = null;
  if (prof) {
    const { data } = await supabase.from('profesores').select('nombre').eq('id', prof.value).eq('empresa_id', auth.empresaId).maybeSingle();
    creadoPor = data && data.nombre ? String(data.nombre).trim().slice(0, 80) : null;
  }

  const token = b.token || nuevoTokenFirma();
  const hash = huellaToken(token);
  const { data, error } = await supabase.rpc('crear_enlace_firma', {
    p_token_hash: hash, p_alumno_id: al.value, p_practica_ids: ids, p_dias: dias,
    p_creado_por: creadoPor, p_profesor_id: prof ? prof.value : null
  });
  if (faltaFuncion(error)) {
    return res.status(501).json({ error: 'La base de datos aún no admite enlaces de firma. Pide al propietario que la actualice.', codigo: 'enlaces_no_disponibles' });
  }
  if (error && error.code === '23505' && b.token) {
    // La misma petición otra vez (su respuesta se perdió): ese enlace ya existe
    const { data: e } = await supabase.from('enlaces_firma').select('practica_ids, caduca, alumno_id')
      .eq('token_hash', hash).eq('empresa_id', auth.empresaId).maybeSingle();
    if (e && Number(e.alumno_id) === al.value) {
      return res.status(200).json({ ok: true, repetida: true, url: urlFirma(token), caduca: e.caduca, n: (e.practica_ids || []).length, practica_ids: e.practica_ids || [], faltan: [] });
    }
  }
  if (handleSupabaseError(error, res, 'No se pudo crear el enlace')) return;
  const r = data || {};
  if (!r.ok) {
    if (r.codigo === 'nada_que_firmar') return res.status(409).json({ error: 'Este alumno no tiene clases cerradas pendientes de firmar.', codigo: r.codigo, faltan: r.faltan || [] });
    if (r.codigo === 'alumno_no_existe') return res.status(404).json({ error: 'Alumno no encontrado', codigo: r.codigo });
    return res.status(400).json({ error: 'No se pudo crear el enlace', codigo: r.codigo || 'error' });
  }
  return res.status(200).json({ ok: true, url: urlFirma(token), caduca: r.caduca, n: r.n, practica_ids: r.practica_ids || [], faltan: r.faltan || [] });
}
