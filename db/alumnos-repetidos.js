// ─── ALUMNOS REPETIDOS Y NOMBRES JUNTOS ─────────────────────────────────────
// Dos herramientas para que la ficha de cada alumno sea una sola y con sus
// datos en su sitio (2026-10-06):
//
//  1. Nombre y apellidos juntos: hasta la 1.29 el alta del móvil tenía una sola
//     casilla «Nombre y apellidos» y todo acababa en `nombre`. Se propone cómo
//     separarlos (no guarda nada) y se aplica solo lo que se confirme.
//
//  2. Juntar dos fichas de la misma persona (la creada en el móvil y la de la
//     Puesta en marcha, o la que entró al traer otro programa): todo lo de la
//     que se va (clases, cobros, cargos, reservas, exámenes, tasas, bonos,
//     caducidades, contactos del CRM) pasa a la que se queda, que además
//     completa con sus datos lo que tenga vacío. Vista previa antes, copia de
//     seguridad y «Deshacer».
//
// Mismo cuidado que el resto de db/: todo lo que cambia se marca para subir a
// la nube (markDirtyVarios/markDeletedVarios) y la ficha que se va se borra
// con borrado suave en la nube (nunca se pierden las filas).

const { load, save, _sync, addLog, crearBackup, clasesDePractica, aCuartos, fmtClases } = require('./core');
const { CAMPOS_EXTRA } = require('./campos-extra');

