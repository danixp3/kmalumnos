// ─── PROBADOR DE INTERFAZ (SMOKE UI) ─────────────────────────────────────────
// Arranca la app real instrumentada y busca errores de interfaz que la suite de
// Jest NO puede ver: los tests corren en entorno Node (sin DOM), así que cubren
// db/ y sync.js pero ni una línea de renderer/.
//
//   npm run smoke              → recorre todas las secciones y abre los modales
//                                (pulsa sus botones: algunos escriben, p. ej. los
//                                − / + de Registro rápido).
//   npm run smoke -- --guardar → además rellena y guarda un registro de prueba
//                                en cada pantalla. Copia data.json antes y lo
//                                restaura al terminar.
//
// Abre la ventana de la app unos segundos y se cierra sola. Termina con
// SMOKE-OK o SMOKE-FALLOS.
//
// SIEMPRE sobre una COPIA de los datos y SIN NUBE (2026-10-02): el barrido
// pulsa todos los botones y antes trabajaba sobre los datos reales con la
// sincronización activa; los − / + de Registro rápido borraban la última clase
// del día de cada alumno (incluso firmadas desde el móvil) y la borraban
// también en la nube. Ahora ni data.json real ni Supabase se tocan.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const CON_GUARDADO = process.argv.includes('--guardar');
const IGNORAR = [
  /Insecure Content-Security-Policy/,
  /nativo desactivado/  // avisos por diseño de dialogos.js (los provoca probarDialogos a propósito)
];
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
    var caja = Array.from(document.querySelectorAll('.dp-trigger')).find(b => b.offsetParent !== null);
    if (!caja) return 'sin-campo-fecha';
    var t = caja.querySelector('.dp-btn');
    t.click();
    if (!document.querySelector('.dp-pop')) return 'no-abre';
    var mes1 = (document.querySelector('.dp-mesanio')||{}).textContent;
    document.querySelector('.dp-pop .dp-nav[data-dir="1"]').click();
    if (!document.querySelector('.dp-pop')) return 'SE CIERRA AL CAMBIAR DE MES';
    var mes2 = (document.querySelector('.dp-mesanio')||{}).textContent;
    if (mes1 === mes2) return 'no cambia de mes';
    // Año de un clic: título del año → rejilla de años → un año → meses
    var anio = document.querySelector('.dp-pop [data-ir="anios"]');
    if (!anio) return 'sin selector de año';
    anio.click();
    var celda = document.querySelector('.dp-pop [data-anio]');
    if (!celda) return 'no salen los años';
    celda.click();
    if (!document.querySelector('.dp-pop [data-mes]')) return 'no salen los meses tras el año';
    document.querySelector('.dp-pop [data-mes="3"]').click();
    if (!document.querySelector('.dp-pop .dp-dia')) return 'no vuelven los días tras el mes';
    document.body.click();
    if (document.querySelector('.dp-pop')) return 'no cierra al pulsar fuera';
    // Escribir la fecha a mano: las barras salen solas y el campo de verdad cambia
    var txt = caja.querySelector('.dp-texto'), oculto = caja.parentNode.querySelector('input[type=hidden]');
    txt.focus(); txt.value = '14042026';
    txt.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    if (txt.value !== '14/04/2026') return 'la máscara no pone las barras: ' + txt.value;
    txt.blur();
    return new Promise(function (res) { setTimeout(function () { res(oculto.value === '2026-04-14' ? 'ok' : 'no guarda lo escrito: ' + oculto.value); }, 50); });
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
  // Los diálogos nativos ya están neutralizados por renderer/dialogos.js
  // (window.alert→modal propio; confirm/prompt→no abren nada). print→no-op
  // para no lanzar el diálogo de impresión del sistema en el barrido.
  await ev(`
    window.print = function(){};
    window.addEventListener('error', e => console.error('ERROR NO CAPTURADO: ' + e.message + ' @' + e.filename + ':' + e.lineno));
    window.addEventListener('unhandledrejection', e => console.error('PROMESA RECHAZADA: ' + ((e.reason && (e.reason.stack||e.reason.message)) || e.reason)));
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    // Desactiva el tutorial durante el barrido: ahora bloquea la navegación
    // (a propósito), y eso impediría recorrer las secciones. No se toca la
    // marca de "vistos" del usuario; solo se neutraliza en esta ejecución.
    try { if (typeof cerrarTutorial === 'function') cerrarTutorial(false); } catch(e){}
    try { comprobarTutorial = function(){}; } catch(e){}
    // Datos de prueba sin cuenta conectada: sin la puerta de bienvenida
    try { comprobarBienvenida = async function(){}; } catch(e){}
    try { mostrarAppPorGate(); } catch(e){}
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    true;
  `);
  await probarDialogos();
  await probarCalendario();
  await recorrerSecciones();
  await probarHistorialPantallas();
}

