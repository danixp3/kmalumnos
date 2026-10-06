// Jornada de un profesor: prácticas del día (hechas y en curso), prácticas de
// días anteriores que quedaron sin cerrar y reservas de la agenda. Solo lectura.
// La RLS de Supabase ya limita todo a la empresa del token.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, withRetry, handleSupabaseError,
  COLUMNAS_PRACTICA_BASE, COLUMNAS_PRACTICA_LISTA, conFallbackColumnas, kmDePractica, clasesDe,
  esErrorColumnaInexistente, traerTodo, nombreCompleto
} from '../../api/_utils.js';

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

  // Las consultas que no dependen unas de otras se lanzan a la vez (antes eran seis
  // viajes a la base de datos uno detrás de otro y «Hoy» tardaba varios segundos).
  const pedirPracticas = cond => conFallbackColumnas(conOpc => withRetry(() => cond(filtrarProfesor(supabase
    .from('practicas')
    .select(COLUMNAS_PRACTICA_BASE + (conOpc ? ', ' + COLUMNAS_PRACTICA_LISTA : ''))
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId)))));

  // Prácticas del día · sin cerrar de los últimos 7 días (solo si se mira el día de hoy) ·
  // reservas del día (agenda del profesor)
  const [{ res: rDia }, rPendiente, rReservas] = await Promise.all([
    pedirPracticas(q => q.eq('fecha', fecha).order('hora_inicio', { ascending: true, nullsFirst: false }).order('id')),
    fecha === hoyCliente
      ? pedirPracticas(q => q.eq('km_final', 0).gt('km_inicial', 0).lt('fecha', fecha).gte('fecha', sumarDias(fecha, -7)).order('fecha', { ascending: false }))
      : Promise.resolve(null),
    profesorId
      ? withRetry(() => supabase
        .from('reservas')
        .select('id, hora_inicio, duracion_min, estado, alumno_id, vehiculo_id, nota')
        .eq('profesor_id', profesorId)
        .eq('fecha', fecha)
        .eq('deleted', false)
        .neq('estado', 'cancelada')
        .order('hora_inicio'))
      : Promise.resolve(null)
  ]);
  if (handleSupabaseError(rDia.error, res, 'Error al obtener las prácticas de hoy')) return;
  const delDia = rDia.data || [];
  let sinCerrar = [];
  if (rPendiente) {
    if (handleSupabaseError(rPendiente.res.error, res, 'Error al obtener las prácticas sin cerrar')) return;
    sinCerrar = rPendiente.res.data || [];
  }
  let reservas = [];
  if (rReservas) {
    if (handleSupabaseError(rReservas.error, res, 'Error al obtener la agenda')) return;
    reservas = rReservas.data || [];
  }

  // Nombres de alumnos y vehículos (una consulta por tabla, sin N+1) y, para el nº de
  // clase, las prácticas de esos alumnos: las tres a la vez.
  const todas = [...delDia, ...sinCerrar];
  const alumnoIds = [...new Set([...todas.map(p => p.alumno_id), ...reservas.map(r => r.alumno_id)].filter(v => v != null))];
  const vehiculoIds = [...new Set([...todas.map(p => p.vehiculo_id), ...reservas.map(r => r.vehiculo_id)].filter(v => v != null))];
  let alumnosPorId = {}, vehiculosPorId = {}, totalesPorAlumno = {};
  const pedirAlumnos = async () => {
    let r = await supabase.from('alumnos').select('id, nombre, primer_apellido, segundo_apellido, clases_previas').in('id', alumnoIds);
    if (r.error && esErrorColumnaInexistente(r.error)) r = await supabase.from('alumnos').select('id, nombre').in('id', alumnoIds);
    return r;
  };
  // Nº de clase: clases previas (antes de usar la app) + prácticas anteriores + 1
  const pedirHistorial = async () => {
    const historial = cols => traerTodo(() => supabase
      .from('practicas').select(cols)
      .in('alumno_id', alumnoIds).eq('deleted', false).eq('empresa_id', auth.empresaId).order('id'));
    let r = await historial('id, alumno_id, fecha, hora_inicio, fraccion');
    if (r.error && esErrorColumnaInexistente(r.error)) r = await historial('id, alumno_id, fecha, hora_inicio');
    return r;
  };
  const [rAlumnos, rHistorial, rVehiculos] = await Promise.all([
    alumnoIds.length ? pedirAlumnos() : null,
    alumnoIds.length ? pedirHistorial() : null,
    vehiculoIds.length ? supabase.from('vehiculos').select('id, nombre, matricula').in('id', vehiculoIds) : null
  ]);
  if (rAlumnos) {
    if (handleSupabaseError(rAlumnos.error, res, 'Error al obtener los alumnos')) return;
    alumnosPorId = Object.fromEntries((rAlumnos.data || []).map(a => [a.id, a]));
    if (handleSupabaseError(rHistorial.error, res, 'Error al contar las prácticas')) return;
    for (const h of rHistorial.data || []) (totalesPorAlumno[h.alumno_id] ||= []).push(h);
  }
  if (rVehiculos) {
    if (handleSupabaseError(rVehiculos.error, res, 'Error al obtener los vehículos')) return;
    vehiculosPorId = Object.fromEntries((rVehiculos.data || []).map(v => [v.id, v]));
  }

  const claseN = p => {
    const lista = (totalesPorAlumno[p.alumno_id] || []).slice().sort((a, b) =>
      (a.fecha || '').localeCompare(b.fecha || '') || (a.hora_inicio || '').localeCompare(b.hora_inicio || '') || a.id - b.id);
    const i = lista.findIndex(x => x.id === p.id);
    const previas = (alumnosPorId[p.alumno_id] && alumnosPorId[p.alumno_id].clases_previas) || 0;
    // Las fracciones (¼ ½ ¾) suman lo que valen: tras 1 + ½ la siguiente es la 3.ª
    const hasta = i >= 0 ? lista.slice(0, i + 1) : [...lista, p];
    return Math.ceil(Number(previas) + hasta.reduce((n, x) => n + clasesDe(x), 0) - 1e-9);
  };
  const forma = p => ({
    id: p.id, fecha: p.fecha, alumno_id: p.alumno_id,
    alumno_nombre: alumnosPorId[p.alumno_id] ? nombreCompleto(alumnosPorId[p.alumno_id]) : '?',
    vehiculo_id: p.vehiculo_id,
    vehiculo_nombre: vehiculosPorId[p.vehiculo_id] ? vehiculosPorId[p.vehiculo_id].nombre : '?',
    matricula: vehiculosPorId[p.vehiculo_id] ? vehiculosPorId[p.vehiculo_id].matricula : null,
    hora_inicio: p.hora_inicio || null, hora_fin: p.hora_fin || null,
    km_inicial: p.km_inicial, km_final: p.km_final, km: kmDePractica(p),
    tipo: p.tipo || 'circulacion', tipo_detalle: p.tipo_detalle || null,
    nota: p.nota || '', trabajado: Array.isArray(p.trabajado) ? p.trabajado : [],
    zonas: Array.isArray(p.zonas) ? p.zonas : [],
    en_curso: p.km_inicial > 0 && !p.km_final && p.fecha === hoyCliente,
    sin_cerrar: p.km_inicial > 0 && !p.km_final && p.fecha < hoyCliente,
    firmada: !!p.firmada, clase_n: claseN(p), source: p.source || null, profesor_id: p.profesor_id || null,
    fraccion: clasesDe(p) < 1 ? clasesDe(p) : null
  });

  return res.status(200).json({
    ok: true, fecha,
    practicas: delDia.map(forma),
    sin_cerrar: sinCerrar.map(forma),
    reservas: reservas.map(r => ({
      id: r.id, hora_inicio: r.hora_inicio, duracion_min: r.duracion_min, estado: r.estado,
      alumno_id: r.alumno_id, alumno_nombre: alumnosPorId[r.alumno_id] ? nombreCompleto(alumnosPorId[r.alumno_id]) : null,
      vehiculo_id: r.vehiculo_id,
      vehiculo_nombre: vehiculosPorId[r.vehiculo_id] ? vehiculosPorId[r.vehiculo_id].nombre : null,
      matricula: vehiculosPorId[r.vehiculo_id] ? vehiculosPorId[r.vehiculo_id].matricula : null,
      nota: r.nota
    }))
  });
}