// Carga perezosa: db/migracion.js depende de db/alumnos.js
const _norm = () => require('./migracion')._norm;
const txt = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const nombreDe = a => a ? [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ') : '';
const vacio = v => v == null || v === '' || (Array.isArray(v) && !v.length);

// ─── 1. NOMBRE Y APELLIDOS JUNTOS ───────────────────────────────────────────

// Segundas palabras que suelen ser parte del nombre («María José», «Juan
// Carlos»): esas propuestas salen sin marcar, para que se miren.
const NOMBRES_SEGUNDOS = new Set(['jose', 'maria', 'luis', 'carlos', 'antonio', 'manuel', 'jesus', 'angel', 'javier', 'miguel', 'carmen', 'isabel',
  'elena', 'pilar', 'teresa', 'rosa', 'dolores', 'ana', 'paula', 'lucia', 'alberto', 'andres', 'ignacio', 'ramon', 'francisco', 'pedro', 'pablo',
  'david', 'daniel', 'alejandro', 'sofia', 'laura', 'marta', 'cristina', 'beatriz', 'belen', 'victoria', 'eugenia', 'fernanda', 'manuela', 'josefa',
  'enrique', 'vicente', 'jorge', 'eduardo', 'alfonso', 'joaquin', 'tomas', 'rafael', 'fernando', 'emilio', 'mercedes', 'concepcion', 'amparo', 'luisa',
  'gabriel', 'adrian', 'mario', 'diego', 'sergio', 'ruben', 'ivan', 'oscar', 'raul', 'hugo', 'martin', 'nicolas', 'lorena', 'raquel', 'silvia', 'patricia',
  'andrea', 'irene', 'noelia', 'nuria', 'sara', 'eva', 'alba', 'clara', 'julia', 'marina', 'natalia', 'rocio', 'sonia', 'veronica', 'gema', 'ines']);

/**
 * Alumnos con los apellidos dentro del nombre (sin primer ni segundo apellido
 * y dos palabras o más en el nombre) y cómo quedarían separados. Solo lectura.
 * `ids` (opcional) limita a esos alumnos.
 * Devuelve [{ id, actual, nombre, primer_apellido, segundo_apellido, seguro, n_registro, permiso, estado, movil }]
 */
// Cómo se separaría un texto escrito en «Nombre» (null si no hay nada que separar).
// `seguro` = no parece un nombre compuesto («María José», «Juan Carlos»).
function _separarTexto(textoNombre) {
  const N = _norm();
  const actual = txt(textoNombre);
  if (actual.split(' ').length < 2) return null;
  const p = N.partirNombreCompleto(actual, actual.includes(',') ? 'apellidos_nombre' : 'nombre_apellidos');
  if (!p.primer_apellido) return null;
  const palabras = N.normTexto(actual).split(' ');
  const seguro = !(palabras.length === 2 && NOMBRES_SEGUNDOS.has(palabras[1]));
  return { actual, nombre: p.nombre, primer_apellido: p.primer_apellido, segundo_apellido: p.segundo_apellido || '', seguro };
}

/**
 * Para el aviso mientras se escribe un alumno: si en «Nombre» se han escrito también
 * los apellidos y las casillas de apellidos están vacías, cómo separarlos. Con un
 * nombre compuesto («María José») no propone nada. Solo lectura.
 */
function proponerSepararNombreTexto(textoNombre, primerApellido = '', segundoApellido = '') {
  if (txt(primerApellido) || txt(segundoApellido)) return null;
  const r = _separarTexto(textoNombre);
  return r && r.seguro ? r : null;
}

function proponerSepararNombres(ids = null) {
  const d = load();
  const filtro = Array.isArray(ids) && ids.length ? new Set(ids.map(Number)) : null;
  const res = [];
  for (const a of d.alumnos) {
    if (a.deleted || (filtro && !filtro.has(a.id))) continue;
    if (txt(a.primer_apellido) || txt(a.segundo_apellido)) continue;
    const r = _separarTexto(a.nombre);
    if (!r) continue;
    res.push({
      id: a.id, ...r,
      n_registro: a.n_registro || null, permiso: a.permiso || 'B', estado: a.estado || null, movil: a.id >= 1e9
    });
  }
  return res.sort((x, y) => (y.movil - x.movil) || x.actual.localeCompare(y.actual, 'es'));
}

/**
 * Guarda el nombre y los apellidos separados de los alumnos que se confirmen:
 * lista = [{ id, nombre, primer_apellido, segundo_apellido }]. No toca nada más
 * de la ficha. Devuelve { ok, cambiados, anteriores } (anteriores sirve para
 * deshacer: se vuelve a llamar con esa lista).
 */
function aplicarSepararNombres(lista = []) {
  const d = load();
  const anteriores = [], tocados = [], errores = [];
  for (const x of Array.isArray(lista) ? lista : []) {
    const a = d.alumnos.find(y => y.id === parseInt(x.id) && !y.deleted);
    if (!a) continue;
    const nombre = txt(x.nombre).slice(0, 80);
    if (!nombre) { errores.push(`${nombreDe(a)}: el nombre no puede quedar vacío.`); continue; }
    const p1 = txt(x.primer_apellido).slice(0, 80) || null, p2 = txt(x.segundo_apellido).slice(0, 80) || null;
    if (a.nombre === nombre && (a.primer_apellido || null) === p1 && (a.segundo_apellido || null) === p2) continue;
    anteriores.push({ id: a.id, nombre: a.nombre, primer_apellido: a.primer_apellido || '', segundo_apellido: a.segundo_apellido || '' });
    Object.assign(a, { nombre, primer_apellido: p1, segundo_apellido: p2 });
    tocados.push(a.id);
  }
  if (errores.length && !tocados.length) return { ok: false, errores };
  if (tocados.length) {
    addLog('alumnos', `Nombre y apellidos separados en ${tocados.length} ${tocados.length === 1 ? 'alumno' : 'alumnos'}`,
      anteriores.map(x => `${x.id}: «${nombreDe(x)}» → «${nombreDe(d.alumnos.find(a => a.id === x.id))}»`));
    save();
    const s = _sync(); if (s) s.markDirtyVarios('alumnos', tocados);
  }
  return { ok: true, cambiados: tocados.length, anteriores, errores };
}

// ─── 2. JUNTAR DOS FICHAS DE LA MISMA PERSONA ───────────────────────────────

// Tablas con `alumno_id` que se pasan a la ficha que se queda. Las primeras se
// sincronizan con la nube; las demás viven solo en este PC.
const TABLAS_SYNC = ['practicas', 'pagos', 'cargos', 'reservas'];
const TABLAS_LOCALES = ['presentaciones', 'tasas', 'bonos', 'leads'];
const NOMBRE_TABLA = { practicas: 'clases', pagos: 'cobros', cargos: 'cargos', reservas: 'reservas de la agenda', presentaciones: 'exámenes', tasas: 'tasas', bonos: 'bonos', leads: 'contactos del CRM', vencimientos: 'caducidades' };
// Datos de la ficha que la que se queda completa con los de la otra si los tiene vacíos
const CAMPOS_COMPLETAR = ['primer_apellido', 'segundo_apellido', 'dni', 'telefono', 'email', 'fecha_nacimiento', 'direccion', 'codigo_postal', 'poblacion',
  'observaciones', 'estado', 'vehiculo_id', 'profesor_id', 'permisos_posee', 'fecha_inicio', 'fecha_fin', 'resultado', 'n_inscripcion', 'sucursal_id',
  ...Object.keys(CAMPOS_EXTRA.alumnos).filter(c => c !== 'n_registro'), 'n_registro'];

function resumenAlumno(d, a) {
  const clases = d.practicas.filter(p => !p.deleted && p.alumno_id === a.id);
  return {
    id: a.id, nombre: nombreDe(a), dni: a.dni || null, n_registro: a.n_registro || null, permiso: a.permiso || 'B', estado: a.estado || null,
    telefono: a.telefono || null, fecha_alta: a.fecha_alta || null, movil: a.id >= 1e9,
    clases: aCuartos(clases.reduce((t, p) => t + clasesDePractica(p), 0) + (a.clases_previas > 0 ? a.clases_previas : 0)),
    clases_app: clases.length, primera: clases.map(p => p.fecha).filter(Boolean).sort()[0] || null
  };
}

/**
 * Parejas de fichas que parecen la misma persona: mismo DNI, o mismo nombre y
 * apellidos (en cualquier orden, sin tildes) sin DNI distinto; y el mismo
 * permiso (otro permiso de la misma persona es otro expediente, no un
 * repetido) y sin nº de registro distinto. Solo lectura.
 */
function buscarAlumnosRepetidos() {
  const d = load();
  const N = _norm();
  const vivos = d.alumnos.filter(a => !a.deleted);
  const grupos = new Map();
  const meter = (k, a) => { if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(a); };
  for (const a of vivos) {
    const dni = N.limpiarDni(a.dni).valor;
    if (dni) meter('dni:' + dni, a);
    const kn = N.claveNombre(a.nombre, a.primer_apellido, a.segundo_apellido);
    if (kn && kn.includes(' ')) meter('n:' + kn, a);
  }
  const vistas = new Set(), parejas = [];
  for (const [clave, lista] of grupos) {
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      const [x, y] = lista[i].id < lista[j].id ? [lista[i], lista[j]] : [lista[j], lista[i]];
      const k = x.id + '|' + y.id;
      if (vistas.has(k)) continue;
      const dx = N.limpiarDni(x.dni).valor, dy = N.limpiarDni(y.dni).valor;
      if (dx && dy && dx !== dy) continue;                                         // otra persona que se llama igual
      if ((x.permiso || 'B') !== (y.permiso || 'B')) continue;                      // otro permiso: otro expediente
      if (txt(x.n_registro) && txt(y.n_registro) && txt(x.n_registro) !== txt(y.n_registro)) continue; // dos expedientes con su nº
      vistas.add(k);
      parejas.push({ motivo: clave.startsWith('dni:') ? 'mismo DNI' : 'mismo nombre', a: resumenAlumno(d, x), b: resumenAlumno(d, y), ...elegirQuedan(x, y, d) });
    }
  }
  return parejas.sort((p, q) => p.a.nombre.localeCompare(q.a.nombre, 'es'));
}

