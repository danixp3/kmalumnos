// ─── CAPTURAS PARA REVISAR PANTALLAS ────────────────────────────────────────
// Arranca la app sobre una COPIA de los datos y SIN nube, abre las pantallas
// que se le pidan y guarda una captura de cada una en %TEMP%\aulamovil-capturas.
//
//   npx electron scripts/capturas-revision.js
//
// Útil tras cambiar una ventana o un aviso (se ven con los datos reales sin
// tocarlos). Cada paso: [nombre, código que se ejecuta en la página].
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SALIDA = path.join(os.tmpdir(), 'aulamovil-capturas');
const UD = path.join(SALIDA, 'datos');
const espera = ms => new Promise(r => setTimeout(r, ms));

const sync = require('../sync');
for (const f of ['sync', 'pushAll', 'startAutoSync', 'stopAutoSync']) if (typeof sync[f] === 'function') sync[f] = async () => ({ ok: true });
require('../main.js');
fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(UD, { recursive: true });
const real = path.join(app.getPath('appData'), 'KMAlumnos', 'data.json');
if (fs.existsSync(real)) fs.copyFileSync(real, path.join(UD, 'data.json'));
app.setPath('userData', UD);

const ventana = () => BrowserWindow.getAllWindows().find(w => { try { return /index\.html/i.test(w.webContents.getURL()); } catch (e) { return false; } });
const ev = js => ventana().webContents.executeJavaScript(js);

// CAPTURAS_PASOS=ruta/a/pasos.js (module.exports = [[nombre, js], ...]) para no editar este archivo
const PASOS = process.env.CAPTURAS_PASOS ? require(path.resolve(process.env.CAPTURAS_PASOS)) : [
  ['alumnos-lista', `navegarA('alumnos'); true`],
  ['separar-nombres', `abrirSepararNombres(); true`],
  ['repetidos', `closeModal('modal-separar-nombres'); abrirAlumnosRepetidos(); true`],
  ['fusion-previa', `(async () => { closeModal('modal-alumnos-repetidos'); const r = await window.api.buscarAlumnosRepetidos(); if (r[0]) await abrirFusionAlumnos(r[0].queda, r[0].seVa); else { const l = await window.api.getAlumnos(); await abrirFusionAlumnos(l[0].id, l[1].id); } return true; })()`],
  ['puesta-en-marcha', `closeModal('modal-fusion-alumnos'); navegarA('puesta-en-marcha'); true`],
  ['anotar-clases', `(async () => { const l = await window.api.getPuestaEnMarcha(); const a = l.alumnos.find(x => x.id); if (a) await pmAnotar(a.id); return true; })()`]
];

async function principal() {
  for (let t = Date.now(); Date.now() - t < 30000;) { try { if (await ev(`document.querySelectorAll('#sidebar nav a').length`) > 0) break; } catch (e) {} await espera(400); }
  await espera(1500);
  await ev(`try{cerrarTutorial(false)}catch(e){}; try{comprobarTutorial=function(){}}catch(e){}; try{comprobarBienvenida=async function(){}}catch(e){};
    try{mostrarAppPorGate()}catch(e){}; document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open')); true`);
  // CAPTURAS_TAM=1920x1080 para otro tamaño de ventana
  const [ancho, alto] = (process.env.CAPTURAS_TAM || '1366x768').split('x').map(Number);
  const v = ventana(); if (v.isMaximized()) v.unmaximize(); v.setContentSize(ancho, alto); await espera(600);
  for (const [nombre, js] of PASOS) {
    // Lo que devuelve el paso (si no es true) se muestra: sirve para medir anchos, contar cosas…
    try { const r = await ev(js); if (r !== true && r !== undefined) console.log(nombre, '→', typeof r === 'string' ? r : JSON.stringify(r)); } catch (e) { console.log(nombre, 'ERROR', e.message); }
    await espera(1400);
    const img = await v.webContents.capturePage();
    fs.writeFileSync(path.join(SALIDA, nombre + '.png'), img.toPNG());
    console.log('captura', nombre);
  }
  console.log('CAPTURAS-OK', SALIDA);
  app.exit(0);
}
app.whenReady().then(() => setTimeout(() => principal().catch(e => { console.error(e); app.exit(1); }), 500));
