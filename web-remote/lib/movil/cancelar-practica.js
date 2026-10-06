import { setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError, borrarAvisosPractica } from '../../api/_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  const { practica_id, profesor_id, forzar } = req.body || {};

  // Validar practica_id
  const practicaIdVal = validators.positiveInt(practica_id, 'practica_id');
  if (!practicaIdVal.valid) {
    return res.status(400).json({ error: practicaIdVal.error });
  }

  // Verificar que la práctica existe y fue creada desde web-remote
  const { data: practica, error: errFind } = await supabase
    .from('practicas')
    .select('id, fecha, source, updated_at, km_inicial, km_final, profesor_id')
    .eq('id', practicaIdVal.value)
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId)
    .single();

  if (errFind && isAuthError(errFind)) {
    return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  }

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

  // Una clase que está EN CURSO la tiene abierta el teléfono de su profesor (cronómetro, km, firma).
  // Cancelarla desde el teléfono de otro la deja huérfana allí y fue la causa de km mal registrados:
  // hay que confirmarlo expresamente (`forzar`). `profesor_id` = el profesor desde el que se cancela.
  const enCurso = practica.km_inicial > 0 && !practica.km_final;
  const declara = req.body && 'profesor_id' in req.body;   // los móviles con versión antigua no lo mandan: se les deja como antes
  const quien = Number.isInteger(Number(profesor_id)) && Number(profesor_id) > 0 ? Number(profesor_id) : null;
  if (enCurso && declara && forzar !== true && practica.profesor_id && quien !== practica.profesor_id) {
    let nombre = null;
    const { data: prof } = await supabase.from('profesores').select('nombre').eq('id', practica.profesor_id).maybeSingle();
    if (prof) nombre = prof.nombre;
    return res.status(409).json({
      codigo: 'clase_en_curso_de_otro', profesor: nombre,
      error: `Esta clase la está dando ${nombre || 'otro profesor'} desde su teléfono. Si la cancelas, ese teléfono no podrá guardarla igual y los km pueden quedar mal. Pídele que la cancele él.`
    });
  }

  // Marcar como eliminada (soft delete)
  const { error: errDelete } = await supabase
    .from('practicas')
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', practicaIdVal.value);

  if (handleSupabaseError(errDelete, res, 'Error al cancelar la práctica')) return;
  await borrarAvisosPractica(supabase, auth.empresaId, [practicaIdVal.value]);

  return res.status(200).json({
    ok: true,
    mensaje: 'Práctica cancelada correctamente'
  });
}
