// Exámenes anotados desde el móvil (2026-11-06). El profesor anota el examen de su alumno
// cuando lo hace; el escritorio lo recibe con el sync (tabla `presentaciones`, migración
// 2026-11-06_examenes.sql) y lo ve en Agenda → Exámenes.
//
//   GET  /api/examenes?alumno_id=&desde=&hasta=&hoy=   Exámenes (por defecto: los próximos y los de los
//                                                      últimos 90 días). Con alumno_id, TODOS los de ese alumno.
//   POST /api/examenes { accion: 'crear', alumno_id, tipo, fecha, resultado, profesor_id, n_convocatoria?,
//                        nota?, examinador?, fallos?, fallos_detalle?, permiso?, forzar? }
//   POST /api/examenes { accion: 'editar', id, resultado?, fecha?, nota?, examinador?, fallos?, fallos_detalle?, n_convocatoria? }
//   POST /api/examenes { accion: 'borrar', id }        (solo los anotados desde el móvil; borrado suave)
//
// Idempotente: repetir «crear» con lo mismo devuelve el examen que ya hay (`repetida`), un doble toque nunca
// duplica. Sin la tabla (migración sin aplicar) → 501 `examenes_no_disponibles`.
import {
  setCorsHeaders, requireAuth, validators, getSupabase, handleSupabaseError, traerTodo, nombreCompleto,
  esErrorColumnaInexistente, hoyEspana, faltaFuncion
} from '../../api/_utils.js';

export const TIPOS_EXAMEN = ['teorico', 'maniobras', 'circulacion'];
export const RESULTADOS_EXAMEN = ['pendiente', 'apto', 'no_apto', 'aplazado', 'no_presentado'];
const NO_DISPONIBLE = { error: 'Los exámenes todavía no están disponibles en la nube. Avisa al administrador.', codigo: 'examenes_no_disponibles' };
const COLUMNAS = 'id, alumno_id, profesor_id, tipo, fecha, n_convocatoria, resultado, nota, permiso, examinador, vehiculo, fallos, fallos_detalle, origen, procedencia, updated_at';
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const sinTabla = error => !!error && (faltaFuncion(error) || error.code === 'PGRST205' ||
  (/presentaciones/i.test(error.message || '') && /does not exist|schema cache/i.test(error.message || '')));
