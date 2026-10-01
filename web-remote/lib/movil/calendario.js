// Historial en calendario: todas las prácticas de un rango de fechas (un mes
// visible, como mucho 62 días), opcionalmente solo las de un profesor. No
// descarga las firmas: `firmada` viene de la columna generada. Solo lectura.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, handleSupabaseError,
  COLUMNAS_PRACTICA_BASE, COLUMNAS_PRACTICA_LISTA, conFallbackColumnas, kmDePractica,
  traerTodo, nombreCompleto
} from '../../api/_utils.js';

const fechaOk = f => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + 'T00:00:00Z').getTime());
const MAX_DIAS = 62;

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const { desde, hasta, hoy, profesor_id } = req.query || {};
  if (!fechaOk(desde) || !fechaOk(hasta) || desde > hasta) {
    return res.status(400).json({ error: 'Rango de fechas inválido (desde/hasta en YYYY-MM-DD)' });
  }
  const dias = (new Date(hasta + 'T00:00:00Z') - new Date(desde + 'T00:00:00Z')) / 86400000;
  if (dias > MAX_DIAS) return res.status(400).json({ error: `Como mucho ${MAX_DIAS} días por consulta` });
  const hoyCliente = fechaOk(hoy) ? hoy : null;

  let profesorId = null;
  if (profesor_id !== undefined && profesor_id !== null && profesor_id !== '' && profesor_id !== 'null') {
    const v = validators.positiveInt(profesor_id, 'profesor_id');
    if (!v.valid) return res.status(400).json({ error: v.error });
    profesorId = v.value;
  }

  const { res: r } = await conFallbackColumnas(conOpc => traerTodo(() => {
    let q = supabase.from('practicas')
      .select(COLUMNAS_PRACTICA_BASE + (conOpc ? ', ' + COLUMNAS_PRACTICA_LISTA : ''))
      .eq('deleted', false).eq('empresa_id', auth.empresaId)
      .gte('fecha', desde).lte('fecha', hasta);
    if (profesorId) q = q.eq('profesor_id', profesorId);
    return q.order('fecha', { ascending: true }).order('hora_inicio', { ascending: true, nullsFirst: false }).order('id', { ascending: true });
  }));
  if (handleSupabaseError(r.error, res, 'Error al obtener el historial')) return;
  const practicas = r.data || [];

  const alumnoIds = [...new Set(practicas.map(p => p.alumno_id).filter(v => v != null))];
  const vehiculoIds = [...new Set(practicas.map(p => p.vehiculo_id).filter(v => v != null))];
  let alumnos = {}, vehiculos = {};
  if (alumnoIds.length) {
    const { data, error } = await supabase.from('alumnos').select('id, nombre, primer_apellido, segundo_apellido').in('id', alumnoIds);
    const filas = error ? ((await supabase.from('alumnos').select('id, nombre').in('id', alumnoIds)).data || []) : (data || []);
    alumnos = Object.fromEntries(filas.map(a => [a.id, a]));
  }
  if (vehiculoIds.length) {
    const { data } = await supabase.from('vehiculos').select('id, nombre, matricula').in('id', vehiculoIds);
    vehiculos = Object.fromEntries((data || []).map(v => [v.id, v]));
  }

  return res.status(200).json({
    ok: true, desde, hasta,
    practicas: practicas.map(p => ({
      id: p.id, fecha: p.fecha, hora_inicio: p.hora_inicio || null, hora_fin: p.hora_fin || null,
      alumno_id: p.alumno_id, alumno_nombre: alumnos[p.alumno_id] ? nombreCompleto(alumnos[p.alumno_id]) : '?',
      vehiculo_id: p.vehiculo_id, matricula: vehiculos[p.vehiculo_id] ? vehiculos[p.vehiculo_id].matricula : null,
      vehiculo_nombre: vehiculos[p.vehiculo_id] ? vehiculos[p.vehiculo_id].nombre : null,
      profesor_id: p.profesor_id, km_inicial: p.km_inicial, km_final: p.km_final, km: kmDePractica(p),
      zonas: Array.isArray(p.zonas) ? p.zonas : [], firmada: !!p.firmada, source: p.source || null,
      fraccion: Number(p.fraccion) > 0 && Number(p.fraccion) < 1 ? Number(p.fraccion) : null,
      en_curso: !!hoyCliente && p.km_inicial > 0 && !p.km_final && p.fecha === hoyCliente,
      sin_cerrar: !!hoyCliente && p.km_inicial > 0 && !p.km_final && p.fecha < hoyCliente
    }))
  });
}
