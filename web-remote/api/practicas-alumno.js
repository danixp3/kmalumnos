import { setCorsHeaders, requireAuth, validators, getSupabase, withRetry, handleSupabaseError } from './_utils.js';

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
  const { data: alumno, error: errAlumno } = await supabase
    .from('alumnos')
    .select('id, nombre')
    .eq('id', alumnoIdVal.value)
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId)
    .maybeSingle();

  if (handleSupabaseError(errAlumno, res, 'Error al obtener el alumno')) return;
  if (!alumno) {
    return res.status(404).json({ error: 'Alumno no encontrado' });
  }

  // Total de prácticas no borradas del alumno (no solo las que se devuelven)
  const { count, error: errCount } = await withRetry(() => supabase
    .from('practicas')
    .select('id', { count: 'exact', head: true })
    .eq('alumno_id', alumnoIdVal.value)
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId));

  if (handleSupabaseError(errCount, res, 'Error al contar las prácticas')) return;

  // Últimas 50 prácticas del alumno
  const { data: practicas, error: errPracticas } = await withRetry(() => supabase
    .from('practicas')
    .select('fecha, tipo, km_inicial, km_final, nota, profesor_id')
    .eq('alumno_id', alumnoIdVal.value)
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId)
    .order('fecha', { ascending: false })
    .limit(50));

  if (handleSupabaseError(errPracticas, res, 'Error al obtener las prácticas')) return;

  // Resolver nombres de profesor en una sola consulta (sin N+1)
  const { data: profesores, error: errProfesores } = await withRetry(() => supabase
    .from('profesores')
    .select('id, nombre')
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId));

  if (handleSupabaseError(errProfesores, res, 'Error al obtener los profesores')) return;

  const mapaProfesores = new Map((profesores || []).map(p => [p.id, p.nombre]));

  const practicasFormateadas = (practicas || []).map(p => ({
    fecha: p.fecha,
    tipo: p.tipo || 'circulacion',
    km_inicial: p.km_inicial,
    km_final: p.km_final,
    nota: p.nota || null,
    profesor_id: p.profesor_id,
    profesor_nombre: p.profesor_id ? (mapaProfesores.get(p.profesor_id) || null) : null
  }));

  res.status(200).json({
    ok: true,
    alumno: { id: alumno.id, nombre: alumno.nombre },
    total: count || 0,
    practicas: practicasFormateadas
  });
}
