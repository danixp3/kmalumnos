// Coche habitual de un profesor (Perfil → Coche de cada profesor). La web lo
// propone al iniciar o anotar sus clases; el escritorio lo ve en Profesores.
//   POST { profesor_id, vehiculo_id }   (vehiculo_id null = sin coche fijo)
// Sin la columna profesores.vehiculo_id (migración 2026-10-03 sin aplicar) → 501.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, handleSupabaseError, esErrorColumnaInexistente
} from '../../api/_utils.js';

const NO_DISPONIBLE = { error: 'El coche de cada profesor todavía no está disponible en la nube. Avisa al administrador.', codigo: 'coche_no_disponible' };

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { profesor_id, vehiculo_id } = req.body || {};
  const pidVal = validators.positiveInt(profesor_id, 'profesor_id');
  if (!pidVal.valid) return res.status(400).json({ error: pidVal.error });

  let vid = null;
  if (vehiculo_id !== null && vehiculo_id !== undefined && vehiculo_id !== '') {
    const vidVal = validators.positiveInt(vehiculo_id, 'vehiculo_id');
    if (!vidVal.valid) return res.status(400).json({ error: vidVal.error });
    vid = vidVal.value;
    const { data: coche, error: errV } = await supabase.from('vehiculos').select('id')
      .eq('id', vid).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
    if (handleSupabaseError(errV, res, 'Error al comprobar el coche')) return;
    if (!coche) return res.status(400).json({ error: 'Ese coche no existe.' });
  }

  const { data, error } = await supabase.from('profesores')
    .update({ vehiculo_id: vid, updated_at: new Date().toISOString() })
    .eq('id', pidVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId)
    .select('id');
  if (error && esErrorColumnaInexistente(error)) return res.status(501).json(NO_DISPONIBLE);
  if (handleSupabaseError(error, res, 'Error al guardar el coche del profesor')) return;
  if (!data || !data.length) return res.status(404).json({ error: 'Profesor no encontrado' });
  return res.status(200).json({ ok: true, profesor_id: pidVal.value, vehiculo_id: vid });
}
