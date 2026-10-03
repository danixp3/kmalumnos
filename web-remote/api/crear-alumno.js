import { setCorsHeaders, requireAuth, validators, getSupabase, handleSupabaseError, cargarCobrosAlta, esErrorColumnaInexistente, traerTodo, siguienteNRegistro } from './_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  const { nombre, permiso, vehiculo_id, profesor_id, hoy } = req.body || {};

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

    let { data: profesor, error: errP } = await supabase
      .from('profesores')
      .select('id, vehiculo_id')
      .eq('id', profesorIdFinal)
      .eq('deleted', false)
      .eq('empresa_id', auth.empresaId)
      .single();
    // Sin la columna del coche habitual (migración 2026-10-03 sin aplicar)
    if (errP && esErrorColumnaInexistente(errP)) {
      ({ data: profesor, error: errP } = await supabase.from('profesores').select('id')
        .eq('id', profesorIdFinal).eq('deleted', false).eq('empresa_id', auth.empresaId).single());
    }

    if (errP || !profesor) {
      return res.status(400).json({ error: 'El profesor especificado no existe' });
    }
    // Sin coche elegido: el coche habitual de su profesor
    if (!vehiculoIdFinal && profesor.vehiculo_id) {
      const { data: coche } = await supabase.from('vehiculos').select('id')
        .eq('id', profesor.vehiculo_id).eq('deleted', false).neq('activo', false).maybeSingle();
      if (coche) vehiculoIdFinal = coche.id;
    }
  }

  // Nº de registro: el siguiente de la numeración del programa anterior (si
  // ya hay alguno; si no, se deja vacío). Sin la columna, no se pone.
  let nRegistro = null, conNRegistro = true;
  {
    const { data: numeros, error: errN } = await traerTodo(() => supabase.from('alumnos')
      .select('id, n_registro').eq('empresa_id', auth.empresaId).eq('deleted', false).order('id'));
    if (errN && esErrorColumnaInexistente(errN)) conNRegistro = false;
    else if (!errN) nRegistro = siguienteNRegistro(numeros);
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
    updated_at: new Date().toISOString(),
    ...(conNRegistro && nRegistro ? { n_registro: nRegistro } : {})
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

  // Matrícula y demás conceptos «al dar de alta» (Ajustes → Cobros). Si no se
  // pueden anotar, el alumno queda creado igual y se avisa.
  const fechaHoy = validators.fecha(hoy).valid ? hoy : new Date().toISOString().slice(0, 10);
  let cobros = { cargados: [] };
  try { cobros = await cargarCobrosAlta(supabase, auth.empresaId, newAlumno.id, fechaHoy); }
  catch (e) { cobros = { cargados: [], error: e.message }; }

  return res.status(200).json({
    ok: true,
    mensaje: `Alumno "${nombreVal.value}" creado correctamente`,
    alumno_id: newAlumno.id,
    n_registro: nuevoAlumno.n_registro || null,
    vehiculo_id: vehiculoIdFinal,
    cobros_alta: cobros.cargados,
    ...(cobros.error ? { cobros_error: cobros.error } : {})
  });
}
