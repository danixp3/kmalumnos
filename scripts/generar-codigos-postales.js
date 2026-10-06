// Genera assets/codigos-postales-es.json a partir del fichero ES.txt de GeoNames
// (https://download.geonames.org/export/zip/ES.zip, licencia CC BY 4.0: hay que
// citar a GeoNames, ver «Licencias de terceros» en Ajustes → Legal).
//
//   node scripts/generar-codigos-postales.js ruta/a/ES.txt
//
// Formato de salida (compacto, ~400 KB):
//   { fuente, fecha, nombres: [...], cp: { "32630": [[municipios], [otros lugares]] } }
// con los municipios y lugares como índices en `nombres`.
const fs = require('fs');
const path = require('path');

const origen = process.argv[2];
if (!origen) { console.error('Uso: node scripts/generar-codigos-postales.js ES.txt'); process.exit(1); }

const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// «Acebeda, La» → «La Acebeda»; «Eirexa, A (Quintela Canedo)» → «A Eirexa (Quintela Canedo)»
function darVuelta(nombre) {
  const m = nombre.match(/^([^,(]+),\s*([^,(]+?)(\s*\(.*\))?$/);
  if (!m) return nombre;
  const art = m[2].trim();
  if (!/^(el|la|los|las|l'|o|a|os|as|es|sa|ses|s'|els|les|lo|un|una)$/i.test(art)) return nombre;
  const unir = /'$/.test(art) ? '' : ' ';
  return `${art}${unir}${m[1].trim()}${m[3] || ''}`;
}

// «Xinzo De Limia» → «Xinzo de Limia» (partículas en minúscula salvo al principio)
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'da', 'do', 'das', 'dos', 'en', 'i', 'a', 'o', 'as', 'os', 'les', 'els']);
function particulas(nombre) {
  return nombre.split(' ').map((p, i) => (i > 0 && PARTICULAS.has(p.toLowerCase()) ? p.toLowerCase() : p)).join(' ')
    .replace(/\b(D|L)'/g, (x, l) => l.toLowerCase() + "'");
}

const filas = fs.readFileSync(origen, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));
const porCp = new Map();
for (const f of filas) {
  const cp = f[1];
  if (!/^\d{5}$/.test(cp)) continue;
  if (!porCp.has(cp)) porCp.set(cp, { municipios: new Map(), lugares: new Map() });
  const e = porCp.get(cp);
  const muni = particulas(darVuelta((f[7] || '').trim()));
  if (muni) e.municipios.set(sinTildes(muni), muni);
  let lugar = particulas(darVuelta((f[2] || '').trim()));
  if (!lugar) continue;
  // GeoNames pierde tildes en muchos lugares: si coincide con el municipio, su forma buena
  const clave = sinTildes(lugar);
  if (e.municipios.has(clave)) lugar = e.municipios.get(clave);
  e.lugares.set(clave, lugar);
}

const nombres = [];
const indice = new Map();
const idx = s => { if (!indice.has(s)) { indice.set(s, nombres.length); nombres.push(s); } return indice.get(s); };
const cp = {};
for (const [codigo, e] of [...porCp.entries()].sort()) {
  const munis = [...e.municipios.values()];
  const otros = [...e.lugares.entries()].filter(([k]) => !e.municipios.has(k)).map(([, v]) => v)
    .sort((a, b) => a.localeCompare(b, 'es'));
  cp[codigo] = [munis.map(idx), otros.map(idx)];
}

const salida = {
  fuente: 'GeoNames (www.geonames.org), CC BY 4.0',
  fecha: new Date().toISOString().slice(0, 10),
  nombres,
  cp
};
const destino = path.join(__dirname, '..', 'assets', 'codigos-postales-es.json');
fs.writeFileSync(destino, JSON.stringify(salida));
console.log(`${Object.keys(cp).length} códigos postales, ${nombres.length} nombres → ${destino} (${Math.round(fs.statSync(destino).size / 1024)} KB)`);
