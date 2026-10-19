import {
  setCorsHeaders, requireAuth, validators, getSupabase, withRetry, handleSupabaseError,
  COLUMNAS_PRACTICA_BASE, COLUMNAS_PRACTICA_LISTA, esErrorColumnaInexistente, clasesDe, traerTodo
} from './_utils.js';

// Ficha de un alumno para el móvil: datos básicos, totales, TODAS sus prácticas (de todos los
// profesores, con su nº de clase, hora, coche, profesor y si están firmadas; sin la imagen de la
// firma, que se pide en el detalle) y las próximas clases.
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
  const alumnoId = alumnoIdVal.value;
  const hoy = (req.query.hoy && /^\d{4}-\d{2}-\d{2}$/.test(req.query.hoy)) ? req.query.hoy : new Date().toISOString().slice(0, 10);

  // El alumno (con caídas por si faltan columnas de migraciones posteriores)
  const leerAlumno = async () => {
    const leer = cols => supabase.from('alumnos').select(cols)
      .eq('id', alumnoId).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
    const BASICO = 'id, nombre, permiso, vehiculo_id, profesor_id';
    const FICHA = BASICO + ', primer_apellido, segundo_apellido, estado, fecha_alta';
    for (const cols of [FICHA + ', clases_previas, km_previos, minutos_sobrantes, n_registro, procedencia',
      FICHA + ', clases_previas, km_previos, minutos_sobrantes', FICHA + ', clases_previas, km_previos', FICHA, BASICO]) {
      const r = await leer(cols);
      if (!(r.error && esErrorColumnaInexistente(r.error))) return r;
    }
    return leer(BASICO);
  };
  // Todas sus prácticas, paginadas (las traídas de otro programa pueden ser cientos)
  const leerPracticas = async () => {
    const pedir = cols => withRetry(() => traerTodo(() => supabase.from('practicas').select(cols)
      .eq('alumno_id', alumnoId).eq('deleted', false).eq('empresa_id', auth.empresaId).order('id')));
    for (const cols of [COLUMNAS_PRACTICA_BASE + ', ' + COLUMNAS_PRACTICA_LISTA + ', procedencia',
      COLUMNAS_PRACTICA_BASE + ', ' + COLUMNAS_PRACTICA_LISTA]) {
      const r = await pedir(cols);
      if (!(r.error && esErrorColumnaInexistente(r.error))) return r;
    }
    return pedir(COLUMNAS_PRACTICA_BASE);
  };

  // Todo a la vez: el móvil espera una sola vuelta
  const [rAlumno, rPracticas, rProfesores, rVehiculos, rReservas] = await Promise.all([
    leerAlumno(),
    leerPracticas(),
    withRetry(() => supabase.from('profesores').select('id, nombre').eq('deleted', false).eq('empresa_id', auth.empresaId)),
    withRetry(() => supabase.from('vehiculos').select('id, nombre, matricula').eq('deleted', false).eq('empresa_id', auth.empresaId)),
    withRetry(() => supabase.from('reservas').select('id, fecha, hora_inicio, estado, nota')
      .eq('alumno_id', alumnoId).eq('deleted', false)
      .neq('estado', 'cancelada').neq('estado', 'realizada')
      .gte('fecha', hoy).order('fecha').order('hora_inicio').limit(5))
  ]);
  if (handleSupabaseError(rAlumno.error, res, 'Error al obtener el alumno')) return;
  const alumno = rAlumno.data;
  if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
  if (handleSupabaseError(rPracticas.error, res, 'Error al obtener las prácticas')) return;
  if (handleSupabaseError(rProfesores.error, res, 'Error al obtener los profesores')) return;
  if (handleSupabaseError(rVehiculos.error, res, 'Error al obtener los vehículos')) return;
  const mapaProfesores = new Map((rProfesores.data || []).map(p => [p.id, p.nombre]));
  const mapaVehiculos = new Map((rVehiculos.data || []).map(v => [v.id, v]));
  const proximas = rReservas.error ? [] : (rReservas.data || []);

  // Nº de clase igual que el detalle y el escritorio: por fecha, hora e id, sumando lo que vale
  // cada una (¼ ½ ¾) a las clases hechas antes de usar la app.
  const orden = (rPracticas.data || []).slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') ||
    (a.hora_inicio || '').localeCompare(b.hora_inicio || '') || a.id - b.id);
  let llevadas = Number(alumno.clases_previas) || 0;
  const numero = new Map();
  for (const p of orden) { llevadas += clasesDe(p); numero.set(p.id, Math.max(1, Math.ceil(llevadas - 1e-9))); }

  const kmDe = p => (p.km_final > 0 ? Math.max(0, p.km_final - p.km_inicial) : 0);
  const porProfesor = new Map();
  const practicas = orden.reverse().map(p => {
    const v = mapaVehiculos.get(p.vehiculo_id);
    const pr = porProfesor.get(p.profesor_id || 0) || { profesor_id: p.profesor_id || null, nombre: p.profesor_id ? (mapaProfesores.get(p.profesor_id) || null) : null, clases: 0 };
    pr.clases += clasesDe(p); porProfesor.set(p.profesor_id || 0, pr);
    return {
      id: p.id,
      clase_n: numero.get(p.id),
      fecha: p.fecha,
      hora_inicio: p.hora_inicio || null,
      hora_fin: p.hora_fin || null,
      tipo: p.tipo || 'circulacion',
      tipo_detalle: p.tipo_detalle || null,
      km_inicial: p.km_inicial,
      km_final: p.km_final,
      km: kmDe(p),
      nota: p.nota || null,
      profesor_id: p.profesor_id,
      profesor_nombre: p.profesor_id ? (mapaProfesores.get(p.profesor_id) || null) : null,
      vehiculo_id: p.vehiculo_id,
      matricula: v ? v.matricula : null,
      vehiculo_nombre: v ? v.nombre : null,
      trabajado: Array.isArray(p.trabajado) ? p.trabajado : [],
      zonas: Array.isArray(p.zonas) ? p.zonas : [],
      firmada: !!p.firmada,
      fraccion: clasesDe(p) < 1 ? clasesDe(p) : null,
      procedencia: p.procedencia || null,
      source: p.source || null,
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
      clases_previas: Number(alumno.clases_previas) || 0, km_previos: Number(alumno.km_previos) || 0,
      minutos_sobrantes: Number(alumno.minutos_sobrantes) || 0,
      n_registro: alumno.n_registro || null, procedencia: alumno.procedencia || null
    },
    // Clases (las fracciones ¼ ½ ¾ suman lo que valen) y nº de prácticas
    total: practicas.reduce((n, p) => n + clasesDe(p), 0),
    n_practicas: practicas.length,
    km_totales: practicas.reduce((s, p) => s + p.km, 0),
    fechas: [...new Set(practicas.map(p => p.fecha))],
    // Clases con cada profesor (las de un profesor ya borrado o sin anotar, sin nombre)
    por_profesor: [...porProfesor.values()].sort((a, b) => b.clases - a.clases),
    practicas,
    proximas
  });
}
