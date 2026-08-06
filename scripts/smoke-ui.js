// ─── PROBADOR DE INTERFAZ (SMOKE UI) ─────────────────────────────────────────
// Arranca la app real instrumentada y busca errores de interfaz que la suite de
// Jest NO puede ver: los tests corren en entorno Node (sin DOM), así que cubren
// db/ y sync.js pero ni una línea de renderer/.
//
//   npm run smoke              → solo lectura: recorre todas las secciones y
//                                abre los modales. No escribe nada.
//   npm run smoke -- --guardar → además rellena y guarda un registro de prueba
//                                en cada pantalla. Copia data.json antes y lo
//                                restaura al terminar.
//
// Abre la ventana de la app unos segundos y se cierra sola. Termina con
// SMOKE-OK o SMOKE-FALLOS.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const CON_GUARDADO = process.argv.includes('--guardar');
const IGNORAR = [/Insecure Content-Security-Policy/];
const NIVEL = { 1: 'WARN', 2: 'ERROR', 3: 'DEBUG' };

const fallos = [];
const info = [];
let win = null;
let rutaDatos = null;
let copia = null;

const espera = ms => new Promise(r => setTimeout(r, ms));

// La app puede tener más de una ventana (actualizador, etc.): siempre se
// trabaja contra la que tiene index.html cargado.
function ventanaApp() {
  const todas = BrowserWindow.getAllWindows();
  return todas.find(w => {
    try { return /index\.html/i.test(w.webContents.getURL()); } catch (e) { return false; }
  }) || win || todas[0];
}

const ev = js => {
  const w = ventanaApp();
  if (!w) throw new Error('no hay ventana de la app');
  return w.webContents.executeJavaScript(js);
};

app.on('browser-window-created', (_e, w) => {
  win = w;
  w.webContents.on('console-message', (_ev, level, msg, linea, src) => {
    if (level < 2 || IGNORAR.some(r => r.test(msg))) return;
    fallos.push(`[${NIVEL[level] || level}] ${msg} (${src}:${linea})`);
  });
  w.webContents.on('render-process-gone', (_ev, d) => fallos.push(`[CRASH] ${JSON.stringify(d)}`));
  w.webContents.on('preload-error', (_ev, p, err) => fallos.push(`[PRELOAD] ${p}: ${err && err.message}`));
});
process.on('uncaughtException', e => fallos.push(`[MAIN] ${e && e.stack}`));

// Tope global de seguridad: si algo se bloquea (p. ej. un diálogo nativo), el
// proceso se cierra igualmente en vez de quedarse colgado indefinidamente.
const WATCHDOG_MS = 180000;
setTimeout(() => {
  console.log('\n===== SMOKE UI (watchdog) =====');
  info.forEach(l => console.log(l));
  console.log('\n[SMOKE] tope de tiempo alcanzado (' + (WATCHDOG_MS / 1000) + 's) — se fuerza el cierre');
  if (CON_GUARDADO) { try { restaurarDatos(); } catch (e) {} }
  try { BrowserWindow.getAllWindows().forEach(w => w.destroy()); } catch (e) {}
  app.exit(2);
}, WATCHDOG_MS).unref();

function respaldarDatos() {
  rutaDatos = path.join(app.getPath('userData'), 'data.json');
  if (!fs.existsSync(rutaDatos)) return;
  copia = rutaDatos + '.smoke-bak';
  fs.copyFileSync(rutaDatos, copia);
  info.push(`copia de seguridad: ${copia}`);
}

function restaurarDatos() {
  if (!copia || !fs.existsSync(copia)) return;
  fs.copyFileSync(copia, rutaDatos);
  fs.unlinkSync(copia);
  info.push('datos restaurados');
}

