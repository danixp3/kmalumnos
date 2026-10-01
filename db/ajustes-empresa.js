/**
 * db/ajustes-empresa.js  –  ajustes compartidos con la web del móvil (tabla
 * `ajustes_empresa` de Supabase, migración 2026-10-01). Se guardan en
 * data.json como { clave: { valor, updated_at } } y sync.js los sube/baja
 * (gana el más reciente). Primer uso: las zonas de prácticas que el profesor
 * marca en el móvil como "Zonas recorridas".
 */

// ─── AJUSTES COMPARTIDOS ─────────────────────────────────────────────────────

const { load, save, _sync, addLog } = require('./core');

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

module.exports = {
  getAjusteEmpresa, setAjusteEmpresa, getZonasPractica, setZonasPractica, getDuracionClase, setDuracionClase, MAX_ZONAS,
  getConceptosCobro, setConceptosCobro
};
