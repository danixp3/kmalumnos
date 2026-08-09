// ─── PROBADOR EXHAUSTIVO DE INTERFAZ (FUZZER) ─────────────────────────────────
// Recorre la app sección por sección y, en cada una, clica cada botón, cambia
// cada pestaña y abre cada modal probando BATERÍAS de combinaciones de campos
// (todo vacío, solo texto, solo selects, todo válido, valores inválidos) para
// ver si algo rompe. Captura errores de consola, excepciones y promesas
// rechazadas.
//
//   npm run fuzz
//
// SEGURIDAD (este PC sincroniza con producción):
//  - Mantiene la sesión iniciada (para que la app RENDERICE de verdad: sin
//    cuenta conectada, el gate de bienvenida deja la pantalla en blanco y el
//    fuzz no probaría nada — falso positivo), pero BLOQUEA la red de DATOS de
//    Supabase (`/rest/`): deja pasar solo el login (`/auth/`). Así ninguna
//    alta/baja/edición de prueba llega a la nube.
//  - Respalda `data.json` y lo restaura al terminar (las escrituras locales,
//    que ocurren aunque no haya red, no dejan rastro).
//  - No pulsa botones que abran ventanas nativas de Windows (selectores de
//    fichero) para no bloquear la ejecución.
//  - AUTO-VERIFICA que la interfaz está renderizada (sidebar + página con
//    contenido) antes de recorrer; si estuviera en blanco, aborta con error en
//    vez de dar un falso "todo bien".

