import {
  setCorsHeaders, requireAuth, validators, getSupabase, withRetry, handleSupabaseError,
  conFallbackColumnas, COLUMNAS_PRACTICA_BASE, COLUMNAS_PRACTICA_LISTA, esErrorColumnaInexistente, clasesDe
} from './_utils.js';

// Ficha de un alumno para el móvil: datos básicos, totales y sus últimas
// prácticas (con hora, matrícula y si están firmadas), más las próximas clases.
export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  const alumnoIdVal = validators.positiveInt(req.query.alumno_id, 'alumno_id');
  if (!alumnoIdVal.valid) {
    return res.status(400).json({ error: alumnoIdVal.error });
  }

  // Verificar que el alumno existe, no está borrado y pertenece a la empresa
  // minutos_sobrantes: lo acumulado de clases por minutos (migración 2026-10-02)
  const leerAlumno = cols => supabase.from('alumnos').select(cols)
    .eq('id', alumnoIdVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  const COLS = 'id, nombre, permiso, vehiculo_id, profesor_id, primer_apellido, segundo_apellido, estado, fecha_alta, clases_previas, km_previos';
  let { data: alumno, error: errAlumno } = await leerAlumno(COLS + ', minutos_sobrantes');
  if (errAlumno && esErrorColumnaInexistente(errAlumno)) ({ data: alumno, error: errAlumno } = await leerAlumno(COLS));
  if (errAlumno && esErrorColumnaInexistente(errAlumno)) {
    ({ data: alumno, error: errAlumno } = await supabase
      .from('alumnos').select('id, nombre, permiso, vehiculo_id, profesor_id, primer_apellido, segundo_apellido, estado, fecha_alta')
      .eq('id', alumnoIdVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle());
  }
  if (errAlumno && esErrorColumnaInexistente(errAlumno)) {
    ({ data: alumno, error: errAlumno } = await supabase
      .from('alumnos').select('id, nombre, permiso, vehiculo_id, profesor_id')
      .eq('id', alumnoIdVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle());
  }
  if (handleSupabaseError(errAlumno, res, 'Error al obtener el alumno')) return;
  if (!alumno) {
    return res.status(404).json({ error: 'Alumno no encontrado' });
  }

  // Todas las prácticas del alumno (para totales y calendario); las 50 últimas se devuelven en detalle
  const { res: rTodas } = await conFallbackColumnas(conOpc => withRetry(() => supabase
    .from('practicas')
    .select(COLUMNAS_PRACTICA_BASE + (conOpc ? ', ' + COLUMNAS_PRACTICA_LISTA : ''))
    .eq('alumno_id', alumnoIdVal.value)
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .limit(500)));
  if (handleSupabaseError(rTodas.error, res, 'Error al obtener las prácticas')) return;
  const todas = rTodas.data || [];

  // Resolver nombres de profesor y vehículo en una sola consulta cada uno (sin N+1)
  const { data: profesores, error: errProfesores } = await withRetry(() => supabase
    .from('profesores')
    .select('id, nombre')
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId));
  if (handleSupabaseError(errProfesores, res, 'Error al obtener los profesores')) return;
  const mapaProfesores = new Map((profesores || []).map(p => [p.id, p.nombre]));

  const { data: vehiculos, error: errVeh } = await withRetry(() => supabase
    .from('vehiculos').select('id, nombre, matricula')
    .eq('deleted', false).eq('empresa_id', auth.empresaId));
  if (handleSupabaseError(errVeh, res, 'Error al obtener los vehículos')) return;
  const mapaVehiculos = new Map((vehiculos || []).map(v => [v.id, v]));

  // Próximas clases (reservas vigentes del alumno)
  const hoy = (req.query.hoy && /^\d{4}-\d{2}-\d{2}$/.test(req.query.hoy)) ? req.query.hoy : new Date().toISOString().slice(0, 10);
  let proximas = [];
  const { data: rs, error: errRs } = await withRetry(() => supabase
    .from('reservas').select('id, fecha, hora_inicio, estado, nota')
    .eq('alumno_id', alumnoIdVal.value).eq('deleted', false)
    .neq('estado', 'cancelada').neq('estado', 'realizada')
    .gte('fecha', hoy).order('fecha').order('hora_inicio').limit(5));
  if (!errRs) proximas = rs || [];

  const kmDe = p => (p.km_final > 0 ? Math.max(0, p.km_final - p.km_inicial) : 0);
  const kmTotales = todas.reduce((s, p) => s + kmDe(p), 0);

  const practicasFormateadas = todas.slice(0, 50).map(p => {
    const v = mapaVehiculos.get(p.vehiculo_id);
    return {
      id: p.id,
      fecha: p.fecha,
      hora_inicio: p.hora_inicio || null,
      tipo: p.tipo || 'circulacion',
      tipo_detalle: p.tipo_detalle || null,
      km_inicial: p.km_inicial,
      km_final: p.km_final,
      nota: p.nota || null,
      profesor_id: p.profesor_id,
      profesor_nombre: p.profesor_id ? (mapaProfesores.get(p.profesor_id) || null) : null,
      matricula: v ? v.matricula : null,
      vehiculo_nombre: v ? v.nombre : null,
      trabajado: Array.isArray(p.trabajado) ? p.trabajado : [],
      zonas: Array.isArray(p.zonas) ? p.zonas : [],
      firmada: !!p.firmada,
      fraccion: clasesDe(p) < 1 ? clasesDe(p) : null,
      sin_cerrar: p.km_inicial > 0 && !p.km_final && p.fecha < hoy,
      en_curso: p.km_inicial > 0 && !p.km_final && p.fecha === hoy
    };
  });

  res.status(200).json({
    ok: true,
    alumno: {
      id: alumno.id, nombre: alumno.nombre, permiso: alumno.permiso,
      vehiculo_id: alumno.vehiculo_id, profesor_id: alumno.profesor_id,
      profesor_nombre: alumno.profesor_id ? (mapaProfesores.get(alumno.profesor_id) || null) : null,
      primer_apellido: alumno.primer_apellido || null, segundo_apellido: alumno.segundo_apellido || null,
      estado: alumno.estado || null, fecha_alta: alumno.fecha_alta || null,
      clases_previas: alumno.clases_previas || 0, km_previos: alumno.km_previos || 0,
      minutos_sobrantes: Number(alumno.minutos_sobrantes) || 0
    },
    // Clases (las fracciones ¼ ½ ¾ suman lo que valen) y nº de prácticas
    total: todas.reduce((n, p) => n + clasesDe(p), 0),
    n_practicas: todas.length,
    km_totales: kmTotales,
    fechas: [...new Set(todas.map(p => p.fecha))],
    practicas: practicasFormateadas,
    proximas
  });
}
