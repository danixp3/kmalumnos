// ─── PROBADOR EXHAUSTIVO DE INTERFAZ (FUZZER) ─────────────────────────────────
// Recorre la app sección por sección y, en cada una, clica cada botón, cambia
// cada pestaña y abre cada modal probando BATERÍAS de combinaciones de campos
// (todo vacío, solo texto, solo selects, todo válido, valores inválidos) para
// ver si algo rompe. Captura errores de consola, excepciones y promesas
// rechazadas.
//
//   npm run fuzz
//
// SEGURIDAD (imprescindible, este PC sincroniza con producción):
//  - Antes de arrancar mueve `sync_creds.json` aparte → la app corre en LOCAL,
//    sin subir NADA a Supabase.
//  - Respalda `data.json` y lo restaura al terminar → las altas/bajas de prueba
//    no dejan rastro.
//  - No pulsa botones que abran ventanas nativas de Windows (selectores de
//    fichero: importar/exportar/copia de seguridad/foto/documento) para no
//    bloquear la ejecución.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const USERDATA = path.join(process.env.APPDATA || (process.env.HOME + '/.config'), 'KMAlumnos');
const DATA = path.join(USERDATA, 'data.json');
const CREDS = path.join(USERDATA, 'sync_creds.json');
const DATA_BAK = DATA + '.fuzzbak';
const CREDS_BAK = CREDS + '.fuzzbak';

// ── Aislamiento ANTES de arrancar la app (main.js lee creds en whenReady) ──
let credsMovidas = false;
try {
  if (fs.existsSync(DATA)) fs.copyFileSync(DATA, DATA_BAK);
  if (fs.existsSync(CREDS)) { fs.renameSync(CREDS, CREDS_BAK); credsMovidas = true; }
} catch (e) { console.error('No se pudo aislar el entorno de prueba:', e.message); process.exit(1); }

function restaurarEntorno() {
  try { if (fs.existsSync(DATA_BAK)) { fs.copyFileSync(DATA_BAK, DATA); fs.unlinkSync(DATA_BAK); } } catch (e) {}
  try { if (credsMovidas && fs.existsSync(CREDS_BAK)) { fs.renameSync(CREDS_BAK, CREDS); } } catch (e) {}
}

const fallos = [];
const info = [];
let win = null;
const IGNORAR = [/Insecure Content-Security-Policy/, /nativo desactivado/];

app.on('browser-window-created', (_e, w) => {
  win = w;
  w.webContents.on('console-message', (_ev, level, msg, linea, src) => {
    if (level < 2 || IGNORAR.some(r => r.test(msg))) return;
    fallos.push(`[consola] ${msg} (${src}:${linea})`);
  });
  w.webContents.on('render-process-gone', (_ev, d) => fallos.push(`[CRASH] ${JSON.stringify(d)}`));
});
process.on('uncaughtException', e => fallos.push(`[main] ${e && e.stack}`));

const espera = ms => new Promise(r => setTimeout(r, ms));
const ev = js => {
  const w = BrowserWindow.getAllWindows().find(x => { try { return /index\.html/i.test(x.webContents.getURL()); } catch (e) { return false; } }) || win;
  return w.webContents.executeJavaScript(js);
};

// Watchdog global: pase lo que pase, cerrar y restaurar.
const WATCHDOG_MS = 600000;
setTimeout(() => { fallos.push('[fuzz] watchdog: tope de tiempo'); terminar(); }, WATCHDOG_MS).unref();

let terminado = false;
function terminar() {
  if (terminado) return; terminado = true;
  restaurarEntorno();
  console.log('\n===== FUZZ UI =====');
  info.forEach(l => console.log(l));
  if (fallos.length) {
    console.log('\n-- posibles fallos (' + fallos.length + ') --');
    // Deduplicar
    const vistos = new Set();
    for (const f of fallos) { if (!vistos.has(f)) { vistos.add(f); console.log('  ' + f); } }
    console.log('\nFUZZ-FALLOS (' + vistos.size + ' únicos)');
  } else {
    console.log('\nFUZZ-OK: ninguna combinación rompió la interfaz');
  }
  try { BrowserWindow.getAllWindows().forEach(w => w.destroy()); } catch (e) {}
  app.exit(fallos.length ? 1 : 0);
}

