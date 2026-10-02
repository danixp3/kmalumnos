/**
 * db/ajustes-empresa.js  –  ajustes compartidos con la web del móvil (tabla
 * `ajustes_empresa` de Supabase, migración 2026-10-01). Se guardan en
 * data.json como { clave: { valor, updated_at } } y sync.js los sube/baja
 * (gana el más reciente). Primer uso: las zonas de prácticas que el profesor
 * marca en el móvil como "Zonas recorridas".
 */

// ─── AJUSTES COMPARTIDOS ─────────────────────────────────────────────────────

const { load, save, _sync, addLog, firmaValida } = require('./core');

const MAX_ZONAS = 30;
const MAX_LARGO_ZONA = 40;

function getAjusteEmpresa(clave) {
  const d = load();
  const a = (d.ajustes_empresa || {})[clave];
  return a ? a.valor : null;
}

function setAjusteEmpresa(clave, valor) {
  const d = load();
  if (!d.ajustes_empresa || typeof d.ajustes_empresa !== 'object') d.ajustes_empresa = {};
  d.ajustes_empresa[clave] = { valor, updated_at: new Date().toISOString() };
  save();
  const s = _sync(); if (s) s.markDirty('ajustes_empresa', clave);
}

// Zonas de prácticas (p. ej. "Centro", "Polígono", "Autovía"). Sin zonas, la
// web no muestra el bloque "Zonas recorridas".
function getZonasPractica() {
  const v = getAjusteEmpresa('zonas');
  return Array.isArray(v) ? v.filter(z => typeof z === 'string' && z.trim()) : [];
}

function setZonasPractica(lista) {
  const vistas = new Set();
  const limpia = [];
  for (const z of Array.isArray(lista) ? lista : []) {
    const t = String(z == null ? '' : z).replace(/\s+/g, ' ').trim().slice(0, MAX_LARGO_ZONA);
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    limpia.push(t);
    if (limpia.length >= MAX_ZONAS) break;
  }
  addLog('ajustes', `Zonas de prácticas: ${limpia.length ? limpia.join(', ') : 'ninguna'}`, []);
  setAjusteEmpresa('zonas', limpia); // guarda también el log
  return limpia;
}

// Minutos que dura una clase. La web del móvil lo usa para guardar una sesión
// de 90 min como 2 clases de 45 (y la agenda para calcular duraciones). null =
// aún no configurado en la nube (el escritorio usa su valor local).
function getDuracionClase() {
  const n = Math.round(Number(getAjusteEmpresa('duracion_clase_min')));
  return Number.isFinite(n) && n >= 10 && n <= 240 ? n : null;
}

function setDuracionClase(min) {
  const n = Math.round(Number(min));
  if (!Number.isFinite(n) || n < 10 || n > 240) return getDuracionClase();
  if (getDuracionClase() === n) return n;
  addLog('ajustes', `Minutos por clase: ${n}`, []);
  setAjusteEmpresa('duracion_clase_min', n);
  return n;
}

// Rango de km por clase { min, max } (Ajustes → Clases y kilómetros). El
// escritorio lo usa al generar km; la web del móvil, cuando el profesor cierra
// una clase sin escribir el km final (los pone ella dentro de este rango).
// null = aún no configurado en la nube (cada lado usa 40–45).
function rangoKmLimpio(v) {
  const min = Math.round(Number(v && v.min)), max = Math.round(Number(v && v.max));
  return Number.isFinite(min) && Number.isFinite(max) && min >= 1 && max >= min && max <= 999 ? { min, max } : null;
}
function getRangoKm() {
  return rangoKmLimpio(getAjusteEmpresa('rango_km'));
}
function setRangoKm(rango) {
  const r = rangoKmLimpio(rango);
  if (!r) return getRangoKm();
  const actual = getRangoKm();
  if (actual && actual.min === r.min && actual.max === r.max) return r;
  addLog('ajustes', `Rango de km por clase: ${r.min}–${r.max} km`, []);
  setAjusteEmpresa('rango_km', r);
  return r;
}

// Km que pone el móvil cuando el profesor cierra una clase sin escribirlos:
// «entre min y max por cada 2 clases» (una sesión normal de 90 min; cada
// clase, la mitad). Distinto del rango de arriba, que es por práctica y lo
// usa el escritorio al generar km. Sin configurar, 40–50 (lo mismo en la web).
const KM_AUTO_MOVIL_DEFECTO = { min: 40, max: 50 };
function getKmAutoMovil() {
  return rangoKmLimpio(getAjusteEmpresa('km_auto_movil')) || { ...KM_AUTO_MOVIL_DEFECTO };
}
function setKmAutoMovil(rango) {
  const r = rangoKmLimpio(rango);
  if (!r) return getKmAutoMovil();
  const actual = rangoKmLimpio(getAjusteEmpresa('km_auto_movil'));
  if (actual && actual.min === r.min && actual.max === r.max) return r;
  addLog('ajustes', `Km automáticos del móvil: ${r.min}–${r.max} km cada 2 clases`, []);
  setAjusteEmpresa('km_auto_movil', r);
  return r;
}

// Conceptos de cobro de la empresa (Ajustes → Cobros): matrícula, tasa y lo
// que cada autoescuela quiera añadir (soporte informático, certificado...).
// Los marcados `alta` se cargan solos a cada alumno nuevo (escritorio y web).
// null = la empresa aún no los ha guardado nunca (el escritorio propone los
// importes antiguos de matrícula/tasa que vivían en localStorage).
const MAX_CONCEPTOS = 30;
const TIPOS_CONCEPTO = ['matricula', 'tasa', 'cargo'];