const texto = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function fechaValida(v) {
  if (typeof v !== 'string' || !FECHA_RE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
// ±400 días de hoy: un examen se anota el día que se hace o se apunta con antelación; fuera de eso es un error de dedo
function dentroDeRango(fecha, hoy) {
  const dias = Math.round((Date.parse(fecha + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / 86400000);
  return dias >= -400 && dias <= 400;
}
function numeroOpcional(v, nombre, min, max) {
  if (v === null || v === undefined || v === '') return { valid: true, value: null };
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*\d{1,4}\s*$/.test(v) ? Number(v) : NaN);
  if (!Number.isInteger(n) || n < min || n > max) return { valid: false, error: `${nombre} no es válido (de ${min} a ${max})` };
  return { valid: true, value: n };
}

function paraApp(x, alumnos, profesores) {
  const a = alumnos.get(x.alumno_id);
  const p = profesores.get(x.profesor_id);
  return {
    id: x.id, alumno_id: x.alumno_id, alumno: a ? nombreCompleto(a) : '—', n_registro: a ? a.n_registro || null : null,
    profesor_id: x.profesor_id ?? null, profesor: p ? p.nombre : null,
    tipo: x.tipo, fecha: x.fecha, n_convocatoria: x.n_convocatoria || 1, resultado: x.resultado,
    nota: x.nota || '', permiso: x.permiso || (a ? a.permiso || null : null), examinador: x.examinador || null,
    fallos: x.fallos ?? null, fallos_detalle: x.fallos_detalle || null,
    origen: x.origen || 'desktop', procedencia: x.procedencia || null,
    borrable: x.origen === 'web-remote'
  };
}

async function nombresDe(supabase, auth, ids, tabla, columnas) {
  const unicos = [...new Set(ids.filter(i => i != null))];
  const mapa = new Map();
  if (!unicos.length) return mapa;
  // en tandas: un `in` con cientos de ids rompe la longitud de la URL
  for (let i = 0; i < unicos.length; i += 150) {
    const { data } = await supabase.from(tabla).select(columnas).in('id', unicos.slice(i, i + 150)).eq('empresa_id', auth.empresaId);
    for (const f of data || []) mapa.set(f.id, f);
  }
  return mapa;
}

async function listar(req, res, auth, supabase) {
  const q = req.query || {};
  const hoy = fechaValida(q.hoy) ? q.hoy : hoyEspana();
  let alumnoId = null;
  if (q.alumno_id !== undefined && q.alumno_id !== '') {
    const v = validators.positiveInt(q.alumno_id, 'alumno_id');
    if (!v.valid) return res.status(400).json({ error: v.error });
    alumnoId = v.value;
  }
  const desde = fechaValida(q.desde) ? q.desde : null;
  const hasta = fechaValida(q.hasta) ? q.hasta : null;
  const hace90 = new Date(Date.parse(hoy + 'T00:00:00Z') - 90 * 86400000).toISOString().slice(0, 10);

  const { data, error } = await traerTodo(() => {
    let c = supabase.from('presentaciones').select(COLUMNAS).eq('deleted', false).eq('empresa_id', auth.empresaId);
    if (alumnoId) c = c.eq('alumno_id', alumnoId);
    else if (!desde && !hasta) c = c.gte('fecha', hace90);
    if (desde) c = c.gte('fecha', desde);
    if (hasta) c = c.lte('fecha', hasta);
    return c.order('fecha', { ascending: false }).order('id', { ascending: false });
  });
  if (sinTabla(error)) return res.status(501).json(NO_DISPONIBLE);
  if (handleSupabaseError(error, res, 'Error al obtener los exámenes')) return;

  const alumnos = await nombresDe(supabase, auth, (data || []).map(x => x.alumno_id), 'alumnos', 'id, nombre, primer_apellido, segundo_apellido, permiso, n_registro');
  const profesores = await nombresDe(supabase, auth, (data || []).map(x => x.profesor_id), 'profesores', 'id, nombre');
  const lista = (data || []).map(x => paraApp(x, alumnos, profesores));
  // Próximos primero (de más cercano a más lejano), luego los hechos (de más reciente a más antiguo)
  const proximos = lista.filter(x => x.fecha >= hoy && x.resultado === 'pendiente').sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  const resto = lista.filter(x => !(x.fecha >= hoy && x.resultado === 'pendiente'));
  return res.status(200).json({ ok: true, hoy, examenes: [...proximos, ...resto], proximos: proximos.length });
}

async function crear(req, res, auth, supabase) {
  const b = req.body || {};
  const aid = validators.positiveInt(b.alumno_id, 'alumno_id');
  if (!aid.valid) return res.status(400).json({ error: aid.error });
  if (!TIPOS_EXAMEN.includes(b.tipo)) return res.status(400).json({ error: 'Tipo de examen no válido (teórico, maniobras o circulación).' });
  const hoy = fechaValida(b.hoy) ? b.hoy : hoyEspana();
  if (!fechaValida(b.fecha)) return res.status(400).json({ error: 'La fecha del examen no es válida.' });
  if (!dentroDeRango(b.fecha, hoy)) return res.status(400).json({ error: 'La fecha del examen está demasiado lejos de hoy.' });
  const resultado = b.resultado === undefined || b.resultado === '' ? (b.fecha > hoy ? 'pendiente' : null) : b.resultado;
  if (!RESULTADOS_EXAMEN.includes(resultado)) return res.status(400).json({ error: 'Falta el resultado del examen.' });
  if (resultado !== 'pendiente' && b.fecha > hoy) return res.status(400).json({ error: 'Un examen que aún no ha llegado solo puede quedar como pendiente.' });
  const nota = texto(b.nota, 500), examinador = texto(b.examinador, 120), detalle = texto(b.fallos_detalle, 2000);
  const fallos = numeroOpcional(b.fallos, 'Los fallos', 0, 99);
  if (!fallos.valid) return res.status(400).json({ error: fallos.error });
  const conv = numeroOpcional(b.n_convocatoria, 'La convocatoria', 1, 20);
  if (!conv.valid) return res.status(400).json({ error: conv.error });
  let profesorId = null;
  if (b.profesor_id !== undefined && b.profesor_id !== null && b.profesor_id !== '') {
    const p = validators.positiveInt(b.profesor_id, 'profesor_id');
    if (!p.valid) return res.status(400).json({ error: p.error });
    profesorId = p.value;
  }

  // El alumno tiene que ser de esta autoescuela
  let { data: alumno, error: errA } = await supabase.from('alumnos')
    .select('id, permiso, sucursal_id').eq('id', aid.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (errA && esErrorColumnaInexistente(errA)) {
    ({ data: alumno, error: errA } = await supabase.from('alumnos').select('id, permiso').eq('id', aid.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle());
  }
  if (handleSupabaseError(errA, res, 'Error al comprobar el alumno')) return;
  if (!alumno) return res.status(404).json({ error: 'Ese alumno no existe.' });

  // Lo que ya hay de ese alumno y tipo: repetición (doble toque / reintento), duplicado y número de convocatoria
  const { data: previos, error: errP } = await supabase.from('presentaciones')
    .select(COLUMNAS).eq('alumno_id', aid.value).eq('tipo', b.tipo).eq('deleted', false).eq('empresa_id', auth.empresaId);
  if (sinTabla(errP)) return res.status(501).json(NO_DISPONIBLE);
  if (handleSupabaseError(errP, res, 'Error al comprobar los exámenes del alumno')) return;
  const mismoDia = (previos || []).filter(x => x.fecha === b.fecha);
  const igual = mismoDia.find(x => x.resultado === resultado);
  if (igual) return res.status(200).json({ ok: true, repetida: true, id: igual.id, examen: igual });
  if (mismoDia.length && !b.forzar) {
    return res.status(409).json({ error: 'Ese alumno ya tiene un examen de ese tipo ese día.', codigo: 'ya_existe', existente: mismoDia[0] });
  }
  const numeroConv = conv.value || ((previos || []).filter(x => x.resultado !== 'pendiente' || x.fecha < b.fecha).reduce((m, x) => Math.max(m, x.n_convocatoria || 0), 0) + 1);

  const fila = {
    alumno_id: aid.value, profesor_id: profesorId, tipo: b.tipo, fecha: b.fecha, n_convocatoria: numeroConv, resultado,
    nota, permiso: alumno.permiso || null, examinador: examinador || null, fallos: fallos.value, fallos_detalle: detalle || null,
    origen: 'web-remote', empresa_id: auth.empresaId, deleted: false, updated_at: new Date().toISOString()
  };
  if (alumno.sucursal_id != null) fila.sucursal_id = alumno.sucursal_id;
  const { data, error } = await supabase.from('presentaciones').insert(fila).select('id').single();
  if (sinTabla(error)) return res.status(501).json(NO_DISPONIBLE);
  if (handleSupabaseError(error, res, 'Error al guardar el examen')) return;
  return res.status(200).json({ ok: true, id: data.id, n_convocatoria: numeroConv, resultado });
}

async function editar(req, res, auth, supabase) {
  const b = req.body || {};
  const id = validators.positiveInt(b.id, 'id');
  if (!id.valid) return res.status(400).json({ error: id.error });
  const hoy = fechaValida(b.hoy) ? b.hoy : hoyEspana();
  const { data: actual, error: errG } = await supabase.from('presentaciones')
    .select(COLUMNAS).eq('id', id.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (sinTabla(errG)) return res.status(501).json(NO_DISPONIBLE);
  if (handleSupabaseError(errG, res, 'Error al buscar el examen')) return;
  if (!actual) return res.status(404).json({ error: 'No se encuentra ese examen.' });

  const cambios = {};
  if (b.resultado !== undefined) {
    if (!RESULTADOS_EXAMEN.includes(b.resultado)) return res.status(400).json({ error: 'Resultado no válido.' });
    cambios.resultado = b.resultado;
  }
  if (b.fecha !== undefined) {
    if (!fechaValida(b.fecha) || !dentroDeRango(b.fecha, hoy)) return res.status(400).json({ error: 'La fecha del examen no es válida.' });
    cambios.fecha = b.fecha;
  }
  const resultadoFinal = cambios.resultado ?? actual.resultado, fechaFinal = cambios.fecha ?? actual.fecha;
  if (resultadoFinal !== 'pendiente' && fechaFinal > hoy) return res.status(400).json({ error: 'Un examen que aún no ha llegado solo puede quedar como pendiente.' });
  if (b.nota !== undefined) cambios.nota = texto(b.nota, 500);
  if (b.examinador !== undefined) cambios.examinador = texto(b.examinador, 120) || null;
  if (b.fallos_detalle !== undefined) cambios.fallos_detalle = texto(b.fallos_detalle, 2000) || null;
  if (b.fallos !== undefined) { const f = numeroOpcional(b.fallos, 'Los fallos', 0, 99); if (!f.valid) return res.status(400).json({ error: f.error }); cambios.fallos = f.value; }
  if (b.n_convocatoria !== undefined) { const c = numeroOpcional(b.n_convocatoria, 'La convocatoria', 1, 20); if (!c.valid) return res.status(400).json({ error: c.error }); if (c.value) cambios.n_convocatoria = c.value; }
  if (!Object.keys(cambios).length) return res.status(200).json({ ok: true, sin_cambios: true, id: id.value });
  if (Object.entries(cambios).every(([k, v]) => (actual[k] ?? null) === (v ?? null))) return res.status(200).json({ ok: true, sin_cambios: true, id: id.value });

  cambios.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('presentaciones').update(cambios)
    .eq('id', id.value).eq('deleted', false).eq('empresa_id', auth.empresaId).select('id');
  if (handleSupabaseError(error, res, 'Error al guardar el examen')) return;
  if (!data || !data.length) return res.status(404).json({ error: 'No se encuentra ese examen.' });
  return res.status(200).json({ ok: true, id: id.value, resultado: resultadoFinal });
}

async function borrar(req, res, auth, supabase) {
  const id = validators.positiveInt((req.body || {}).id, 'id');
  if (!id.valid) return res.status(400).json({ error: id.error });
  const { data: actual, error: errG } = await supabase.from('presentaciones')
    .select('id, origen').eq('id', id.value).eq('deleted', false).eq('empresa_id', auth.empresaId).maybeSingle();
  if (sinTabla(errG)) return res.status(501).json(NO_DISPONIBLE);
  if (handleSupabaseError(errG, res, 'Error al buscar el examen')) return;
  if (!actual) return res.status(200).json({ ok: true, ya_borrado: true });   // repetir no falla
  if (actual.origen !== 'web-remote') return res.status(403).json({ error: 'Ese examen lo anotó la oficina desde el ordenador: bórralo allí.', codigo: 'solo_oficina' });
  const { error } = await supabase.from('presentaciones')
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id.value).eq('empresa_id', auth.empresaId);
  if (handleSupabaseError(error, res, 'Error al borrar el examen')) return;
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const auth = requireAuth(req, res);
  if (!auth) return;
  const supabase = getSupabase(auth.token);
  if (req.method === 'GET') return listar(req, res, auth, supabase);
  const accion = (req.body || {}).accion;
  if (accion === 'crear') return crear(req, res, auth, supabase);
  if (accion === 'editar') return editar(req, res, auth, supabase);
  if (accion === 'borrar') return borrar(req, res, auth, supabase);
  return res.status(400).json({ error: 'Acción no válida.' });
}
