import { setCorsHeaders, requireAuth, validators, getSupabase, getEmpresaId } from './_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // Verificar autenticación
  if (!requireAuth(req, res)) return;

  let supabase;
  try { supabase = await getSupabase(); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  const empresaId = await getEmpresaId();

  const { alumno_id, fecha } = req.body || {};

  // Validar alumno_id
  const alumnoIdVal = validators.positiveInt(alumno_id, 'alumno_id');
  if (!alumnoIdVal.valid) {
    return res.status(400).json({ error: alumnoIdVal.error });
  }

  // Validar fecha
  const fechaVal = validators.fecha(fecha);
  if (!fechaVal.valid) {
    return res.status(400).json({ error: fechaVal.error });
  }

  // Obtener alumno y su vehículo
  const { data: alumno, error: errAlumno } = await supabase
    .from('alumnos')
    .select('id, nombre, vehiculo_id')
    .eq('id', alumnoIdVal.value)
    .eq('deleted', false)
    .single();

  if (errAlumno || !alumno) {
    return res.status(404).json({ error: 'Alumno no encontrado' });
  }

  if (!alumno.vehiculo_id) {
    return res.status(400).json({ error: 'El alumno no tiene vehículo asignado' });
  }

  // Verificar que no existe ya una práctica para este alumno en esta fecha
  const { data: existente } = await supabase
    .from('practicas')
    .select('id')
    .eq('alumno_id', alumnoIdVal.value)
    .eq('fecha', fechaVal.value)
    .eq('deleted', false)
    .single();

  if (existente) {
    return res.status(400).json({ error: 'Ya existe una práctica para este alumno en esta fecha' });
  }

  // Insertar práctica con km=0,0 (se rellenará desde la app de escritorio)
  const { data: newPractica, error: errInsert } = await supabase
    .from('practicas')
    .insert({
      alumno_id: alumno.id,
      vehiculo_id: alumno.vehiculo_id,
      fecha: fechaVal.value,
      km_inicial: 0,
      km_final: 0,
      deleted: false,
      source: 'web-remote', // Marcar origen para historial
      empresa_id: empresaId,
      updated_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (errInsert) {
    console.error('Error insertando práctica:', errInsert);
    return res.status(500).json({ error: 'Error al registrar la práctica: ' + errInsert.message });
  }

  return res.status(200).json({
    ok: true,
    mensaje: `Práctica registrada para ${alumno.nombre} el ${fechaVal.value}`,
    practica_id: newPractica.id
  });
}
