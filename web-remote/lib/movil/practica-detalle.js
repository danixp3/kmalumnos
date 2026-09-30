// Detalle de una práctica para la hoja del historial: todos sus datos, la
// imagen de la firma (prueba de que el alumno recibió la clase), el nº de
// clase del alumno y si todavía se puede cancelar desde la web.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, isAuthError, handleSupabaseError,
  COLUMNAS_PRACTICA_BASE, COLUMNAS_PRACTICA_MOVIL, conFallbackColumnas, kmDePractica, nombreCompleto
} from '../../api/_utils.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);

  const idVal = validators.positiveInt((req.query || {}).id, 'id');
  if (!idVal.valid) return res.status(400).json({ error: idVal.error });

  const { res: r } = await conFallbackColumnas(conOpc => supabase
    .from('practicas').select(COLUMNAS_PRACTICA_BASE + ', updated_at' + (conOpc ? ', ' + COLUMNAS_PRACTICA_MOVIL : ''))
    .eq('id', idVal.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle());
  if (r.error && isAuthError(r.error)) return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  if (handleSupabaseError(r.error, res, 'Error al obtener la práctica')) return;
  const p = r.data;
  if (!p) return res.status(404).json({ error: 'Práctica no encontrada' });

  let { data: alumno, error: errA } = await supabase.from('alumnos')
    .select('id, nombre, primer_apellido, segundo_apellido, permiso, clases_previas').eq('id', p.alumno_id).maybeSingle();
  if (errA) ({ data: alumno } = await supabase.from('alumnos').select('id, nombre, permiso').eq('id', p.alumno_id).maybeSingle());
  const { data: vehiculo } = await supabase.from('vehiculos').select('id, nombre, matricula').eq('id', p.vehiculo_id).maybeSingle();
  let profesor = null;
  if (p.profesor_id) ({ data: profesor } = await supabase.from('profesores').select('id, nombre').eq('id', p.profesor_id).maybeSingle());

  // Nº de clase: previas + posición entre las prácticas del alumno
  const { data: hist } = await supabase.from('practicas').select('id, fecha, hora_inicio')
    .eq('alumno_id', p.alumno_id).eq('deleted', false).eq('empresa_id', auth.empresaId);
  const orden = (hist || []).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') ||
    (a.hora_inicio || '').localeCompare(b.hora_inicio || '') || a.id - b.id);
  const pos = orden.findIndex(x => x.id === p.id);
  const claseN = ((alumno && alumno.clases_previas) || 0) + (pos >= 0 ? pos + 1 : orden.length);

  const cancelable = p.source === 'web-remote' && p.updated_at && (Date.now() - new Date(p.updated_at).getTime()) < 24 * 3600 * 1000;

  return res.status(200).json({
    ok: true,
    practica: {
      id: p.id, fecha: p.fecha, hora_inicio: p.hora_inicio || null, hora_fin: p.hora_fin || null,
      alumno_id: p.alumno_id, alumno_nombre: alumno ? nombreCompleto(alumno) : '?', permiso: alumno ? alumno.permiso : null,
      vehiculo_id: p.vehiculo_id, vehiculo_nombre: vehiculo ? vehiculo.nombre : null, matricula: vehiculo ? vehiculo.matricula : null,
      profesor_id: p.profesor_id, profesor_nombre: profesor ? profesor.nombre : null,
      km_inicial: p.km_inicial, km_final: p.km_final, km: kmDePractica(p), clase_n: claseN,
      tipo: p.tipo || 'circulacion', tipo_detalle: p.tipo_detalle || null,
      zonas: Array.isArray(p.zonas) ? p.zonas : [], trabajado: Array.isArray(p.trabajado) ? p.trabajado : [],
      nota: p.nota || '', firma: p.firma || null, source: p.source || null, cancelable: !!cancelable
    }
  });
}
