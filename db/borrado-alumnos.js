// ─── BORRAR ALUMNOS POR FECHAS (2026-11-06) ─────────────────────────────────
// Para limpiar de golpe a los alumnos de un periodo (una importación equivocada, un curso
// antiguo…): «dados de alta a partir de tal día» o «entre dos fechas», o por la fecha de su
// última clase. Siempre en dos pasos:
//   1. proponerBorradoAlumnos(filtros)  → vista previa (no toca nada): quiénes son, cuánto
//      tienen cada uno (clases, cobros, exámenes…) y avisos (deben dinero, dieron clase hace poco…).
//   2. aplicarBorradoAlumnos({ ...filtros, ids, borrarCobros }) → copia de seguridad, borra a los
//      alumnos y TODO lo suyo (clases, reservas, exámenes, tasas, bonos, caducidades) y guarda lo
//      borrado aparte para poder deshacerlo (deshacerBorradoAlumnos).
// Los cobros y cargos se CONSERVAN por defecto (son contabilidad: el dinero se cobró); solo se
// borran si se pide. En la nube todo es borrado suave (soft delete), como siempre.

const fs = require('fs');
const path = require('path');
const {
  load, save, addLog, _sync, crearBackup, getDataPath, hoyLocalISO, clasesDePractica, aCuartos, nombreCorto,
  filtrarPorSucursal, alumnoTerminado
} = require('./core');
const { coincideProcedencia } = require('./procedencia');

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const CRITERIOS = ['alta', 'ultima_clase'];
const MAX_REGISTROS = 15;          // borrados que se pueden deshacer (el resto se olvida con su archivo)
const MAX_FILAS_PREVIA = 400;      // filas que se enseñan en la vista previa (el total siempre es el real)

const dirBorrados = () => path.join(path.dirname(getDataPath()), 'borrados');
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

function _validar(f) {
  const criterio = CRITERIOS.includes(f.criterio) ? f.criterio : 'alta';
  const desde = f.desde ? String(f.desde) : '', hasta = f.hasta ? String(f.hasta) : '';
  if (!desde && !hasta) return { error: 'Pon al menos una fecha («a partir de» o «hasta»).' };
  if (desde && !FECHA_RE.test(desde)) return { error: 'La fecha «desde» no es válida.' };
  if (hasta && !FECHA_RE.test(hasta)) return { error: 'La fecha «hasta» no es válida.' };
  if (desde && hasta && desde > hasta) return { error: 'La fecha «desde» es posterior a la fecha «hasta».' };
  return { criterio, desde, hasta, procedencia: f.procedencia || '', incluirSinClases: !!f.incluirSinClases };
}

