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

  const { nombre, permiso, vehiculo_id } = req.body || {};

  // Validar nombre
  const nombreVal = validators.nonEmptyString(nombre, 'Nombre', 100);
  if (!nombreVal.valid) {
    return res.status(400).json({ error: nombreVal.error });
  }

  // Validar permiso (opcional, default B)
  let permisoFinal = 'B';
  if (permiso) {
    const permisoVal = validators.permiso(permiso);
    if (!permisoVal.valid) {
      return res.status(400).json({ error: permisoVal.error });
    }
    permisoFinal = permisoVal.value;
  }

  // Validar vehiculo_id (opcional)
  let vehiculoIdFinal = null;
  if (vehiculo_id !== null && vehiculo_id !== undefined && vehiculo_id !== '') {
    const vidVal = validators.positiveInt(vehiculo_id, 'vehiculo_id');
    if (!vidVal.valid) {
      return res.status(400).json({ error: vidVal.error });
    }
    vehiculoIdFinal = vidVal.value;

    // Verificar que el vehículo existe
    const { data: vehiculo, error: errV } = await supabase
      .from('vehiculos')
      .select('id')
      .eq('id', vehiculoIdFinal)
      .eq('deleted', false)
      .single();
    
    if (errV || !vehiculo) {
      return res.status(400).json({ error: 'El vehículo especificado no existe' });
    }
  }

  // Insertar alumno (Supabase genera el ID automáticamente si la tabla tiene SERIAL)
  const { data: newAlumno, error: errInsert } = await supabase
    .from('alumnos')
    .insert({
      nombre: nombreVal.value,
      permiso: permisoFinal,
      vehiculo_id: vehiculoIdFinal,
      updated_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (errInsert) {
    console.error('Error insertando alumno:', errInsert);
    return res.status(500).json({ error: 'Error al crear el alumno: ' + errInsert.message });
  }

  return res.status(200).json({
    ok: true,
    mensaje: `Alumno "${nombreVal.value}" creado correctamente`,
    alumno_id: newAlumno.id
  });
}