// Botones cuyo texto NO se debe pulsar: abren ventanas nativas del sistema
// (selector/guardado de fichero) que bloquearían la prueba.
const NO_PULSAR = /csv|importar|exportar|copia de seguridad|hacer copia|backup|restaurar|foto|documento|adjuntar|imprimir|pdf|cerrar sesión|salir|actualizaci/i;

// Recoge errores acumulados en la página desde la última llamada.
async function drenarErroresPagina(etiqueta) {
  const errs = await ev(`(function(){ var e = window.__fuzzErrs || []; window.__fuzzErrs = []; return e; })()`);
  for (const e of errs) fallos.push(`[${etiqueta}] ${e}`);
}

// Batería de combinaciones para rellenar un contenedor (modal o página).
// modo: 'vacio' | 'texto' | 'selects' | 'valido' | 'invalido'
const RELLENAR_FN = `
function fuzzRellenar(cont, modo){
  var hoy = new Date().toISOString().slice(0,10);
  var campos = cont.querySelectorAll('input, select, textarea');
  campos.forEach(function(el){
    if (el.type === 'file' || el.disabled || el.readOnly) return;
    var idl = (el.id||'').toLowerCase();
    if (el.type === 'checkbox' || el.type === 'radio') {
      if (modo === 'valido' || modo === 'invalido') el.checked = (modo === 'valido');
      return;
    }
    if (el.tagName === 'SELECT') {
      if (modo === 'vacio' || modo === 'texto') { el.selectedIndex = 0; }
      else {
        var op = Array.from(el.options).find(function(o){ return o.value !== ''; });
        if (op) el.value = op.value;
      }
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return;
    }
    var v = '';
    if (modo === 'vacio') v = '';
    else if (modo === 'texto') v = (el.type==='number'||el.type==='date'||el.type==='time') ? '' : 'PRUEBA_FUZZ';
    else if (modo === 'selects') v = '';
    else if (modo === 'valido') {
      if (el.type === 'number') v = '5';
      else if (el.type === 'date' || /fecha|desde|hasta|caduc|compra|inicio|fin/.test(idl)) v = hoy;
      else if (el.type === 'time') v = '09:30';
      else if (el.type === 'email' || /email|correo/.test(idl)) v = 'fuzz@ejemplo.com';
      else v = 'PRUEBA_FUZZ';
    } else { // invalido
      if (el.type === 'number') v = '-99999';
      else if (el.type === 'date') v = '9999-99-99';
      else if (el.type === 'time') v = '99:99';
      else if (el.type === 'email' || /email|correo/.test(idl)) v = 'esto no es un email';
      else v = 'x'.repeat(600) + ' <script>&\\"\\'';
    }
    el.value = v;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  return campos.length;
}`;

async function inicializarPagina() {
  await ev(`
    window.__fuzzErrs = [];
    window.addEventListener('error', function(e){ window.__fuzzErrs.push('ERROR: ' + e.message + ' @' + (e.filename||'') + ':' + (e.lineno||'')); });
    window.addEventListener('unhandledrejection', function(e){ window.__fuzzErrs.push('REJECTION: ' + ((e.reason && (e.reason.stack||e.reason.message)) || e.reason)); });
    // Sin diálogos que bloqueen ni impresión ni tutorial durante el fuzz:
    window.print = function(){};
    try { if (typeof cerrarTutorial==='function') cerrarTutorial(false); } catch(e){}
    try { comprobarTutorial = function(){}; } catch(e){}
    // Auto-aceptar los diálogos propios en cuanto aparezcan (así se ejercita el
    // camino completo de cada acción). Los datos se restauran al final.
    (function(){
      var obs = setInterval(function(){
        var ov = document.getElementById('modal-dialogo');
        if (ov && ov.classList.contains('open')) {
          var b = document.getElementById('dlg-aceptar');
          if (b) b.click();
        }
      }, 120);
      window.__fuzzDlgObs = obs;
    })();
    ${RELLENAR_FN}
    true;
  `);
}

async function cerrarOverlays() {
  await ev(`document.querySelectorAll('.overlay.open').forEach(function(o){ if(o.id!=='modal-dialogo') o.classList.remove('open'); }); true;`);
}

const COMBOS = ['vacio', 'texto', 'selects', 'valido', 'invalido'];

