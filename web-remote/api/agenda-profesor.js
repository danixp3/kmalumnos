import { setCorsHeaders, requireAuth, validators, getSupabase, withRetry, handleSupabaseError } from './_utils.js';

// Agenda del día de un profesor (solo lectura): reservas de la fecha indicada,
// con nombre de alumno y vehículo/matrícula resueltos aparte (reservas no
// tiene claves foráneas). La RLS de Supabase ya limita a la empresa del token.
export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  const { profesor_id, fecha } = req.query || {};

  const profesorIdVal = validators.positiveInt(profesor_id, 'profesor_id');
  if (!profesorIdVal.valid) {
    return res.status(400).json({ error: profesorIdVal.error });
  }

  // No usamos validators.fecha: esa rechaza fechas futuras y de hace más de
  // 30 días, pero la agenda necesita poder mirar hoy y días futuros. Aquí
  // solo comprobamos formato y que sea una fecha real.
  if (!fecha || typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Formato de fecha inválido (usar YYYY-MM-DD)' });
  }
  if (isNaN(new Date(fecha).getTime())) {
    return res.status(400).json({ error: 'Fecha no válida' });
  }

  const { data: reservas, error } = await withRetry(() => supabase
    .from('reservas')
    .select('id, hora_inicio, duracion_min, estado, alumno_id, vehiculo_id, nota')
    .eq('profesor_id', profesorIdVal.value)
    .eq('fecha', fecha)
    .eq('deleted', false)
    .neq('estado', 'cancelada')
    .order('hora_inicio'));

  if (handleSupabaseError(error, res, 'Error al obtener la agenda')) return;

  const lista = reservas || [];

  const alumnoIds = [...new Set(lista.map(r => r.alumno_id).filter(id => id !== null && id !== undefined))];
  const vehiculoIds = [...new Set(lista.map(r => r.vehiculo_id).filter(id => id !== null && id !== undefined))];

  let alumnosPorId = {};
  if (alumnoIds.length) {
    const { data: alumnosData, error: errAlumnos } = await supabase
      .from('alumnos')
      .select('id, nombre')
      .in('id', alumnoIds);
    if (handleSupabaseError(errAlumnos, res, 'Error al obtener los alumnos')) return;
    alumnosPorId = Object.fromEntries((alumnosData || []).map(a => [a.id, a]));
  }

  let vehiculosPorId = {};
  if (vehiculoIds.length) {
    const { data: vehiculosData, error: errVehiculos } = await supabase
      .from('vehiculos')
      .select('id, nombre, matricula')
      .in('id', vehiculoIds);
    if (handleSupabaseError(errVehiculos, res, 'Error al obtener los vehículos')) return;
    vehiculosPorId = Object.fromEntries((vehiculosData || []).map(v => [v.id, v]));
  }

  const resultado = lista.map(r => {
    const alumno = alumnosPorId[r.alumno_id];
    const vehiculo = vehiculosPorId[r.vehiculo_id];
    return {
      id: r.id,
      hora_inicio: r.hora_inicio,
      duracion_min: r.duracion_min,
      estado: r.estado,
      alumno_id: r.alumno_id,
      alumno_nombre: alumno ? alumno.nombre : null,
      vehiculo_nombre: vehiculo ? vehiculo.nombre : null,
      matricula: vehiculo ? vehiculo.matricula : null,
      nota: r.nota
    };
  });

  return res.status(200).json({ reservas: resultado });
}
