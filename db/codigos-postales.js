// ─── CÓDIGOS POSTALES ────────────────────────────────────────────────────────
// Código postal → provincia, municipio(s) y poblaciones. Lista de GeoNames
// (CC BY 4.0) en assets/codigos-postales-es.json, generada con
// scripts/generar-codigos-postales.js. Se carga la primera vez que se pide
// (≈1 MB) y funciona sin conexión.
const fs = require('fs');
const path = require('path');

const ARCHIVO_CP = path.join(__dirname, '..', 'assets', 'codigos-postales-es.json');
const PROVINCIAS_CP = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz',
  '07': 'Illes Balears', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
  '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca', '17': 'Girona', '18': 'Granada',
  '19': 'Guadalajara', '20': 'Gipuzkoa', '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
  '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia', '41': 'Sevilla',
  '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid',
  '48': 'Bizkaia', '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla'
};

let _datosCP = null;
function _cargarCP() {
  if (_datosCP) return _datosCP;
  try { _datosCP = JSON.parse(fs.readFileSync(ARCHIVO_CP, 'utf8')); } catch (e) { _datosCP = { nombres: [], cp: {} }; }
  return _datosCP;
}

// → { cp, provincia, municipios: [], lugares: [] } o null si no es un código válido
function buscarCodigoPostal(texto) {
  let cp = String(texto || '').replace(/\s/g, '');
  if (/^\d{4}$/.test(cp)) cp = '0' + cp;
  if (!/^\d{5}$/.test(cp)) return null;
  const provincia = PROVINCIAS_CP[cp.slice(0, 2)];
  if (!provincia) return null;
  const d = _cargarCP();
  const e = d.cp[cp];
  if (!e) return { cp, provincia, municipios: [], lugares: [], desconocido: true };
  return { cp, provincia, municipios: e[0].map(i => d.nombres[i]), lugares: e[1].map(i => d.nombres[i]) };
}

module.exports = { buscarCodigoPostal, PROVINCIAS_CP };