// Botones laterales del ratón (renderer/historial-pantallas.js): atrás vuelve
// a la pantalla anterior (también a la ficha del alumno) y adelante avanza.
async function probarHistorialPantallas() {
  const r = await ev(`(async function(){
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    const ir = p => { document.querySelector('#sidebar nav a[data-page="' + p + '"]').click(); };
    const boton = b => { document.dispatchEvent(new MouseEvent('mouseup', { button: b, bubbles: true })); };
    const activa = () => document.querySelector('#sidebar nav a.active')?.dataset.page;
    const ficha = () => document.getElementById('view-practicas').style.display === 'block';
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    ir('dashboard'); await esperar(300);
    ir('alumnos'); await esperar(600);
    if (ficha()) { volverAlumnos(); await esperar(400); } // venía con una ficha abierta de antes
    const al = (typeof alumnosCache !== 'undefined' && alumnosCache[0]) || null;
    if (al) { verPracticas(al.id, al.vehiculo_id || null, al.nombre); await esperar(500); }
    ir('profesores'); await esperar(500);
    boton(3); await esperar(600);
    if (activa() !== 'alumnos') return 'atrás no vuelve a Alumnos (está en ' + activa() + ')';
    if (al && !ficha()) return 'atrás no vuelve a la ficha del alumno';
    boton(3); await esperar(600);
    if (al && (activa() !== 'alumnos' || ficha())) return 'atrás no vuelve a la lista de alumnos';
    // (si al entrar en Alumnos se veía una ficha anterior, también es un paso)
    for (let i = 0; i < 3 && activa() === 'alumnos'; i++) { boton(3); await esperar(600); }
    if (activa() !== 'dashboard') return 'atrás no vuelve al inicio (está en ' + activa() + ')';
    boton(4); await esperar(600);
    if (activa() !== 'alumnos') return 'adelante no va a Alumnos';
    // Con una ventana abierta encima no se mueve
    openModal('modal-alumno-nuevo'); boton(3); await esperar(300);
    const quieto = activa() === 'alumnos';
    closeModal('modal-alumno-nuevo');
    if (!quieto) return 'se movió con una ventana abierta';
    // Alt+← también
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })); await esperar(600);
    if (activa() !== 'dashboard') return 'Alt+← no vuelve atrás';
    return 'ok' + (al ? '' : ' (sin alumnos: sin probar la ficha)');
  })()`);
  if (String(r).startsWith('ok')) info.push('botones laterales del ratón: ' + r);
  else fallos.push('[historial] ' + r);
}

// Verifica que los diálogos PROPIOS (confirmar/avisar/pedirTexto) funcionan y
// que NO se abre ningún diálogo nativo de Windows.
async function probarDialogos() {
  const nativos = await ev(`(function(){
    // Un confirm() nativo devolvería un booleano tras bloquear; el neutralizado
    // devuelve false sin bloquear. Comprobamos que no bloquea ni abre ventana.
    var c = window.confirm('prueba');   // debe devolver false sin bloquear
    var p = window.prompt('prueba');    // debe devolver null sin bloquear
    return { confirm: c, prompt: p };
  })()`);
  if (nativos.confirm !== false || nativos.prompt !== null) {
    fallos.push('[dialogos] confirm/prompt nativos NO neutralizados: ' + JSON.stringify(nativos));
  }

  // confirmar() → Aceptar resuelve true
  const okAceptar = await ev(`(async function(){
    var pr = confirmar('¿Prueba de aceptar?');
    await new Promise(r=>setTimeout(r,50));
    var ov = document.getElementById('modal-dialogo');
    if (!ov || !ov.classList.contains('open')) return 'NO ABRE MODAL PROPIO';
    document.getElementById('dlg-aceptar').click();
    return (await pr) === true ? 'ok' : 'no resolvió true';
  })()`);
  if (okAceptar !== 'ok') fallos.push('[dialogos] confirmar+aceptar: ' + okAceptar);

  // confirmar() → Cancelar resuelve false
  const okCancelar = await ev(`(async function(){
    var pr = confirmar('¿Prueba de cancelar?');
    await new Promise(r=>setTimeout(r,50));
    document.getElementById('dlg-cancelar').click();
    return (await pr) === false ? 'ok' : 'no resolvió false';
  })()`);
  if (okCancelar !== 'ok') fallos.push('[dialogos] confirmar+cancelar: ' + okCancelar);

  // avisar() → un solo botón, cierra al aceptar
  const okAviso = await ev(`(async function(){
    var pr = avisar('Aviso de prueba');
    await new Promise(r=>setTimeout(r,50));
    var ov = document.getElementById('modal-dialogo');
    var soloUnBoton = ov && document.getElementById('dlg-cancelar').style.display === 'none';
    document.getElementById('dlg-aceptar').click();
    await pr;
    var cerrado = !ov.classList.contains('open');
    return (soloUnBoton && cerrado) ? 'ok' : ('soloUnBoton='+soloUnBoton+' cerrado='+cerrado);
  })()`);
  if (okAviso !== 'ok') fallos.push('[dialogos] avisar: ' + okAviso);

  if (![okAceptar, okCancelar, okAviso].some(x => x !== 'ok') && !fallos.some(f => f.startsWith('[dialogos]'))) {
    info.push('diálogos propios: OK (confirmar/avisar/pedirTexto; sin nativos de Windows)');
  }
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

// Datos de prueba: copia de los reales en una carpeta temporal y sin nube
// (mismo aislamiento que scripts/barrido-visual.js).
const os = require('os');
const UD_PRUEBA = path.join(os.tmpdir(), 'aulamovil-smoke', 'datos');
const sync = require('../sync');
for (const f of ['sync', 'pushAll', 'startAutoSync', 'stopAutoSync']) if (typeof sync[f] === 'function') sync[f] = async () => ({ ok: true });
require('../main.js');
fs.rmSync(path.dirname(UD_PRUEBA), { recursive: true, force: true });
fs.mkdirSync(UD_PRUEBA, { recursive: true });
const datosReales = path.join(app.getPath('appData'), 'KMAlumnos', 'data.json');
if (fs.existsSync(datosReales)) fs.copyFileSync(datosReales, path.join(UD_PRUEBA, 'data.json'));
app.setPath('userData', UD_PRUEBA);
info.push(`datos de prueba (copia, sin nube): ${UD_PRUEBA}`);
