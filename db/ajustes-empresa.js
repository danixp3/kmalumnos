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

module.exports = { getAjusteEmpresa, setAjusteEmpresa, getZonasPractica, setZonasPractica, getDuracionClase, setDuracionClase, MAX_ZONAS };