// Cuál conviene que se quede: la que tiene más datos (nº de registro, DNI…),
// si no la que tiene más clases y, a igualdad, la más antigua (no la del móvil).
function elegirQuedan(x, y, d) {
  const puntos = a => (txt(a.n_registro) ? 8 : 0) + (txt(a.dni) ? 4 : 0) + (txt(a.primer_apellido) ? 2 : 0) + (a.id < 1e9 ? 1 : 0) +
    d.practicas.filter(p => !p.deleted && p.alumno_id === a.id).length / 1000;
  return puntos(y) > puntos(x) ? { queda: y.id, seVa: x.id } : { queda: x.id, seVa: y.id };
}

// Qué pasaría al juntar (lo usan la vista previa y la fusión).
function planFusion(d, queda, seVa) {
  const mover = {};
  for (const t of [...TABLAS_SYNC, ...TABLAS_LOCALES]) mover[t] = (d[t] || []).filter(x => !x.deleted && x.alumno_id === seVa.id).map(x => x.id);
  mover.vencimientos = (d.vencimientos || []).filter(v => !v.deleted && v.entidad_tipo === 'alumno' && v.entidad_id === seVa.id).map(v => v.id);
  const completar = {};
  for (const c of CAMPOS_COMPLETAR) if (vacio(queda[c]) && !vacio(seVa[c])) completar[c] = { antes: queda[c] ?? null, despues: seVa[c] };
  // Fecha de alta: la más antigua de las dos
  if (seVa.fecha_alta && (!queda.fecha_alta || seVa.fecha_alta < queda.fecha_alta)) completar.fecha_alta = { antes: queda.fecha_alta || null, despues: seVa.fecha_alta };
  // Permisos que cursa: los de las dos
  const permisos = [...new Set([...(queda.permisos || []), ...(seVa.permisos || [])])];
  if (permisos.length !== (queda.permisos || []).length) completar.permisos = { antes: queda.permisos || [], despues: permisos };
  // Clases y km de antes de la app: si la que se queda no tiene, los de la otra
  const avisos = [];
  if (seVa.clases_previas > 0) {
    if (!(queda.clases_previas > 0)) completar.clases_previas = { antes: queda.clases_previas || 0, despues: seVa.clases_previas };
    else avisos.push(`Las dos tienen «clases antes de la app» (${fmtClases(queda.clases_previas)} y ${fmtClases(seVa.clases_previas)}): se dejan las de la que se queda.`);
  }
  if (seVa.km_previos > 0 && !(queda.km_previos > 0)) completar.km_previos = { antes: queda.km_previos || 0, despues: seVa.km_previos };
  const N = _norm();
  const dq = N.limpiarDni(queda.dni).valor, ds = N.limpiarDni(seVa.dni).valor;
  if (dq && ds && dq !== ds) avisos.push(`Tienen DNI distinto (${queda.dni} y ${seVa.dni}): ¿seguro que son la misma persona?`);
  if ((queda.permiso || 'B') !== (seVa.permiso || 'B')) avisos.push(`Tienen permiso distinto (${queda.permiso} y ${seVa.permiso}): si se saca los dos, son dos expedientes y no hace falta juntarlos.`);
  if (txt(queda.n_registro) && txt(seVa.n_registro) && txt(queda.n_registro) !== txt(seVa.n_registro)) avisos.push(`Tienen nº de registro distinto (${queda.n_registro} y ${seVa.n_registro}): se queda el ${queda.n_registro}.`);
  return { mover, completar, avisos };
}