// Mapas de lo que cuelga de cada alumno (una pasada por tabla, nunca una búsqueda por alumno)
function _indices(d) {
  const por = (lista, clave = 'alumno_id') => {
    const m = new Map();
    for (const x of lista || []) { if (x.deleted) continue; const k = x[clave]; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return m;
  };
  return {
    practicas: por(d.practicas), pagos: por(d.pagos), cargos: por(d.cargos), reservas: por(d.reservas),
    presentaciones: por(d.presentaciones), tasas: por(d.tasas), bonos: por(d.bonos),
    vencimientos: por((d.vencimientos || []).filter(v => v.entidad_tipo === 'alumno'), 'entidad_id')
  };
}

function _seleccionar(d, f, sucursalId, idx) {
  const out = [];
  for (const a of filtrarPorSucursal(d.alumnos, sucursalId)) {
    if (a.deleted || !coincideProcedencia(a.procedencia, f.procedencia)) continue;
    const clases = idx.practicas.get(a.id) || [];
    const ultima = clases.reduce((m, p) => (p.fecha && (!m || p.fecha > m) ? p.fecha : m), null);
    const alta = a.fecha_alta || a.fecha_inicio || null;
    let referencia;
    if (f.criterio === 'ultima_clase') {
      if (ultima) referencia = ultima;
      else if (f.incluirSinClases) referencia = alta;   // sin ninguna clase se juzga por su alta
      else continue;
    } else referencia = alta;
    if (!referencia) continue;                          // sin fecha no se puede saber si está en el rango
    if (f.desde && referencia < f.desde) continue;
    if (f.hasta && referencia > f.hasta) continue;
    out.push({ a, ultima, referencia });
  }
  return out;
}

function _deudas(sucursalId) {
  const m = new Map();
  try { for (const f of require('./pagos').getDeudas(sucursalId)) m.set(f.alumno_id, f.saldo); } catch (e) { /* sin deudas: no se avisa de ellas */ }
  return m;
}

/**
 * Vista previa. filtros: { criterio: 'alta'|'ultima_clase', desde, hasta (YYYY-MM-DD, al menos una),
 * procedencia ('' cualquiera, '__app', '__otros' o un programa), incluirSinClases }.
 * Devuelve { ok, total, alumnos: [...], ids: [todos], resumen, avisos } o { ok:false, error }.
 */
function proponerBorradoAlumnos(filtros = {}, sucursalId) {
  const f = _validar(filtros || {});
  if (f.error) return { ok: false, error: f.error };
  const d = load();
  const hoy = hoyLocalISO();
  const idx = _indices(d);
  const deudas = _deudas(sucursalId);
  const sel = _seleccionar(d, f, sucursalId, idx);
  const resumen = { alumnos: sel.length, clases: 0, cobros: 0, importe_cobrado: 0, cargos: 0, examenes: 0, reservas: 0, deben: 0, con_clase_reciente: 0, con_examen_pendiente: 0 };
  const filas = sel.map(({ a, ultima, referencia }) => {
    const cl = idx.practicas.get(a.id) || [], pg = idx.pagos.get(a.id) || [], ca = idx.cargos.get(a.id) || [];
    const ex = idx.presentaciones.get(a.id) || [], rs = idx.reservas.get(a.id) || [];
    const clases = aCuartos(cl.reduce((t, p) => t + clasesDePractica(p), 0));
    const cobrado = Math.round(pg.reduce((t, p) => t + (Number(p.cantidad) || 0), 0) * 100) / 100;
    const debe = Math.max(0, Math.round((deudas.get(a.id) || 0) * 100) / 100);
    const reciente = !!ultima && diasEntre(ultima, hoy) <= 30;
    const examenPendiente = ex.some(x => x.resultado === 'pendiente' && x.fecha >= hoy) || rs.some(r => ['solicitada', 'confirmada'].includes(r.estado) && r.fecha >= hoy);
    resumen.clases += clases; resumen.cobros += pg.length; resumen.importe_cobrado += cobrado; resumen.cargos += ca.length;
    resumen.examenes += ex.length; resumen.reservas += rs.length;
    if (debe > 0) resumen.deben++;
    if (reciente) resumen.con_clase_reciente++;
    if (examenPendiente) resumen.con_examen_pendiente++;
    return {
      id: a.id, nombre: nombreCorto(a), dni: a.dni || null, n_registro: a.n_registro || null, permiso: a.permiso || 'B',
      estado: a.estado || null, procedencia: a.procedencia || null, fecha_alta: a.fecha_alta || null, ultima_clase: ultima,
      referencia, clases, previas: a.clases_previas > 0 ? a.clases_previas : 0, cobros: pg.length, cobrado, cargos: ca.length,
      examenes: ex.length, debe, reciente, examen_pendiente: examenPendiente, terminado: alumnoTerminado(a)
    };
  }).sort((x, y) => x.referencia.localeCompare(y.referencia) || x.nombre.localeCompare(y.nombre, 'es'));
  resumen.importe_cobrado = Math.round(resumen.importe_cobrado * 100) / 100;
  resumen.clases = aCuartos(resumen.clases);
  const sinFecha = filtrarPorSucursal(d.alumnos, sucursalId).filter(a => !a.deleted && coincideProcedencia(a.procedencia, f.procedencia) && !(a.fecha_alta || a.fecha_inicio)).length;
  const avisos = [];
  if (f.criterio === 'alta' && sinFecha) avisos.push(`${sinFecha} ${sinFecha === 1 ? 'alumno no tiene' : 'alumnos no tienen'} fecha de alta y no se pueden comparar: no entran.`);
  return { ok: true, filtros: f, total: filas.length, alumnos: filas.slice(0, MAX_FILAS_PREVIA), truncado: filas.length > MAX_FILAS_PREVIA, ids: filas.map(x => x.id), resumen, avisos };
}

const TABLAS = ['practicas', 'reservas', 'presentaciones', 'tasas', 'bonos'];

/**
 * Borra a los alumnos que cumplen el filtro (y, si se pasa `ids`, solo esos) con todo lo suyo.
 * `borrarCobros` (por defecto NO): también sus pagos y cargos. Hace antes una copia de seguridad
 * y guarda lo borrado para poder deshacerlo. Devuelve { ok, id, borrados, copia } o { ok:false, error }.
 */
function aplicarBorradoAlumnos(opciones = {}, sucursalId) {
  const f = _validar(opciones || {});
  if (f.error) return { ok: false, error: f.error };
  const d = load();
  const idx = _indices(d);
  const quienes = _seleccionar(d, f, sucursalId, idx).map(x => x.a);
  const pedidos = Array.isArray(opciones.ids) ? new Set(opciones.ids.map(Number)) : null;
  const alumnos = quienes.filter(a => !pedidos || pedidos.has(a.id));
  if (!alumnos.length) return { ok: false, error: 'No hay ningún alumno que cumpla ese filtro (puede haber cambiado desde que lo viste).' };
  const borrarCobros = !!opciones.borrarCobros;

  const copia = crearBackup();
  if (!copia || !copia.ok) return { ok: false, error: 'No se pudo hacer la copia de seguridad previa; no se ha borrado nada.' };

  const ids = new Set(alumnos.map(a => a.id));
  const snapshot = { alumnos: alumnos.map(a => ({ ...a })) };
  const sacar = (tabla, enAlumno) => {
    const lista = d[tabla] || [];
    const fuera = lista.filter(x => enAlumno(x));
    snapshot[tabla] = fuera.map(x => ({ ...x }));
    d[tabla] = lista.filter(x => !enAlumno(x));
    return fuera.map(x => x.id);
  };
  const quitados = {};
  quitados.alumnos = alumnos.map(a => a.id);
  d.alumnos = d.alumnos.filter(a => !ids.has(a.id));
  for (const t of TABLAS) quitados[t] = sacar(t, x => ids.has(x.alumno_id));
  quitados.vencimientos = sacar('vencimientos', v => v.entidad_tipo === 'alumno' && ids.has(v.entidad_id));
  if (borrarCobros) {
    quitados.pagos = sacar('pagos', x => ids.has(x.alumno_id));
    // Los cargos locales llevan marca de borrado (como en db/cargos.js): se quedan con deleted:true
    const ahora = new Date().toISOString();
    const cargos = (d.cargos || []).filter(c => ids.has(c.alumno_id) && !c.deleted);
    snapshot.cargos = cargos.map(c => ({ ...c }));
    cargos.forEach(c => { c.deleted = true; c.updated_at = ahora; });
    quitados.cargos = cargos.map(c => c.id);
  }

  const id = `bor-${Date.now()}`;
  const archivo = path.join(dirBorrados(), id + '.json');
  try {
    fs.mkdirSync(dirBorrados(), { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(snapshot), 'utf-8');
  } catch (e) {
    return { ok: false, error: 'No se pudo guardar lo que se iba a borrar para poder deshacerlo; no se ha borrado nada.' };
  }
  const registro = {
    id, fecha: new Date().toISOString(), criterio: f.criterio, desde: f.desde || null, hasta: f.hasta || null, procedencia: f.procedencia || null,
    cobros_borrados: borrarCobros, borrados: Object.fromEntries(Object.entries(quitados).map(([t, l]) => [t, l.length])),
    copia: copia.file, archivo: path.basename(archivo), deshecho: null
  };
  if (!d.borrados_alumnos) d.borrados_alumnos = [];
  d.borrados_alumnos.unshift(registro);
  for (const viejo of d.borrados_alumnos.splice(MAX_REGISTROS)) { try { fs.unlinkSync(path.join(dirBorrados(), viejo.archivo)); } catch (e) { /* ya no está */ } }
  addLog('borrado_alumnos',
    `Borrados ${alumnos.length} ${alumnos.length === 1 ? 'alumno' : 'alumnos'} (${f.criterio === 'alta' ? 'dados de alta' : 'con última clase'} ${f.desde ? 'desde ' + f.desde : ''}${f.desde && f.hasta ? ' ' : ''}${f.hasta ? 'hasta ' + f.hasta : ''}) con ${quitados.practicas.length} clases${borrarCobros ? ' y sus cobros' : ' (cobros conservados)'}. Copia previa: ${copia.file}`,
    alumnos.slice(0, 200).map(a => `Alumno ${a.id}${a.n_registro ? ' (nº ' + a.n_registro + ')' : ''}`));
  save();

  const s = _sync();
  if (s) {
    s.markDeletedVarios('practicas', quitados.practicas);
    s.markDeletedVarios('reservas', quitados.reservas);
    s.markDeletedVarios('presentaciones', quitados.presentaciones);
    if (borrarCobros) { s.markDeletedVarios('pagos', quitados.pagos); s.markDeletedVarios('cargos', quitados.cargos); }
    s.markDeletedVarios('alumnos', quitados.alumnos);
  }
  return { ok: true, id, borrados: registro.borrados, copia: copia.file, cobros_borrados: borrarCobros };
}

/** Borrados que se pueden deshacer (los más recientes primero). */
function getBorradosAlumnos() {
  const d = load();
  return (d.borrados_alumnos || []).map(r => ({
    id: r.id, fecha: r.fecha, criterio: r.criterio, desde: r.desde, hasta: r.hasta, procedencia: r.procedencia,
    alumnos: (r.borrados || {}).alumnos || 0, clases: (r.borrados || {}).practicas || 0, cobros_borrados: !!r.cobros_borrados,
    deshecho: r.deshecho, disponible: fs.existsSync(path.join(dirBorrados(), r.archivo))
  }));
}

/** Devuelve a los alumnos borrados con todo lo suyo (en la nube también vuelven). */
function deshacerBorradoAlumnos(id) {
  const d = load();
  const r = (d.borrados_alumnos || []).find(x => x.id === id);
  if (!r) return { ok: false, error: 'No se encuentra ese borrado.' };
  if (r.deshecho) return { ok: false, error: 'Ese borrado ya se deshizo.' };
  const archivo = path.join(dirBorrados(), r.archivo);
  let snap;
  try { snap = JSON.parse(fs.readFileSync(archivo, 'utf-8')); } catch (e) { return { ok: false, error: 'Ya no se conserva lo que se borró (se guarda un tiempo limitado). La copia de seguridad previa sigue en: ' + r.copia }; }
  const ahora = new Date().toISOString();
  const devueltos = {};
  const volver = (tabla, filas, soft) => {
    if (!Array.isArray(d[tabla])) d[tabla] = [];
    const existentes = new Map(d[tabla].map(x => [x.id, x]));
    const ids = [];
    for (const x of filas || []) {
      const ya = existentes.get(x.id);
      if (ya) { if (soft && ya.deleted) { ya.deleted = false; ya.updated_at = ahora; ids.push(x.id); } continue; }
      d[tabla].push({ ...x, ...(soft ? { deleted: false } : {}), updated_at: ahora });
      ids.push(x.id);
    }
    devueltos[tabla] = ids;
  };
  volver('alumnos', snap.alumnos);
  for (const t of TABLAS) volver(t, snap[t]);
  volver('vencimientos', snap.vencimientos);
  if (snap.pagos) volver('pagos', snap.pagos);
  if (snap.cargos) volver('cargos', snap.cargos, true);
  r.deshecho = ahora;
  addLog('borrado_alumnos', `Deshecho el borrado de ${devueltos.alumnos.length} alumnos (${r.id})`, []);
  save();
  const s = _sync();
  if (s) {
    for (const t of ['practicas', 'reservas', 'presentaciones', 'pagos', 'cargos', 'alumnos']) {
      if (!devueltos[t] || !devueltos[t].length) continue;
      if (s.desmarcarBorradosVarios) s.desmarcarBorradosVarios(t, devueltos[t]);
      s.markDirtyVarios(t, devueltos[t]);
    }
  }
  try { fs.unlinkSync(archivo); } catch (e) { /* ya no está */ }
  return { ok: true, devueltos: Object.fromEntries(Object.entries(devueltos).map(([t, l]) => [t, l.length])) };
}

module.exports = { proponerBorradoAlumnos, aplicarBorradoAlumnos, getBorradosAlumnos, deshacerBorradoAlumnos };
