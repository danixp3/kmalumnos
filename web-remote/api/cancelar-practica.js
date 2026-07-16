import { setCorsHeaders, requireAuth, validators, getSupabase } from './_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // Verificar autenticación
  if (!requireAuth(req, res)) return;

  let supabase;
  try { supabase = await getSupabase(); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  const { practica_id } = req.body || {};

  // Validar practica_id
  const practicaIdVal = validators.positiveInt(practica_id, 'practica_id');
  if (!practicaIdVal.valid) {
    return res.status(400).json({ error: practicaIdVal.error });
  }

  // Verificar que la práctica existe y fue creada desde web-remote
  const { data: practica, error: errFind } = await supabase
    .from('practicas')
    .select('id, fecha, source, updated_at')
    .eq('id', practicaIdVal.value)
    .eq('deleted', false)
    .single();

  if (errFind || !practica) {
    return res.status(404).json({ error: 'Práctica no encontrada' });
  }

  // Solo permitir cancelar prácticas creadas desde web-remote
  if (practica.source !== 'web-remote') {
    return res.status(403).json({ error: 'Solo se pueden cancelar prácticas creadas desde esta web' });
  }

  // Solo permitir cancelar prácticas de las últimas 24h
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const practicaTime = new Date(practica.updated_at);
  if (practicaTime < hace24h) {
    return res.status(403).json({ error: 'Solo se pueden cancelar prácticas de las últimas 24 horas' });
  }

  // Marcar como eliminada (soft delete)
  const { error: errDelete } = await supabase
    .from('practicas')
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', practicaIdVal.value);

  if (errDelete) {
    console.error('Error cancelando práctica:', errDelete);
    return res.status(500).json({ error: 'Error al cancelar la práctica: ' + errDelete.message });
  }

  return res.status(200).json({
    ok: true,
    mensaje: 'Práctica cancelada correctamente'
  });
}
