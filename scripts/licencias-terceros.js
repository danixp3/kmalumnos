// Genera assets/licencias-terceros.json (Ajustes → Legal y privacidad →
// Licencias de terceros) con los componentes que van dentro del programa:
// dependencias de producción (y las suyas), Electron/Chromium, fuentes y datos.
//   node scripts/licencias-terceros.js
// Volver a ejecutarlo al cambiar dependencias.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const arbol = JSON.parse(execSync('npm ls --omit=dev --all --json --long', { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const vistos = new Map();
(function recorrer(deps) {
  for (const [nombre, info] of Object.entries(deps || {})) {
    const clave = nombre + '@' + (info.version || '');
    if (vistos.has(clave)) continue;
    if (!info.version) continue; // dependencia opcional no instalada
    let licencia = '', autor = '';
    try {
      // En la raíz o anidada dentro de otro paquete (otra versión)
      const candidatos = [path.join(raiz, 'node_modules', nombre, 'package.json'), ...(info.path ? [path.join(info.path, 'package.json')] : [])];
      const pkg = candidatos.map(f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } })
        .filter(Boolean).sort((a, b) => (b.version === info.version) - (a.version === info.version))[0] || {};
      licencia = typeof pkg.license === 'string' ? pkg.license : (pkg.license && pkg.license.type) || (Array.isArray(pkg.licenses) ? pkg.licenses.map(l => l.type || l).join(' / ') : '');
      autor = typeof pkg.author === 'string' ? pkg.author.replace(/\s*<[^>]*>/, '').replace(/\s*\([^)]*\)/, '') : (pkg.author && pkg.author.name) || '';
    } catch (e) { /* paquete opcional no instalado */ }
    vistos.set(clave, { nombre, version: info.version || '', licencia: licencia || 'Ver el paquete', autor });
    recorrer(info.dependencies);
  }
})(arbol.dependencies);

const electron = require(path.join(raiz, 'node_modules', 'electron', 'package.json'));
const extra = [
  { nombre: 'Electron', version: electron.version, licencia: 'MIT', autor: 'OpenJS Foundation and Electron contributors' },
  { nombre: 'Chromium', version: '', licencia: 'BSD-3-Clause y otras (ver chrome://credits)', autor: 'The Chromium Authors' },
  { nombre: 'Node.js', version: '', licencia: 'MIT', autor: 'Node.js contributors' },
  { nombre: 'Barlow y Barlow Condensed (tipografías)', version: '', licencia: 'SIL Open Font License 1.1', autor: 'Jeremy Tribby' },
  { nombre: 'IBM Plex Mono (tipografía)', version: '', licencia: 'SIL Open Font License 1.1', autor: 'IBM Corp.' },
  { nombre: 'Códigos postales de España', version: '', licencia: 'CC BY 4.0', autor: 'GeoNames (www.geonames.org)' },
  { nombre: 'Iconos estilo Lucide', version: '', licencia: 'ISC', autor: 'Lucide contributors' }
];
const lista = [...extra, ...[...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))];
fs.writeFileSync(path.join(raiz, 'assets', 'licencias-terceros.json'), JSON.stringify(lista, null, 1) + '\n');
console.log(lista.length, 'componentes → assets/licencias-terceros.json');
