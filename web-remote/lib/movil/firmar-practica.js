// Guarda la firma del alumno en una práctica ya cerrada (o en todas las clases
// de una sesión partida, `practica_ids`). La firma es una imagen PNG pequeña
// (data URL). Necesita la columna `firma` (migración
// 2026-09-29_practica_movil.sql): si aún no existe responde 501 y la web
// avisa al profesor en vez de fingir que se ha guardado.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  esErrorColumnaInexistente
} from '../../api/_utils.js';

// Caracteres del data URL. La web recorta la firma a su contorno y la reduce
// (suele quedar en 5-25 mil); el margen evita rechazar firmas muy densas.
const MAX_FIRMA = 200000;
const MAX_IDS = 8;

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { practica_id, practica_ids, firma } = req.body || {};
  const crudos = Array.isArray(practica_ids) && practica_ids.length ? practica_ids : [practica_id];
  if (crudos.length > MAX_IDS) return res.status(400).json({ error: 'Demasiadas prácticas en una sola firma.' });
  const ids = [];
  for (const v of crudos) {
    const idVal = validators.positiveInt(v, 'practica_id');
    if (!idVal.valid) return res.status(400).json({ error: idVal.error });
    if (!ids.includes(idVal.value)) ids.push(idVal.value);
  }
  if (typeof firma !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(firma)) {
    return res.status(400).json({ error: 'La firma no es una imagen válida.' });
  }
  if (firma.length > MAX_FIRMA) return res.status(400).json({ error: 'La firma es demasiado grande.' });

  const { data: practicas, error: errFind } = await supabase
    .from('practicas').select('id, km_final')
    .in('id', ids).eq('deleted', false).eq('empresa_id', auth.empresaId);
  if (errFind && isAuthError(errFind)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  if (errFind || !practicas || practicas.length !== ids.length) return res.status(404).json({ error: 'Práctica no encontrada' });
  if (practicas.some(p => !p.km_final)) return res.status(409).json({ error: 'Cierra la práctica (km final) antes de firmarla.' });

  const { error } = await supabase
    .from('practicas').update({ firma, updated_at: new Date().toISOString() })
    .in('id', ids).eq('empresa_id', auth.empresaId);
  if (esErrorColumnaInexistente(error)) {
    return res.status(501).json({ error: 'La base de datos aún no admite firmas. Pide al propietario que active la migración «práctica móvil».', codigo: 'firma_no_disponible' });
  }
  if (handleSupabaseError(error, res, 'Error al guardar la firma')) return;

  return res.status(200).json({ ok: true, firmadas: ids.length });
}
