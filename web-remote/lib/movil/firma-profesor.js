// Firma del profesor (Perfil → Mi firma). Se dibuja una vez y el escritorio la
// pone en la casilla «Firma del profesor» de todas sus clases en la ficha DGT.
//   GET  ?profesor_id=N            → { ok, firma: 'data:image/png;base64,...' | null }
//   POST { profesor_id, firma }    → guarda la firma (firma null = quitarla)
// Sin la columna profesores.firma (migración 2026-10-02 sin aplicar) → 501.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  esErrorColumnaInexistente
} from '../../api/_utils.js';

const MAX_FIRMA = 200000;
const FIRMA_VALIDA = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const NO_DISPONIBLE = { error: 'La firma del profesor todavía no está disponible en la nube. Avisa al administrador.', codigo: 'firma_no_disponible' };

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const datos = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  const idVal = validators.positiveInt(datos.profesor_id, 'profesor_id');
  if (!idVal.valid) return res.status(400).json({ error: idVal.error });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('profesores').select('id, firma')
      .eq('id', idVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
    if (error && esErrorColumnaInexistente(error)) return res.status(200).json({ ok: true, firma: null, disponible: false });
    if (error && isAuthError(error)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
    if (handleSupabaseError(error, res, 'Error al leer la firma')) return;
    if (!data) return res.status(404).json({ error: 'Profesor no encontrado' });
    return res.status(200).json({ ok: true, firma: typeof data.firma === 'string' && FIRMA_VALIDA.test(data.firma) ? data.firma : null, disponible: true });
  }

  const { firma } = datos;
  if (firma !== null && (typeof firma !== 'string' || !FIRMA_VALIDA.test(firma))) {
    return res.status(400).json({ error: 'La firma no es una imagen válida.' });
  }
  if (firma && firma.length > MAX_FIRMA) return res.status(400).json({ error: 'La firma es demasiado grande. Bórrala y firma más sencillo.' });

  const { data, error } = await supabase.from('profesores')
    .update({ firma: firma || null, updated_at: new Date().toISOString() })
    .eq('id', idVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId)
    .select('id');
  if (error && esErrorColumnaInexistente(error)) return res.status(501).json(NO_DISPONIBLE);
  if (handleSupabaseError(error, res, 'Error al guardar la firma')) return;
  if (!data || !data.length) return res.status(404).json({ error: 'Profesor no encontrado' });
  return res.status(200).json({ ok: true });
}