// ── Bloqueo de la red de DATOS ANTES de arrancar la app (sync.js usa fetch) ──
// Debe hacerse antes de require('../main.js') para que el cliente de Supabase
// use ya el fetch capado.
const _fetch = global.fetch;
global.fetch = function (url, opts) {
  const u = String(url && url.url ? url.url : url);
  if (/supabase\.co\/(rest|realtime|storage)\//i.test(u)) {
    // Datos: se simula una respuesta vacía OK para que el sync crea que fue
    // bien y no haga ruido, pero SIN tocar la base de datos real.
    return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return _fetch.apply(this, arguments); // /auth/ y demás sí pasan (login real)
};

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const USERDATA = path.join(process.env.APPDATA || (process.env.HOME + '/.config'), 'KMAlumnos');
const DATA = path.join(USERDATA, 'data.json');
const DATA_BAK = DATA + '.fuzzbak';
try { if (fs.existsSync(DATA)) fs.copyFileSync(DATA, DATA_BAK); } catch (e) { console.error('No se pudo respaldar data.json:', e.message); process.exit(1); }
function restaurarDatos() { try { if (fs.existsSync(DATA_BAK)) { fs.copyFileSync(DATA_BAK, DATA); fs.unlinkSync(DATA_BAK); } } catch (e) {} }

const fallos = [];
const info = [];
let win = null;
const IGNORAR = [/Insecure Content-Security-Policy/, /nativo desactivado/, /Failed to fetch|NetworkError|supabase/i];

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

const WATCHDOG_MS = 600000;
setTimeout(() => { fallos.push('[fuzz] watchdog: tope de tiempo'); terminar(); }, WATCHDOG_MS).unref();

let terminado = false;
function terminar() {
  if (terminado) return; terminado = true;
  restaurarDatos();
  console.log('\n===== FUZZ UI =====');
  info.forEach(l => console.log(l));
  if (fallos.length) {
    console.log('\n-- posibles fallos --');
    const vistos = new Set();
    for (const f of fallos) { if (!vistos.has(f)) { vistos.add(f); console.log('  ' + f); } }
    console.log('\nFUZZ-FALLOS (' + vistos.size + ' únicos)');
  } else {
    console.log('\nFUZZ-OK: ninguna combinación rompió la interfaz');
  }
  try { BrowserWindow.getAllWindows().forEach(w => w.destroy()); } catch (e) {}
  app.exit(fallos.length ? 1 : 0);
}

const NO_PULSAR = /csv|importar|exportar|copia de seguridad|hacer copia|backup|restaurar|foto|documento|adjuntar|imprimir|pdf|cerrar sesión|salir|actualizaci/i;

async function drenarErroresPagina(etiqueta) {
  const errs = await ev(`(function(){ var e = window.__fuzzErrs || []; window.__fuzzErrs = []; return e; })()`);
  for (const e of errs) fallos.push(`[${etiqueta}] ${e}`);
}

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
      else { var op = Array.from(el.options).find(function(o){ return o.value !== ''; }); if (op) el.value = op.value; }
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
    } else {
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
    window.__fuzzErrs = window.__fuzzErrs || [];
    if (!window.__fuzzHooked) {
      window.__fuzzHooked = true;
      window.addEventListener('error', function(e){ window.__fuzzErrs.push('ERROR: ' + e.message + ' @' + (e.filename||'') + ':' + (e.lineno||'')); });
      window.addEventListener('unhandledrejection', function(e){ window.__fuzzErrs.push('REJECTION: ' + ((e.reason && (e.reason.stack||e.reason.message)) || e.reason)); });
    }
    window.print = function(){};
    try { if (typeof cerrarTutorial==='function') cerrarTutorial(false); } catch(e){}
    try { comprobarTutorial = function(){}; } catch(e){}
    if (!window.__fuzzDlgObs) {
      window.__fuzzDlgObs = setInterval(function(){
        var ov = document.getElementById('modal-dialogo');
        if (ov && ov.classList.contains('open')) { var b = document.getElementById('dlg-aceptar'); if (b) b.click(); }
      }, 120);
    }
    ${RELLENAR_FN}
    true;
  `);
}

async function cerrarOverlays() {
  await ev(`document.querySelectorAll('.overlay.open').forEach(function(o){ if(o.id!=='modal-dialogo') o.classList.remove('open'); }); true;`);
}

// AUTO-VERIFICACIÓN: ¿está la app realmente renderizada (no en el gate/blanco)?
async function comprobarRenderizado() {
  const est = await ev(`(function(){
    var gate = document.getElementById('modal-bienvenida');
    var sb = document.getElementById('sidebar');
    var dash = document.getElementById('page-dashboard');
    return {
      gateAbierto: gate ? gate.classList.contains('open') : false,
      sidebarVisible: sb ? sb.offsetParent !== null : false,
      dashContenido: dash ? dash.innerHTML.length : 0,
      dashVisible: dash ? dash.offsetParent !== null : false
    };
  })()`);
  info.push('render: sidebar=' + est.sidebarVisible + ' dashVisible=' + est.dashVisible + ' gate=' + est.gateAbierto);
  if (est.gateAbierto || !est.sidebarVisible || !est.dashVisible) {
    fallos.push('[fuzz] la app NO está renderizada (gate de cuenta abierto o pantalla en blanco): la sesión no se inició. El fuzz habría dado un falso positivo; se aborta.');
    return false;
  }
  return true;
}

const COMBOS = ['vacio', 'texto', 'selects', 'valido', 'invalido'];

async function fuzzModalAbierto(etiqueta) {
  for (const modo of COMBOS) {
    const abierto = await ev(`!!document.querySelector('.overlay.open:not(#modal-dialogo)')`);
    if (!abierto) return;
    await ev(`(function(){
      var ov = document.querySelector('.overlay.open:not(#modal-dialogo)');
      if (!ov) return;
      fuzzRellenar(ov, '${modo}');
      var g = Array.from(ov.querySelectorAll('button')).find(function(x){ return /guardar|a\\u00f1adir|registrar|crear|aceptar|confirmar|corregir|convertir/i.test(x.textContent||''); });
      if (g) g.click();
    })()`);
    await espera(350);
    await drenarErroresPagina(etiqueta + '/' + modo);
  }
  await cerrarOverlays();
}

async function fuzzSeccion(page) {
  const tabs = await ev(`Array.from(document.querySelectorAll('#page-${page} .page-tab')).map(function(t){return t.dataset.tab||t.textContent.trim();})`);
  const contextos = tabs.length ? tabs : [null];

  for (const tab of contextos) {
    if (tab) {
      await ev(`(function(){ var t = Array.from(document.querySelectorAll('#page-${page} .page-tab')).find(function(x){ return (x.dataset.tab||x.textContent.trim())==='${tab}'; }); if (t) t.click(); })()`);
      await espera(500);
      await drenarErroresPagina(page + ' [tab ' + tab + ']');
    }

    for (const modo of ['valido', 'invalido', 'vacio']) {
      await ev(`(function(){ var pg = document.getElementById('page-${page}'); if (pg) fuzzRellenar(pg, '${modo}'); })()`);
      await espera(150);
      await drenarErroresPagina(page + ' filtros/' + modo);
    }

    const nBotones = await ev(`(function(){
      var pg = document.getElementById('page-${page}'); if (!pg) return 0;
      window.__fuzzBotones = Array.from(pg.querySelectorAll('button')).filter(function(b){ return b.offsetParent !== null && !${NO_PULSAR}.test(b.textContent||''); });
      return window.__fuzzBotones.length;
    })()`);

    for (let i = 0; i < nBotones; i++) {
      const info1 = await ev(`(function(){ var b = window.__fuzzBotones[${i}]; if (!b || b.offsetParent === null) return 'skip'; b.click(); return (b.textContent||'').trim().slice(0,24); })()`);
      await espera(250);
      const hayModal = await ev(`!!document.querySelector('.overlay.open:not(#modal-dialogo)')`);
      if (hayModal) await fuzzModalAbierto(page + ' modal[' + info1 + ']');
      await drenarErroresPagina(page + ' botón[' + info1 + ']');
      await cerrarOverlays();
      await espera(60);
    }
  }
}

async function principal() {
  for (let i = 0; i < 60; i++) { try { if (await ev(`document.querySelectorAll('#sidebar nav a').length`) > 0) break; } catch (e) {} await espera(500); }
  await espera(3000); // dar tiempo al login real (auth) y al render tras el gate
  await inicializarPagina();

  // Nada de recorrer si la app está en blanco: eso sería un falso positivo.
  if (!await comprobarRenderizado()) return;

  const paginas = await ev(`Array.from(document.querySelectorAll('#sidebar nav a')).map(function(a){return a.dataset.page;}).filter(Boolean)`);
  info.push('secciones a recorrer: ' + paginas.length + ' (' + paginas.join(', ') + ')');

  for (const page of paginas) {
    await ev(`(function(){ var a=document.querySelector('#sidebar nav a[data-page="${page}"]'); if(a) a.click(); })()`);
    await espera(900);
    await inicializarPagina();
    // Verificar que la sección se muestra de verdad (no en blanco)
    const visible = await ev(`(function(){ var p=document.getElementById('page-${page}'); return p ? (p.offsetParent!==null && p.innerHTML.length>20) : false; })()`);
    if (!visible) { fallos.push('[' + page + '] la sección no se renderiza (página vacía o no visible)'); continue; }
    await drenarErroresPagina('navegar ' + page);
    try {
      await fuzzSeccion(page);
      info.push('  ' + page + ': recorrida (visible ✓)');
    } catch (e) {
      fallos.push('[' + page + '] excepción en el fuzzer: ' + (e && e.message));
    }
    await cerrarOverlays();
  }
}

principal().catch(e => fallos.push('[fuzz] ' + (e && e.stack))).finally(terminar);

require('../main.js');
