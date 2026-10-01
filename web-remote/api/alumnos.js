import { setCorsHeaders, requireAuth, getSupabase, withRetry, handleSupabaseError, esErrorColumnaInexistente, traerTodo, clasesDe } from './_utils.js';

// Lista de alumnos de la empresa. Con ?resumen=1 añade a cada alumno el nº de
// clases, los km totales y la fecha de su última práctica (para la pantalla
// «Alumnos» del móvil). `clases_previas`/`km_previos` = punto de partida
// (lo hecho antes de usar la app); la web los suma a la numeración y totales.
export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase(auth.token);

  const consulta = cols => withRetry(() => supabase
    .from('alumnos')
    .select(cols)
    .eq('deleted', false)
    .eq('empresa_id', auth.empresaId)
    .order('nombre'));

  // Columnas de la ficha ampliada (existen en producción; si faltan, se cae al
  // básico). minutos_sobrantes: lo acumulado de clases por minutos (migración 2026-10-02).
  const COLS = 'id, nombre, permiso, vehiculo_id, profesor_id, primer_apellido, segundo_apellido, estado, fecha_alta, clases_previas, km_previos';
  let { data, error } = await consulta(COLS + ', minutos_sobrantes');
  if (error && esErrorColumnaInexistente(error)) ({ data, error } = await consulta(COLS));
  if (error && esErrorColumnaInexistente(error)) {
    ({ data, error } = await consulta('id, nombre, permiso, vehiculo_id, profesor_id, primer_apellido, segundo_apellido, estado, fecha_alta'));
  }
  if (error && esErrorColumnaInexistente(error)) {
    ({ data, error } = await consulta('id, nombre, permiso, vehiculo_id, profesor_id'));
  }
  if (handleSupabaseError(error, res, 'Error al obtener alumnos')) return;
  let alumnos = data || [];

  if (req.query && req.query.resumen && alumnos.length) {
    // Paginado: PostgREST corta en 1.000 filas y antes los recuentos salían
    // mal en cuanto la empresa pasaba de 1.000 prácticas.
    const practicas = cols => traerTodo(() => supabase
      .from('practicas')
      .select(cols)
      .eq('deleted', false).eq('empresa_id', auth.empresaId)
      .order('id'));
    let { data: prs, error: errP } = await practicas('id, alumno_id, fecha, km_inicial, km_final, fraccion');
    if (errP && esErrorColumnaInexistente(errP)) ({ data: prs, error: errP } = await practicas('id, alumno_id, fecha, km_inicial, km_final'));
    if (handleSupabaseError(errP, res, 'Error al resumir las prácticas')) return;
    const resumen = {};
    for (const p of prs || []) {
      const r = (resumen[p.alumno_id] ||= { clases: 0, km: 0, ultima: null });
      r.clases += clasesDe(p);
      if (p.km_final > 0) r.km += Math.max(0, p.km_final - p.km_inicial);
      if (!r.ultima || p.fecha > r.ultima) r.ultima = p.fecha;
    }
    alumnos = alumnos.map(a => ({
      ...a,
      clases: (resumen[a.id] || {}).clases || 0,
      km: (resumen[a.id] || {}).km || 0,
      ultima_fecha: (resumen[a.id] || {}).ultima || null
    }));
  }

  res.json(alumnos);
}
