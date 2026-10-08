// ─── PROCEDENCIA DE LOS DATOS (traídos de otro programa) ────────────────────
// Todo lo que entra desde «Traer de otro programa» (Excel/CSV) o desde la base
// de Ariauto queda marcado con el nombre del programa del que viene en el campo
// `procedencia` (alumnos, clases, profesores, coches, pagos, cargos, exámenes,
// tasas y caducidades). null = creado en AulaMovil. Así se ve siempre qué es
// de antes y qué de después: filtros, grupos plegables en las listas, la
// etiqueta junto al nombre y Ajustes → Datos de otros programas (renombrar o
// quitar la etiqueta). Se sincroniza (migración 2026-10-08_procedencia.sql) y
// el registro de programas (`ajustes_empresa.procedencias`: nombre y fecha en
// que se trajeron) se comparte con el otro PC.

const { load, save, _sync, addLog } = require('./core');

// Tablas con procedencia y cómo se llaman sus registros en la pantalla
const TABLAS_PROCEDENCIA = {
  alumnos: ['alumno', 'alumnos'], practicas: ['clase', 'clases'], profesores: ['profesor', 'profesores'],
  vehiculos: ['coche', 'coches'], pagos: ['pago', 'pagos'], cargos: ['cargo', 'cargos'],
  presentaciones: ['examen', 'exámenes'], tasas: ['tasa', 'tasas'], vencimientos: ['caducidad', 'caducidades']
};
// Las que viajan a la nube (las demás son solo de este PC)
const TABLAS_PROCEDENCIA_NUBE = ['alumnos', 'practicas', 'profesores', 'vehiculos', 'pagos', 'cargos'];
const PROCEDENCIA_POR_DEFECTO = 'Programa anterior';
const MAX_LARGO = 40;
const CLAVE_REGISTRO = 'procedencias';
// Nombres que significan «esta misma app»: no son una procedencia
const ES_ESTA_APP = /^(aulamovil|aula movil|kmalumnos|km alumnos|esta app|creado aqu[ií])$/i;

/** Nombre limpio del programa («  ariauto » → «ariauto» tal cual, sin espacios de más); null = creado aquí. */
function normalizarProcedencia(valor) {
  if (valor == null) return null;
  const t = String(valor).replace(/\s+/g, ' ').trim().slice(0, MAX_LARGO).trim();
  if (!t || ES_ESTA_APP.test(t)) return null;
  return t;
}

const mismaProcedencia = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/**
 * ¿Pasa el filtro? '' = todo, '__app' = creados en AulaMovil, '__otros' =
 * traídos de cualquier programa, otro texto = de ese programa.
 */
function coincideProcedencia(valor, filtro) {
  if (!filtro) return true;
  if (filtro === '__app') return !valor;
  if (filtro === '__otros') return !!valor;
  return mismaProcedencia(valor, filtro);
}

function _registro(d) {
  const a = (d.ajustes_empresa || {})[CLAVE_REGISTRO];
  return a && Array.isArray(a.valor) ? a.valor.filter(x => x && typeof x.nombre === 'string') : [];
}

function _guardarRegistro(d, lista) {
  if (!d.ajustes_empresa || typeof d.ajustes_empresa !== 'object') d.ajustes_empresa = {};
  d.ajustes_empresa[CLAVE_REGISTRO] = { valor: lista, updated_at: new Date().toISOString() };
  return true;
}

// Apunta que hoy (o `fecha`) se trajeron datos de `nombre` (desde = la primera vez)
function _apuntarPrograma(d, nombre, fecha) {
  const lista = _registro(d).map(x => ({ ...x }));
  const dia = String(fecha || new Date().toISOString()).slice(0, 10);
  const ya = lista.find(x => mismaProcedencia(x.nombre, nombre));
  if (ya) {
    if (!ya.desde || dia < ya.desde) ya.desde = dia;
    if (!ya.ultima || dia > ya.ultima) ya.ultima = dia;
  } else lista.push({ nombre, desde: dia, ultima: dia });
  return _guardarRegistro(d, lista);
}

/**
 * Marca con `nombre` lo creado por una importación (`creados` = { tabla: [ids] },
 * el mismo registro que sirve para deshacerla). Solo pone la marca a los que no
 * la tienen y apunta el programa en el registro compartido. No guarda: lo hace
 * quien importa (y ya marca para la nube lo que creó). Devuelve
 * { nombre, marcados: { tabla: [ids] } }.
 */
function etiquetarCreados(d, creados, nombre, fecha) {
  const prog = normalizarProcedencia(nombre) || PROCEDENCIA_POR_DEFECTO;
  const marcados = {};
  for (const tabla of Object.keys(TABLAS_PROCEDENCIA)) {
    const ids = new Set(((creados || {})[tabla] || []).map(Number));
    if (!ids.size || !Array.isArray(d[tabla])) continue;
    for (const r of d[tabla]) {
      if (!ids.has(r.id) || r.procedencia) continue;
      r.procedencia = prog;
      (marcados[tabla] = marcados[tabla] || []).push(r.id);
    }
  }
  _apuntarPrograma(d, prog, fecha);
  const s = _sync(); if (s) s.markDirty('ajustes_empresa', CLAVE_REGISTRO);
  return { nombre: prog, marcados };
}

// Lo marcado para la nube de una vez por tabla (nunca uno a uno)
function _marcarNube(marcados) {
  const s = _sync();
  if (!s) return;
  for (const t of TABLAS_PROCEDENCIA_NUBE) if ((marcados[t] || []).length) s.markDirtyVarios(t, marcados[t]);
}