/**
 * Vista previa de juntar `idSeVa` en `idQueda` (no guarda nada).
 * Devuelve { ok, queda, seVa, mover: [{ tabla, nombre, n }], completar: [{ campo, antes, despues }], avisos }.
 */
function previaFusionAlumnos(idQueda, idSeVa) {
  const d = load();
  const queda = d.alumnos.find(a => a.id === parseInt(idQueda) && !a.deleted);
  const seVa = d.alumnos.find(a => a.id === parseInt(idSeVa) && !a.deleted);
  if (!queda || !seVa) return { ok: false, error: 'No se encuentra uno de los dos alumnos.' };
  if (queda.id === seVa.id) return { ok: false, error: 'Es el mismo alumno.' };
  const plan = planFusion(d, queda, seVa);
  return {
    ok: true, queda: resumenAlumno(d, queda), seVa: resumenAlumno(d, seVa),
    mover: Object.entries(plan.mover).filter(([, ids]) => ids.length).map(([t, ids]) => ({ tabla: t, nombre: NOMBRE_TABLA[t], n: ids.length })),
    completar: Object.entries(plan.completar).map(([campo, v]) => ({ campo, ...v })),
    avisos: plan.avisos
  };
}

/**
 * Junta `idSeVa` en `idQueda`: todo lo suyo pasa a la que se queda, que
 * completa sus datos vacíos, y la otra ficha se borra (borrado suave en la
 * nube). Antes hace una copia de seguridad. Devuelve { ok, id, movidos, completados } o { ok:false, error }.
 */