// Fuzz de un modal ya abierto: prueba cada combinación y pulsa "guardar".
async function fuzzModalAbierto(etiqueta) {
  for (const modo of COMBOS) {
    const abierto = await ev(`!!document.querySelector('.overlay.open:not(#modal-dialogo)')`);
    if (!abierto) return; // el modal se cerró (p.ej. guardó); no hay más que probar
    await ev(`(function(){
      var ov = document.querySelector('.overlay.open:not(#modal-dialogo)');
      if (!ov) return;
      fuzzRellenar(ov, '${modo}');
      var g = Array.from(ov.querySelectorAll('button')).find(function(x){ return /guardar|a\\u00f1adir|registrar|crear|aceptar|confirmar|corregir|convertir/i.test(x.textContent||''); });
      if (g) g.click();
    })()`);
    await espera(350);
    await drenarErroresPagina(etiqueta + '/' + modo);
    // si tras guardar quedó abierto (validación), seguimos con el siguiente modo
  }
  await cerrarOverlays();
}

async function fuzzSeccion(page) {
  // pestañas internas de la página (page-tab), si las hay
  const tabs = await ev(`Array.from(document.querySelectorAll('#page-${page} .page-tab')).map(function(t){return t.dataset.tab||t.textContent.trim();})`);
  const contextos = tabs.length ? tabs : [null];

  for (const tab of contextos) {
    if (tab) {
      await ev(`(function(){
        var t = Array.from(document.querySelectorAll('#page-${page} .page-tab')).find(function(x){ return (x.dataset.tab||x.textContent.trim())==='${tab}'; });
        if (t) t.click();
      })()`);
      await espera(500);
      await drenarErroresPagina(page + ' [tab ' + tab + ']');
    }

    // Rellenar los inputs sueltos de la página (filtros, formularios en línea)
    // con cada combinación y disparar sus eventos (por si algún handler rompe).
    for (const modo of ['valido', 'invalido', 'vacio']) {
      await ev(`(function(){
        var pg = document.getElementById('page-${page}'); if (!pg) return;
        // solo inputs directos de la página, no los de dentro de modales
        var cont = document.createElement('div');
        fuzzRellenar(pg, '${modo}');
      })()`);
      await espera(150);
      await drenarErroresPagina(page + ' filtros/' + modo);
    }

    // Botones de la página (sin los que abren ventanas nativas)
    const nBotones = await ev(`(function(){
      var pg = document.getElementById('page-${page}'); if (!pg) return 0;
      window.__fuzzBotones = Array.from(pg.querySelectorAll('button')).filter(function(b){
        return b.offsetParent !== null && !${NO_PULSAR}.test(b.textContent||'');
      });
      return window.__fuzzBotones.length;
    })()`);

    for (let i = 0; i < nBotones; i++) {
      const info1 = await ev(`(function(){
        var b = window.__fuzzBotones[${i}];
        if (!b || b.offsetParent === null) return 'skip';
        b.click();
        return (b.textContent||'').trim().slice(0,24);
      })()`);
      await espera(250);
      // Si abrió un modal, fuzzéalo a fondo
      const hayModal = await ev(`!!document.querySelector('.overlay.open:not(#modal-dialogo)')`);
      if (hayModal) {
        await fuzzModalAbierto(page + ' modal[' + info1 + ']');
      }
      await drenarErroresPagina(page + ' botón[' + info1 + ']');
      await cerrarOverlays();
      await espera(60);
    }
  }
}

async function principal() {
  // esperar interfaz
  for (let i = 0; i < 60; i++) { try { if (await ev(`document.querySelectorAll('#sidebar nav a').length`) > 0) break; } catch (e) {} await espera(500); }
  await espera(1500);
  await inicializarPagina();

  const paginas = await ev(`Array.from(document.querySelectorAll('#sidebar nav a')).map(function(a){return a.dataset.page;}).filter(Boolean)`);
  info.push('secciones a recorrer: ' + paginas.length + ' (' + paginas.join(', ') + ')');

  for (const page of paginas) {
    await ev(`(function(){ var a=document.querySelector('#sidebar nav a[data-page="${page}"]'); if(a) a.click(); })()`);
    await espera(900);
    await inicializarPagina(); // re-enganchar capturadores por si algo los recreó
    await drenarErroresPagina('navegar ' + page);
    try {
      await fuzzSeccion(page);
      info.push('  ' + page + ': recorrida');
    } catch (e) {
      fallos.push('[' + page + '] excepción en el fuzzer: ' + (e && e.message));
    }
    await cerrarOverlays();
  }
}

principal().catch(e => fallos.push('[fuzz] ' + (e && e.stack))).finally(terminar);

require('../main.js');