/**
 * Las importaciones hechas antes de existir la etiqueta (o en otro equipo con
 * una versión anterior, sin deshacer) se marcan al arrancar: Ariauto como
 * «Ariauto» y las demás como «Programa anterior». Una sola vez por importación.
 */
function etiquetarImportacionesAnteriores() {
  const d = load();
  const pendientes = (d.importaciones || []).filter(i => !i.deshecha && !i.procedencia && i.creados);
  if (!pendientes.length) return { ok: true, importaciones: 0, marcados: 0 };
  const todos = {};
  for (const imp of pendientes) {
    const r = etiquetarCreados(d, imp.creados, imp.tipo === 'ariauto' ? 'Ariauto' : PROCEDENCIA_POR_DEFECTO, imp.fecha);
    imp.procedencia = r.nombre;
    for (const [t, ids] of Object.entries(r.marcados)) (todos[t] = todos[t] || []).push(...ids);
  }
  save();
  _marcarNube(todos);
  const n = Object.values(todos).reduce((s, l) => s + l.length, 0);
  return { ok: true, importaciones: pendientes.length, marcados: n };
}

/**
 * Programas de los que hay datos, con lo que hay de cada uno (sin lo borrado),
 * y lo creado en AulaMovil. Mezcla el registro compartido (fechas) con lo que
 * de verdad hay en los datos (por si se marcó algo a mano).
 * { app: { alumnos, practicas, … }, programas: [{ nombre, desde, ultima, cuenta, total }] }
 */
function getProcedencias() {
  const d = load();
  const app = {}, porNombre = new Map();
  const de = nombre => {
    const k = nombre.toLowerCase();
    if (!porNombre.has(k)) porNombre.set(k, { nombre, desde: null, ultima: null, cuenta: {}, total: 0 });
    return porNombre.get(k);
  };
  for (const tabla of Object.keys(TABLAS_PROCEDENCIA)) {
    app[tabla] = 0;
    for (const r of d[tabla] || []) {
      if (r.deleted) continue;
      if (!r.procedencia) { app[tabla]++; continue; }
      const p = de(r.procedencia);
      p.cuenta[tabla] = (p.cuenta[tabla] || 0) + 1;
      p.total++;
    }
  }
  for (const x of _registro(d)) {
    const p = porNombre.get(String(x.nombre).toLowerCase());
    if (p) { p.desde = x.desde || null; p.ultima = x.ultima || null; }
  }
  const programas = [...porNombre.values()]
    .sort((a, b) => String(a.desde || '9999').localeCompare(String(b.desde || '9999')) || a.nombre.localeCompare(b.nombre, 'es'));
  return { app, programas, tablas: TABLAS_PROCEDENCIA };
}

/**
 * Cambia el nombre de un programa en todo lo que lo lleva (p. ej. «Programa
 * anterior» → «Gesauto»). Con `nuevo` vacío se QUITA la etiqueta: esos datos
 * pasan a contar como creados en AulaMovil (no se borra nada). Si el nombre
 * nuevo ya existe, se juntan.
 */
function renombrarProcedencia(viejo, nuevo) {
  const antes = normalizarProcedencia(viejo);
  if (!antes) return { ok: false, error: 'Falta el programa que se quiere cambiar.' };
  const despues = normalizarProcedencia(nuevo);
  const d = load();
  const marcados = {};
  let total = 0;
  for (const tabla of Object.keys(TABLAS_PROCEDENCIA)) {
    for (const r of d[tabla] || []) {
      if (!r.procedencia || !mismaProcedencia(r.procedencia, antes)) continue;
      r.procedencia = despues;
      (marcados[tabla] = marcados[tabla] || []).push(r.id);
      total++;
    }
  }
  // Registro: el viejo desaparece; si hay nombre nuevo hereda sus fechas
  const lista = _registro(d).map(x => ({ ...x }));
  const viejoReg = lista.find(x => mismaProcedencia(x.nombre, antes));
  let resto = lista.filter(x => !mismaProcedencia(x.nombre, antes));
  if (despues) {
    const destino = resto.find(x => mismaProcedencia(x.nombre, despues));
    if (destino) {
      if (viejoReg && viejoReg.desde && (!destino.desde || viejoReg.desde < destino.desde)) destino.desde = viejoReg.desde;
      if (viejoReg && viejoReg.ultima && (!destino.ultima || viejoReg.ultima > destino.ultima)) destino.ultima = viejoReg.ultima;
    } else resto = [...resto, { nombre: despues, desde: viejoReg ? viejoReg.desde : null, ultima: viejoReg ? viejoReg.ultima : null }];
  }
  _guardarRegistro(d, resto);
  addLog('procedencia', despues
    ? `Datos de «${antes}» renombrados a «${despues}» (${total} registros)`
    : `Quitada la etiqueta «${antes}»: ${total} registros pasan a contar como creados en AulaMovil`, []);
  save();
  const s = _sync(); if (s) s.markDirty('ajustes_empresa', CLAVE_REGISTRO);
  _marcarNube(marcados);
  return { ok: true, total, por_tabla: Object.fromEntries(Object.entries(marcados).map(([t, l]) => [t, l.length])) };
}

module.exports = {
  normalizarProcedencia, coincideProcedencia, etiquetarCreados, etiquetarImportacionesAnteriores,
  getProcedencias, renombrarProcedencia,
  TABLAS_PROCEDENCIA, TABLAS_PROCEDENCIA_NUBE, PROCEDENCIA_POR_DEFECTO
};