function fusionarAlumnos(idQueda, idSeVa) {
  const d = load();
  const queda = d.alumnos.find(a => a.id === parseInt(idQueda) && !a.deleted);
  const seVa = d.alumnos.find(a => a.id === parseInt(idSeVa) && !a.deleted);
  if (!queda || !seVa) return { ok: false, error: 'No se encuentra uno de los dos alumnos.' };
  if (queda.id === seVa.id) return { ok: false, error: 'Es el mismo alumno.' };
  const copia = crearBackup();
  if (!copia || !copia.ok) return { ok: false, error: 'No se pudo hacer la copia de seguridad previa; no se ha cambiado nada.' };
  const plan = planFusion(d, queda, seVa);
  const ahora = new Date().toISOString();
  for (const t of [...TABLAS_SYNC, ...TABLAS_LOCALES]) {
    const ids = new Set(plan.mover[t]);
    for (const x of d[t] || []) if (ids.has(x.id)) { x.alumno_id = queda.id; if (TABLAS_LOCALES.includes(t) || t === 'cargos') x.updated_at = ahora; }
  }
  const idsVenc = new Set(plan.mover.vencimientos);
  for (const v of d.vencimientos || []) if (idsVenc.has(v.id)) v.entidad_id = queda.id;
  const antes = {};
  for (const [c, v] of Object.entries(plan.completar)) { antes[c] = queda[c] === undefined ? null : queda[c]; queda[c] = v.despues; }
  const registro = {
    id: `fus-${Date.now()}`, fecha: ahora, queda: queda.id, seVa: { ...seVa }, movidos: plan.mover, antes,
    despues: Object.fromEntries(Object.entries(plan.completar).map(([c, v]) => [c, v.despues])), copia: copia.file, deshecha: null
  };
  d.alumnos = d.alumnos.filter(a => a.id !== seVa.id);
  if (!d.fusiones_alumnos) d.fusiones_alumnos = [];
  d.fusiones_alumnos.unshift(registro);
  d.fusiones_alumnos = d.fusiones_alumnos.slice(0, 30);
  const movidos = Object.values(plan.mover).reduce((t, l) => t + l.length, 0);
  addLog('alumnos', `Fichas juntadas: «${nombreDe(seVa)}» (id ${seVa.id}) pasa a «${nombreDe(queda)}» (id ${queda.id}) con ${movidos} registros. Copia previa: ${copia.file}`,
    Object.entries(plan.mover).filter(([, l]) => l.length).map(([t, l]) => `${NOMBRE_TABLA[t]}: ${l.length}`));
  save();
  const s = _sync();
  if (s) {
    for (const t of TABLAS_SYNC) s.markDirtyVarios(t, plan.mover[t]);
    s.markDirty('alumnos', queda.id);
    s.markDeleted('alumnos', seVa.id);
  }
  return { ok: true, id: registro.id, movidos, completados: Object.keys(plan.completar).length, copia: copia.file };
}

/** Deshace una fusión: la ficha que se fue vuelve con todo lo suyo. */
function deshacerFusionAlumnos(id) {
  const d = load();
  const r = (d.fusiones_alumnos || []).find(x => x.id === id);
  if (!r) return { ok: false, error: 'No se encuentra esa fusión.' };
  if (r.deshecha) return { ok: false, error: 'Ya se deshizo.' };
  if (d.alumnos.some(a => a.id === r.seVa.id)) return { ok: false, error: 'La ficha ya ha vuelto.' };
  const queda = d.alumnos.find(a => a.id === r.queda);
  const ahora = new Date().toISOString();
  d.alumnos.push({ ...r.seVa, deleted: false });
  for (const t of [...TABLAS_SYNC, ...TABLAS_LOCALES]) {
    const ids = new Set(r.movidos[t] || []);
    for (const x of d[t] || []) if (ids.has(x.id) && x.alumno_id === r.queda) { x.alumno_id = r.seVa.id; if (TABLAS_LOCALES.includes(t) || t === 'cargos') x.updated_at = ahora; }
  }
  const idsVenc = new Set(r.movidos.vencimientos || []);
  for (const v of d.vencimientos || []) if (idsVenc.has(v.id) && v.entidad_id === r.queda) v.entidad_id = r.seVa.id;
  // Los datos que se completaron vuelven a como estaban (si nadie los ha cambiado)
  if (queda) for (const [c, v] of Object.entries(r.antes || {})) if (JSON.stringify(queda[c] ?? null) === JSON.stringify((r.despues || {})[c] ?? null)) queda[c] = v;
  r.deshecha = ahora;
  addLog('alumnos', `Deshecha la fusión de «${nombreDe(r.seVa)}»: vuelve a ser una ficha aparte`, []);
  save();
  const s = _sync();
  if (s) {
    for (const t of TABLAS_SYNC) s.markDirtyVarios(t, r.movidos[t] || []);
    if (s.desmarcarBorradosVarios) s.desmarcarBorradosVarios('alumnos', [r.seVa.id]);
    s.markDirtyVarios('alumnos', [r.seVa.id, ...(queda ? [queda.id] : [])]);
  }
  return { ok: true };
}

/** Fusiones hechas en este PC (las más recientes primero). */
function getFusionesAlumnos() {
  const d = load();
  return (d.fusiones_alumnos || []).map(r => {
    const q = d.alumnos.find(a => a.id === r.queda);
    return { id: r.id, fecha: r.fecha, queda: q ? nombreDe(q) : `(id ${r.queda})`, seVa: nombreDe(r.seVa), movidos: Object.values(r.movidos || {}).reduce((t, l) => t + l.length, 0), deshecha: r.deshecha };
  });
}

module.exports = {
  proponerSepararNombres, proponerSepararNombreTexto, aplicarSepararNombres,
  buscarAlumnosRepetidos, previaFusionAlumnos, fusionarAlumnos, deshacerFusionAlumnos, getFusionesAlumnos
};
