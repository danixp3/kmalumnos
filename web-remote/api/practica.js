import { setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError } from './_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  const { alumno_id, fecha, profesor_id } = req.body || {};

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

  // Validar profesor_id (opcional)
  let profesorIdFinal = null;
  if (profesor_id !== null && profesor_id !== undefined && profesor_id !== '') {
    const pidVal = validators.positiveInt(profesor_id, 'profesor_id');
    if (!pidVal.valid) {
      return res.status(400).json({ error: pidVal.error });
    }
    profesorIdFinal = pidVal.value;

    const { data: profesor, error: errP } = await supabase
      .from('profesores')
      .select('id')
      .eq('id', profesorIdFinal)
      .eq('deleted', false)
      .eq('empresa_id', auth.empresaId)
      .single();

    if (errP || !profesor) {
      return res.status(400).json({ error: 'El profesor especificado no existe' });
    }
  }

  // Obtener alumno y su vehículo
  const { data: alumno, error: errAlumno } = await supabase
    .from('alumnos')
    .select('id, nombre, vehiculo_id')
    .eq('id', alumnoIdVal.value)
    .eq('deleted', false)
    .single();

  if (errAlumno && isAuthError(errAlumno)) {
    return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  }

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

  // Insertar práctica con km=0,0 (se rellenará desde la app de escritorio).
  // Si choca la clave primaria (23505) es que la secuencia de la nube se quedó
  // atrás (el escritorio sube ids propios): se realinea con el RPC
  // reparar_secuencias y se reintenta una vez.
  const nuevaPractica = {
    alumno_id: alumno.id,
    vehiculo_id: alumno.vehiculo_id,
    fecha: fechaVal.value,
    km_inicial: 0,
    km_final: 0,
    deleted: false,
    source: 'web-remote', // Marcar origen para historial
    empresa_id: auth.empresaId,
    profesor_id: profesorIdFinal,
    updated_at: new Date().toISOString()
  };
  let { data: newPractica, error: errInsert } = await supabase
    .from('practicas')
    .insert(nuevaPractica)
    .select('id')
    .single();

  if (errInsert && errInsert.code === '23505') {
    await supabase.rpc('reparar_secuencias');
    ({ data: newPractica, error: errInsert } = await supabase
      .from('practicas')
      .insert(nuevaPractica)
      .select('id')
      .single());
  }

  if (handleSupabaseError(errInsert, res, 'Error al registrar la práctica')) return;

  return res.status(200).json({
    ok: true,
    mensaje: `Práctica registrada para ${alumno.nombre} el ${fechaVal.value}`,
    practica_id: newPractica.id
  });
}
