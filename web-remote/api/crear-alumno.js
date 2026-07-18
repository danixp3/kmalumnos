import { setCorsHeaders, requireAuth, validators, getSupabase, handleSupabaseError } from './_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  const { nombre, permiso, vehiculo_id, profesor_id } = req.body || {};

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

  // Insertar alumno (Supabase genera el ID automáticamente si la tabla tiene SERIAL).
  // Si choca la clave primaria (23505) es que la secuencia de la nube se quedó
  // atrás (el escritorio sube ids propios): se realinea con el RPC
  // reparar_secuencias y se reintenta una vez.
  const nuevoAlumno = {
    nombre: nombreVal.value,
    permiso: permisoFinal,
    vehiculo_id: vehiculoIdFinal,
    profesor_id: profesorIdFinal,
    empresa_id: auth.empresaId,
    updated_at: new Date().toISOString()
  };
  let { data: newAlumno, error: errInsert } = await supabase
    .from('alumnos')
    .insert(nuevoAlumno)
    .select('id')
    .single();

  if (errInsert && errInsert.code === '23505') {
    await supabase.rpc('reparar_secuencias');
    ({ data: newAlumno, error: errInsert } = await supabase
      .from('alumnos')
      .insert(nuevoAlumno)
      .select('id')
      .single());
  }

  if (handleSupabaseError(errInsert, res, 'Error al crear el alumno')) return;

  return res.status(200).json({
    ok: true,
    mensaje: `Alumno "${nombreVal.value}" creado correctamente`,
    alumno_id: newAlumno.id
  });
}