function _normalizarConceptos(lista) {
  const vistos = new Set();
  const limpia = [];
  for (const c of Array.isArray(lista) ? lista : []) {
    if (!c || typeof c !== 'object') continue;
    const nombre = String(c.nombre == null ? '' : c.nombre).replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!nombre || vistos.has(nombre.toLowerCase())) continue;
    const importe = Math.round(Math.max(0, Number(c.importe) || 0) * 100) / 100;
    const tipo = TIPOS_CONCEPTO.includes(c.tipo) ? c.tipo : 'cargo';
    const id = String(c.id || '').trim().slice(0, 40) || ('c' + Date.now().toString(36) + limpia.length);
    vistos.add(nombre.toLowerCase());
    limpia.push({ id, nombre, tipo, importe, alta: c.alta !== false });
    if (limpia.length >= MAX_CONCEPTOS) break;
  }
  return limpia;
}

function getConceptosCobro() {
  const v = getAjusteEmpresa('conceptos_cobro');
  return Array.isArray(v) ? _normalizarConceptos(v) : null;
}

function setConceptosCobro(lista) {
  const limpia = _normalizarConceptos(lista);
  addLog('ajustes', `Conceptos de cobro: ${limpia.length ? limpia.map(c => `${c.nombre} ${c.importe} €${c.alta ? ' (alta)' : ''}`).join(', ') : 'ninguno'}`, []);
  setAjusteEmpresa('conceptos_cobro', limpia);
  return limpia;
}

// Director del centro (Profesores → Director del centro): firma el certificado
// del pie de la ficha DGT. Ajuste compartido 'director' → { nombre, dni,
// profesor_id, firma }. Si el director también da clases (`profesor_id`), sus
// datos y su firma son los de ese profesor (una sola firma para todo).
const _texto = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

function _director(d) {
  const a = (d.ajustes_empresa || {}).director;
  const v = a && a.valor && typeof a.valor === 'object' ? a.valor : {};
  return {
    nombre: _texto(v.nombre, 80), dni: _texto(v.dni, 20),
    profesor_id: Number.isInteger(v.profesor_id) ? v.profesor_id : null,
    firma: firmaValida(v.firma) ? v.firma : null,
  };
}

// Director con los datos ya resueltos (los del profesor si lo es). Recibe el
// data.json ya cargado (lo usa también la ficha DGT).
function directorResuelto(d) {
  const v = _director(d);
  const prof = v.profesor_id != null ? (d.profesores || []).find(p => p.id === v.profesor_id && !p.deleted) : null;
  if (prof) return { nombre: prof.nombre || '', dni: prof.dni || '', profesor_id: prof.id, firma: firmaValida(prof.firma) ? prof.firma : null };
  return { nombre: v.nombre, dni: v.dni, profesor_id: null, firma: v.firma };
}

// Para la pantalla: sin la imagen (pesa), solo si la tiene.
function getDirector() {
  const { firma, ...resto } = directorResuelto(load());
  return { ...resto, tiene_firma: !!firma, configurado: !!(resto.nombre || resto.profesor_id || firma) };
}

// propia = la que se dibujó como director (aunque ahora el director sea un
// profesor); sin ella, la que sale en la ficha.
function getFirmaDirector(propia = false) {
  const d = load();
  return propia ? _director(d).firma : directorResuelto(d).firma;
}

// Quién es el director: un profesor (profesor_id) u otra persona (nombre, dni).
// Conserva la firma propia que ya tuviera.
function setDirector(datos = {}) {
  const d = load();
  const actual = _director(d);
  let profesor_id = datos.profesor_id == null || datos.profesor_id === '' ? null : parseInt(datos.profesor_id);
  let nombre = _texto(datos.nombre, 80), dni = _texto(datos.dni, 20).toUpperCase();
  if (profesor_id != null) {
    const prof = (d.profesores || []).find(p => p.id === profesor_id && !p.deleted);
    if (!prof) return { ok: false, error: 'Ese profesor ya no existe.' };
    nombre = prof.nombre || ''; dni = prof.dni || '';
  } else if (!nombre) {
    return { ok: false, error: 'Escribe el nombre del director.' };
  }
  addLog('ajustes', `Director del centro: ${nombre}${profesor_id != null ? ' (profesor)' : ''}`, []);
  setAjusteEmpresa('director', { nombre, dni, profesor_id, firma: actual.firma });
  return { ok: true };
}

// Guarda (o quita, con null) la firma del director. Si el director es un
// profesor, se guarda como la firma de ese profesor.
function setFirmaDirector(firma) {
  if (firma != null && !firmaValida(firma)) return { ok: false, error: 'La firma no es válida o es demasiado grande.' };
  const d = load();
  const actual = _director(d);
  if (actual.profesor_id != null && (d.profesores || []).some(p => p.id === actual.profesor_id && !p.deleted)) {
    return require('./profesores').setFirmaProfesor(actual.profesor_id, firma);
  }
  if (!actual.nombre) return { ok: false, error: 'Primero indica quién es el director.' };
  addLog('ajustes', firma ? 'Firma del director guardada' : 'Firma del director quitada', []);
  setAjusteEmpresa('director', { ...actual, firma: firma || null });
  return { ok: true };
}

module.exports = {
  getAjusteEmpresa, setAjusteEmpresa, getZonasPractica, setZonasPractica, getDuracionClase, setDuracionClase, MAX_ZONAS,
  getRangoKm, setRangoKm, getKmAutoMovil, setKmAutoMovil,
  getConceptosCobro, setConceptosCobro,
  directorResuelto, getDirector, getFirmaDirector, setDirector, setFirmaDirector,
};
