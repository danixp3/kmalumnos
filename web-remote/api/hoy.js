// Jornada de un profesor: prácticas del día (hechas y en curso), prácticas de
// días anteriores que quedaron sin cerrar y reservas de la agenda. Solo lectura.
// La RLS de Supabase ya limita todo a la empresa del token.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, withRetry, handleSupabaseError,
  COLUMNAS_PRACTICA_BASE, COLUMNAS_PRACTICA_MOVIL, conFallbackColumnas, kmDePractica
} from './_utils.js';

const fechaOk = f => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f).getTime());

function sumarDias(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { fecha, hoy, profesor_id } = req.query || {};
  if (!fechaOk(fecha)) return res.status(400).json({ error: 'Formato de fecha inválido (usar YYYY-MM-DD)' });
  const hoyCliente = fechaOk(hoy) ? hoy : fecha;

  let profesorId = null;
  if (profesor_id !== undefined && profesor_id !== null && profesor_id !== '' && profesor_id !== 'null') {
    const v = validators.positiveInt(profesor_id, 'profesor_id');
    if (!v.valid) return res.status(400).json({ error: v.error });
    profesorId = v.value;
  }

  const filtrarProfesor = q => (profesorId ? q.eq('profesor_id', profesorId) : q);

  // Prácticas del día
  const { res: rDia } = await conFallbackColumnas(conOpc => withRetry(() => filtrarProfesor(supabase
    .from('practicas')
    .select(COLUMNAS_PRACTICA_BASE + (conOpc ? ', ' + COLUMNAS_PRACTICA_MOVIL : ''))
    .eq('fecha', fecha)
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId))
    .order('hora_inicio', { ascending: true, nullsFirst: false })
    .order('id')));
  if (handleSupabaseError(rDia.error, res, 'Error al obtener las prácticas de hoy')) return;
  const delDia = rDia.data || [];

  // Sin cerrar de los últimos 7 días (solo si se mira el día de hoy)
  let sinCerrar = [];
  if (fecha === hoyCliente) {
    const { res: rPend } = await conFallbackColumnas(conOpc => withRetry(() => filtrarProfesor(supabase
      .from('practicas')
      .select(COLUMNAS_PRACTICA_BASE + (conOpc ? ', ' + COLUMNAS_PRACTICA_MOVIL : ''))
      .eq('deleted', false)
      .eq('empresa_id', auth.empresaId)
      .eq('km_final', 0)
      .gt('km_inicial', 0)
      .lt('fecha', fecha)
      .gte('fecha', sumarDias(fecha, -7)))
      .order('fecha', { ascending: false })));
    if (handleSupabaseError(rPend.error, res, 'Error al obtener las prácticas sin cerrar')) return;
    sinCerrar = rPend.data || [];
  }

  // Reservas del día (agenda del profesor)
  let reservas = [];
  if (profesorId) {
    const { data: rs, error: errR } = await withRetry(() => supabase
      .from('reservas')
      .select('id, hora_inicio, duracion_min, estado, alumno_id, vehiculo_id, nota')
      .eq('profesor_id', profesorId)
      .eq('fecha', fecha)
      .eq('deleted', false)
      .neq('estado', 'cancelada')
      .order('hora_inicio'));
    if (handleSupabaseError(errR, res, 'Error al obtener la agenda')) return;
    reservas = rs || [];
  }

  // Nombres de alumnos y vehículos (una consulta por tabla, sin N+1)
  const todas = [...delDia, ...sinCerrar];
  const alumnoIds = [...new Set([...todas.map(p => p.alumno_id), ...reservas.map(r => r.alumno_id)].filter(v => v != null))];
  const vehiculoIds = [...new Set([...todas.map(p => p.vehiculo_id), ...reservas.map(r => r.vehiculo_id)].filter(v => v != null))];
  let alumnosPorId = {}, vehiculosPorId = {}, totalesPorAlumno = {};
  if (alumnoIds.length) {
    const { data, error } = await supabase.from('alumnos').select('id, nombre').in('id', alumnoIds);
    if (handleSupabaseError(error, res, 'Error al obtener los alumnos')) return;
    alumnosPorId = Object.fromEntries((data || []).map(a => [a.id, a]));
    // Nº de clase: prácticas anteriores del alumno + 1
    const { data: hist, error: errH } = await supabase
      .from('practicas').select('id, alumno_id, fecha, hora_inicio')
      .in('alumno_id', alumnoIds).eq('deleted', false).eq('empresa_id', auth.empresaId);
    if (handleSupabaseError(errH, res, 'Error al contar las prácticas')) return;
    for (const h of hist || []) (totalesPorAlumno[h.alumno_id] ||= []).push(h);
  }
  if (vehiculoIds.length) {
    const { data, error } = await supabase.from('vehiculos').select('id, nombre, matricula').in('id', vehiculoIds);
    if (handleSupabaseError(error, res, 'Error al obtener los vehículos')) return;
    vehiculosPorId = Object.fromEntries((data || []).map(v => [v.id, v]));
  }

  const claseN = p => {
    const lista = (totalesPorAlumno[p.alumno_id] || []).slice().sort((a, b) =>
      (a.fecha || '').localeCompare(b.fecha || '') || (a.hora_inicio || '').localeCompare(b.hora_inicio || '') || a.id - b.id);
    const i = lista.findIndex(x => x.id === p.id);
    return i >= 0 ? i + 1 : lista.length + 1;
  };
  const forma = p => ({
    id: p.id, fecha: p.fecha, alumno_id: p.alumno_id,
    alumno_nombre: alumnosPorId[p.alumno_id] ? alumnosPorId[p.alumno_id].nombre : '?',
    vehiculo_id: p.vehiculo_id,
    vehiculo_nombre: vehiculosPorId[p.vehiculo_id] ? vehiculosPorId[p.vehiculo_id].nombre : '?',
    matricula: vehiculosPorId[p.vehiculo_id] ? vehiculosPorId[p.vehiculo_id].matricula : null,
    hora_inicio: p.hora_inicio || null, hora_fin: p.hora_fin || null,
    km_inicial: p.km_inicial, km_final: p.km_final, km: kmDePractica(p),
    tipo: p.tipo || 'circulacion', tipo_detalle: p.tipo_detalle || null,
    nota: p.nota || '', trabajado: Array.isArray(p.trabajado) ? p.trabajado : [],
    en_curso: p.km_inicial > 0 && !p.km_final && p.fecha === hoyCliente,
    sin_cerrar: p.km_inicial > 0 && !p.km_final && p.fecha < hoyCliente,
    firmada: !!p.firma, clase_n: claseN(p), source: p.source || null
  });

  return res.status(200).json({
    ok: true, fecha,
    practicas: delDia.map(forma),
    sin_cerrar: sinCerrar.map(forma),
    reservas: reservas.map(r => ({
      id: r.id, hora_inicio: r.hora_inicio, duracion_min: r.duracion_min, estado: r.estado,
      alumno_id: r.alumno_id, alumno_nombre: alumnosPorId[r.alumno_id] ? alumnosPorId[r.alumno_id].nombre : null,
      vehiculo_id: r.vehiculo_id,
      vehiculo_nombre: vehiculosPorId[r.vehiculo_id] ? vehiculosPorId[r.vehiculo_id].nombre : null,
      matricula: vehiculosPorId[r.vehiculo_id] ? vehiculosPorId[r.vehiculo_id].matricula : null,
      nota: r.nota
    }))
  });
}