// Rellena un contenedor con datos de prueba con el TIPO correcto de cada campo
// (si no, un texto en un campo hora/email dispara errores que no son de la app).
const RELLENAR = `(function(cont){
  var hoy = new Date().toISOString().slice(0,10);
  cont.querySelectorAll('input, select, textarea').forEach(function(el){
    var idl = (el.id || '').toLowerCase();
    if (el.type === 'hidden') {
      if (/fecha|desde|hasta|caduc|compra|inicio|fin/.test(idl)) el.value = hoy;
      return;
    }
    if (el.tagName === 'SELECT') {
      var op = Array.from(el.options).find(function(o){ return o.value !== ''; });
      if (op) { el.value = op.value; el.dispatchEvent(new Event('change',{bubbles:true})); }
      return;
    }
    if (el.type === 'checkbox' || el.type === 'radio') return;
    if (el.type === 'number') { el.value = '2'; return; }
    if (el.type === 'date') { el.value = hoy; return; }
    if (el.type === 'time') { el.value = '09:00'; return; }
    if (el.type === 'email' || /email|correo/.test(idl)) { el.value = 'smoke@ejemplo.com'; return; }
    el.value = 'SMOKE_PRUEBA';
  });
  cont.querySelectorAll('input, select, textarea').forEach(function(el){
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return true;
})`;

async function recorrerSecciones() {
  const paginas = await ev(`Array.from(document.querySelectorAll('#sidebar nav a')).map(a=>a.dataset.page).filter(Boolean)`);
  info.push(`secciones: ${paginas.length}`);

  for (const p of paginas) {
    await ev(`window.__sec = '${p}';
              var a = document.querySelector('#sidebar nav a[data-page="${p}"]');
              if (a) a.click(); true;`);
    await espera(1100);

    // abre cada botón de alta y comprueba que los desplegables no salen vacíos
    const r = await ev(`(function(){
      var pg = document.getElementById('page-${p}');
      if (!pg) return { abiertos: [], avisos: ['sin contenedor #page-${p}'] };
      var avisos = [], abiertos = [];
      var bs = Array.from(pg.querySelectorAll('button')).filter(function(b){
        if (b.offsetParent === null) return false;
        return !/imprimir|pdf|exportar|borrar|eliminar|csv|sincronizar|publicar/i.test(b.textContent || '');
      });
      bs.forEach(function(b){
        try { b.click(); } catch (e) { avisos.push('clic "' + (b.textContent||'').trim() + '": ' + e.message); }
        var ov = document.querySelector('.overlay.open');
        if (ov) {
          abiertos.push('#' + ov.id);
          Array.from(ov.querySelectorAll('select')).forEach(function(s){
            if (s.options.length === 0) avisos.push('desplegable vacío #' + s.id + ' en #' + ov.id);
          });
          ov.classList.remove('open');
        }
      });
      return { abiertos: abiertos, avisos: avisos };
    })()`);
    if (r.avisos.length) r.avisos.forEach(a => fallos.push(`[${p}] ${a}`));
    if (r.abiertos.length) info.push(`  ${p}: modales ${r.abiertos.join(' ')}`);

    if (CON_GUARDADO) await probarGuardado(p);
    await espera(200);
  }
}

async function probarGuardado(p) {
  // Cierra cualquier modal que el barrido previo haya podido dejar abierto,
  // para no confundirlo con el resultado del guardado.
  await ev(`document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open')); true;`);
  await espera(200);
  const r = await ev(`(function(){
    var pg = document.getElementById('page-${p}');
    if (!pg) return 'sin-pagina';
    var b = Array.from(pg.querySelectorAll('button')).filter(x=>x.offsetParent!==null)
             .find(x => /^\\s*(a\\u00f1adir|nuevo|nueva|registrar|crear)/i.test((x.textContent||'').trim()));
    if (!b) return 'sin-alta';
    b.click(); return 'abierto';
  })()`);
  if (r !== 'abierto') return;
  await espera(800);

  // Algunas pantallas (vehículos, profesores, alumnos) dan de alta con un
  // formulario EN LÍNEA, sin modal: el smoke no las prueba para no ensuciar los
  // filtros de la página; se anota como omitido, no como fallo.
  const hayModal = await ev(`!!document.querySelector('.overlay.open')`);
  if (!hayModal) { info.push(`  ${p}: alta en línea (no probada por el smoke)`); return; }

  const res = await ev(`(function(){
    var ov = document.querySelector('.overlay.open');
    if (!ov) return 'no-abre';
    ${RELLENAR}(ov);
    var g = Array.from(ov.querySelectorAll('button'))
             .find(x => /guardar|a\\u00f1adir|registrar|crear|aceptar/i.test(x.textContent||''));
    if (!g) return 'sin-boton-guardar';
    g.click(); return 'guardado';
  })()`);
  await espera(1500);

  const estado = await ev(`(function(){
    var ov = document.querySelector('.overlay.open');
    if (!ov) return 'ok';
    var al = Array.from(ov.querySelectorAll('.alert,[id$="-alert"]'))
              .filter(a=>!a.classList.contains('hidden')).map(a=>a.textContent.trim()).join(' / ');
    return 'modal sigue abierto' + (al ? ' aviso="' + al + '"' : '');
  })()`);
  if (res !== 'guardado') fallos.push(`[${p}] guardado: ${res}`);
  else if (estado !== 'ok') fallos.push(`[${p}] guardado: ${estado}`);
  else info.push(`  ${p}: guardado OK`);

  await ev(`document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open')); true;`);
}

