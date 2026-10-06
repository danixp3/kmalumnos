import { setCorsHeaders, requireAuth, validators, getSupabase, handleSupabaseError, cargarCobrosAlta, esErrorColumnaInexistente, traerTodo, siguienteNRegistro, limpiarDni, claveNombre, nombreCompleto } from './_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  const { nombre, primer_apellido, segundo_apellido, dni, telefono, permiso, vehiculo_id, profesor_id, hoy, forzar } = req.body || {};

  // Nombre y apellidos por separado, como en el escritorio (antes era una
  // sola casilla «Nombre y apellidos» y todo acababa en `nombre`)
  const nombreVal = validators.nonEmptyString(nombre, 'Nombre', 60);
  if (!nombreVal.valid) {
    return res.status(400).json({ error: nombreVal.error });
  }
  const texto = (v, max) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  const apellido1 = texto(primer_apellido, 60), apellido2 = texto(segundo_apellido, 60);
  const dniLimpio = limpiarDni(dni);
  if (dniLimpio && dniLimpio.length > 20) return res.status(400).json({ error: 'El DNI / NIE es demasiado largo' });
  const tel = texto(telefono, 20).replace(/[^\d+ ]/g, '').trim();

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

  // Alumnos de la autoescuela: para el siguiente nº de registro (el de la
  // numeración del programa anterior, si ya hay alguno; sin la columna, no se
  // pone) y para no dar de alta dos veces a la misma persona.
  let nRegistro = null, conNRegistro = true, existentes = [];
  {
    const leer = cols => traerTodo(() => supabase.from('alumnos')
      .select(cols).eq('empresa_id', auth.empresaId).eq('deleted', false).order('id'));
    let { data, error: errN } = await leer('id, nombre, primer_apellido, segundo_apellido, dni, permiso, n_registro');
    if (errN && esErrorColumnaInexistente(errN)) {
      conNRegistro = false;
      ({ data, error: errN } = await leer('id, nombre, primer_apellido, segundo_apellido, dni, permiso'));
      if (errN && esErrorColumnaInexistente(errN)) ({ data, error: errN } = await leer('id, nombre, permiso'));
    }
    if (!errN) { existentes = data || []; if (conNRegistro) nRegistro = siguienteNRegistro(existentes); }
  }

  // ¿Ya está? (mismo DNI, o mismo nombre y apellidos en cualquier orden, sin
  // tildes). Se avisa y solo se crea si se confirma que es otra persona (o
  // otro permiso de la misma, que va en un expediente aparte).
  if (forzar !== true) {
    const clave = claveNombre(nombreVal.value, apellido1, apellido2);
    const igual = (dniLimpio && existentes.find(a => limpiarDni(a.dni) === dniLimpio)) ||
      existentes.find(a => clave && claveNombre(a.nombre, a.primer_apellido, a.segundo_apellido) === clave);
    if (igual) {
      const porDni = !!(dniLimpio && limpiarDni(igual.dni) === dniLimpio);
      return res.status(409).json({
        codigo: 'posible_duplicado', por_dni: porDni,
        alumno: { id: igual.id, nombre: nombreCompleto(igual), dni: igual.dni || null, permiso: igual.permiso || null, n_registro: igual.n_registro || null },
        error: porDni ? `Ya hay un alumno con el DNI ${dniLimpio}: ${nombreCompleto(igual)}.` : `Ya hay un alumno que se llama ${nombreCompleto(igual)}.`
      });
    }
  }

  // Insertar alumno (Supabase genera el ID automáticamente si la tabla tiene SERIAL).
  // Si choca la clave primaria (23505) es que la secuencia de la nube se quedó
  // atrás (el escritorio sube ids propios): se realinea con el RPC
  // reparar_secuencias y se reintenta una vez.
  const nuevoAlumno = {
    nombre: nombreVal.value,
    primer_apellido: apellido1 || null,
    segundo_apellido: apellido2 || null,
    dni: dniLimpio || null,
    telefono: tel || null,
    permiso: permisoFinal,
    vehiculo_id: vehiculoIdFinal,
    profesor_id: profesorIdFinal,
    empresa_id: auth.empresaId,
    deleted: false,
    updated_at: new Date().toISOString(),
    ...(conNRegistro && nRegistro ? { n_registro: nRegistro } : {})
  };
  let { data: newAlumno, error: errInsert } = await supabase
    .from('alumnos')
    .insert(nuevoAlumno)
    .select('id')
    .single();

  // Base sin las columnas de la ficha (muy antigua): los apellidos van en el nombre
  if (errInsert && esErrorColumnaInexistente(errInsert)) {
    for (const k of ['primer_apellido', 'segundo_apellido', 'dni', 'telefono']) delete nuevoAlumno[k];
    nuevoAlumno.nombre = [nombreVal.value, apellido1, apellido2].filter(Boolean).join(' ');
    ({ data: newAlumno, error: errInsert } = await supabase.from('alumnos').insert(nuevoAlumno).select('id').single());
  }

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
    mensaje: `Alumno "${[nombreVal.value, apellido1, apellido2].filter(Boolean).join(' ')}" creado correctamente`,
    alumno_id: newAlumno.id,
    n_registro: nuevoAlumno.n_registro || null,
    vehiculo_id: vehiculoIdFinal,
    cobros_alta: cobros.cargados,
    ...(cobros.error ? { cobros_error: cobros.error } : {})
  });
}