async function probarCalendario() {
  // Regresión del bug de agosto 2026: cambiar de mes cerraba el calendario
  // porque el re-render dejaba el e.target fuera del DOM.
  // Se hace en una pantalla que tenga campos de fecha.
  await ev(`(function(){
    var a = document.querySelector('#sidebar nav a[data-page="caja"]')
         || document.querySelector('#sidebar nav a[data-page="jornada"]');
    if (a) a.click(); return true;
  })()`);
  await espera(1200);

  const r = await ev(`(function(){
    var t = Array.from(document.querySelectorAll('.dp-trigger')).find(b => b.offsetParent !== null);
    if (!t) return 'sin-campo-fecha';
    t.click();
    if (!document.querySelector('.dp-pop')) return 'no-abre';
    var mes1 = (document.querySelector('.dp-mesanio')||{}).textContent;
    document.querySelector('.dp-pop .dp-nav[data-dir="1"]').click();
    if (!document.querySelector('.dp-pop')) return 'SE CIERRA AL CAMBIAR DE MES';
    var mes2 = (document.querySelector('.dp-mesanio')||{}).textContent;
    if (mes1 === mes2) return 'no cambia de mes';
    document.body.click();
    if (document.querySelector('.dp-pop')) return 'no cierra al pulsar fuera';
    return 'ok';
  })()`);
  if (r === 'ok') info.push('calendario: OK');
  else fallos.push(`[calendario] ${r}`);
}

// Espera activa a que la interfaz esté cargada (en vez de un tiempo fijo).
async function esperarInterfaz(maxMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const n = await ev(`document.querySelectorAll('#sidebar nav a').length`);
      if (n > 0) { info.push(`interfaz lista en ${((Date.now() - t0) / 1000).toFixed(1)}s`); return true; }
    } catch (e) { /* aún no hay ventana */ }
    await espera(500);
  }
  fallos.push('[SMOKE] la interfaz no cargó a tiempo');
  return false;
}

async function principal() {
  if (!await esperarInterfaz()) return;
  await espera(1500); // dejar terminar las cargas iniciales
  if (CON_GUARDADO) respaldarDatos(); // con la app ya lista, userData es la buena
  // Neutraliza los diálogos nativos: un confirm()/alert() sin nadie que lo
  // cierre bloquearía la ventana para siempre en una ejecución automática.
  // confirm→false (cancela borrados/conversiones), alert/print→no-op.
  await ev(`
    window.confirm = function(){ return false; };
    window.alert = function(){};
    window.print = function(){};
    true;
  `);
  await ev(`
    window.addEventListener('error', e => console.error('ERROR NO CAPTURADO: ' + e.message + ' @' + e.filename + ':' + e.lineno));
    window.addEventListener('unhandledrejection', e => console.error('PROMESA RECHAZADA: ' + ((e.reason && (e.reason.stack||e.reason.message)) || e.reason)));
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    true;
  `);
  await probarCalendario();
  await recorrerSecciones();
}

principal()
  .catch(e => fallos.push(`[SMOKE] ${e && e.stack}`))
  .finally(async () => {
      await espera(400);
      if (CON_GUARDADO) restaurarDatos();
      console.log('\n===== SMOKE UI =====');
      info.forEach(l => console.log(l));
      if (fallos.length) {
        console.log('\n-- fallos --');
        fallos.forEach(l => console.log('  ' + l));
        console.log(`\nSMOKE-FALLOS (${fallos.length})`);
      } else {
        console.log('\nSMOKE-OK: sin errores de interfaz');
      }
      try { BrowserWindow.getAllWindows().forEach(w => w.destroy()); } catch (e) {}
      app.exit(fallos.length ? 1 : 0);
  });

require('../main.js');
