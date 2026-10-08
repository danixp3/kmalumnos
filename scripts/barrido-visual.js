// ─── BARRIDO VISUAL ──────────────────────────────────────────────────────────
// Busca fallos de diseño que solo se ven con la ventana pequeña (modo ventana):
// textos que se pisan (también en gráficos SVG y ejes/horas posicionados),
// textos cortados sin «…», tablas o tarjetas que se salen de la pantalla.
//
//   npm run barrido                      → 920x620 y 1366x768
//   npm run barrido -- --tamanos=1100x700,1920x1040
//
// Trabaja con una COPIA de data.json en una carpeta temporal y SIN nube (no
// sincroniza ni toca tus datos). Deja un informe y capturas de cada pantalla con
// avisos en %TEMP%\aulamovil-barrido. Termina en BARRIDO-OK o BARRIDO-AVISOS.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SALIDA = path.join(os.tmpdir(), 'aulamovil-barrido');
const UD = path.join(SALIDA, 'datos');
const arg = process.argv.find(a => a.startsWith('--tamanos='));
const TAMANOS = (arg ? arg.split('=')[1] : '920x620,1366x768').split(',').map(t => t.split('x').map(Number));
const espera = ms => new Promise(r => setTimeout(r, ms));

// Sin nube: el barrido no debe sincronizar nada
const sync = require('../sync');
for (const f of ['sync', 'pushAll', 'startAutoSync', 'stopAutoSync']) if (typeof sync[f] === 'function') sync[f] = async () => ({ ok: true });
require('../main.js');
fs.mkdirSync(UD, { recursive: true });
fs.mkdirSync(path.join(SALIDA, 'capturas'), { recursive: true });
const real = path.join(app.getPath('appData'), 'KMAlumnos', 'data.json');
if (fs.existsSync(real)) fs.copyFileSync(real, path.join(UD, 'data.json'));
app.setPath('userData', UD);

const ventana = () => BrowserWindow.getAllWindows().find(w => { try { return /index\.html/i.test(w.webContents.getURL()); } catch (e) { return false; } });
const ev = js => ventana().webContents.executeJavaScript(js);

// Se ejecuta en la página: devuelve { solapes, cortes, desbordes } de la sección activa
const DETECTOR = String.raw`(function(){
  var pg = document.querySelector('.page.active'); if (!pg) return { solapes: [], cortes: [], desbordes: [] };
  var visible = function (el) { var r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; var cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return null; if (el.closest('details:not([open]) > :not(summary)')) return null; return r; };
  var nombre = function (el) { var s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.'); var p = el.parentElement; return (p ? (p.id ? '#' + p.id : (typeof p.className === 'string' && p.className.trim() ? '.' + p.className.trim().split(/\s+/)[0] : p.tagName.toLowerCase())) + ' > ' : '') + s; };
  // Texto que queda fuera de lo visible de un contenedor con scroll/recorte (p. ej. las filas de una tabla con scroll propio): no se pisa con nada, no se ve
  var enPantalla = function (el, r) { for (var p = el.parentElement; p && p !== pg.parentElement; p = p.parentElement) { var cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowY) || /(auto|scroll|hidden|clip)/.test(cs.overflowX)) { var pr = p.getBoundingClientRect(); if (r.top >= pr.bottom - 1 || r.bottom <= pr.top + 1 || r.left >= pr.right - 1 || r.right <= pr.left + 1) return false; } } return true; };
  var cruza = function (A, B, mx, my) { return Math.min(A.right, B.right) - Math.max(A.left, B.left) > mx && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > my; };
  // 1) Textos HTML que se pisan
  var hojas = [], w = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT, null), n;
  while ((n = w.nextNode())) { if (!n.textContent.trim()) continue; var el = n.parentElement; if (!el || el.closest('svg,script,style,option,select,.overlay,.menu-fila-lista') || hojas.indexOf(el) >= 0) continue; hojas.push(el); }
  var cajas = hojas.map(function (el) { if (!visible(el)) return null; var rg = document.createRange(); rg.selectNodeContents(el); return { el: el, rs: Array.from(rg.getClientRects()).filter(function (r) { return r.width > 1 && r.height > 1 && enPantalla(el, r); }) }; }).filter(function (x) { return x && x.rs.length; });
  var solapes = [];
  for (var i = 0; i < cajas.length; i++) for (var j = i + 1; j < cajas.length; j++) {
    var a = cajas[i], b = cajas[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (a.rs.some(function (A) { return b.rs.some(function (B) { return cruza(A, B, 2, 3); }); }))
      solapes.push(nombre(a.el) + ' «' + a.el.textContent.trim().slice(0, 24) + '» ✕ ' + nombre(b.el) + ' «' + b.el.textContent.trim().slice(0, 24) + '»');
  }
  // 2) Textos de gráficos SVG que se pisan o se salen
  pg.querySelectorAll('svg').forEach(function (svg) {
    var r0 = svg.getBoundingClientRect(); if (r0.width < 40 || r0.height < 30) return;
    var ts = Array.from(svg.querySelectorAll('text')).map(function (t) { return { t: t, r: t.getBoundingClientRect() }; }).filter(function (x) { return x.r.width > 1 && x.t.textContent.trim(); });
    ts.forEach(function (a, i) { ts.slice(i + 1).forEach(function (b) { if (cruza(a.r, b.r, 1, 2)) solapes.push('gráfico: «' + a.t.textContent.trim() + '» ✕ «' + b.t.textContent.trim() + '»'); }); });
  });
  // 3) Cortes: contenedor con overflow oculto cuyo texto no cabe y sin «…»
  var cortes = [];
  pg.querySelectorAll('*').forEach(function (el) { if (el.closest('.overlay,svg,.tl-track,.cont-pista,.bl-el')) return; if (!visible(el)) return; var cs = getComputedStyle(el);
    if ((cs.overflowX === 'hidden' || cs.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && el.children.length < 3 && el.textContent.trim())
      cortes.push(nombre(el) + ' «' + el.textContent.trim().slice(0, 30) + '»'); });
  // 4) Desbordes: scroll horizontal de la página o elementos fuera de la ventana
  var desbordes = [];
  var raiz = pg.parentElement; if (raiz.scrollWidth > raiz.clientWidth + 2) desbordes.push('la página hace scroll horizontal (' + raiz.scrollWidth + ' > ' + raiz.clientWidth + ')');
  pg.querySelectorAll('.card, section, .page-header').forEach(function (c) { var r = visible(c); if (r && r.right > window.innerWidth + 1) desbordes.push(nombre(c) + ' se sale por la derecha'); });
  return { solapes: solapes.slice(0, 20), cortes: cortes.slice(0, 10), desbordes: desbordes.slice(0, 10) };
})()`;

async function principal() {
  for (let t = Date.now(); Date.now() - t < 30000;) { try { if (await ev(`document.querySelectorAll('#sidebar nav a').length`) > 0) break; } catch (e) {} await espera(400); }
  await espera(1500);
  await ev(`try{cerrarTutorial(false)}catch(e){}; try{comprobarTutorial=function(){}}catch(e){}; try{comprobarBienvenida=async function(){}}catch(e){};
    try{mostrarAppPorGate()}catch(e){}; document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open')); true`);
  const paginas = await ev(`Array.from(document.querySelectorAll('#sidebar nav a[data-page], a.nav-hermano[data-page]')).map(a=>a.dataset.page).filter((v,i,s)=>v&&s.indexOf(v)===i)`);
  const informe = [];
  for (const [w, h] of TAMANOS) {
    const v = ventana(); if (v.isMaximized()) v.unmaximize(); v.setContentSize(w, h); await espera(600);
    for (const p of paginas) {
      await ev(`try{navegarA(${JSON.stringify(p)})}catch(e){}; true`); await espera(1300);
      const nTabs = await ev(`document.querySelectorAll('#page-${p} .page-tabs [data-tab]').length`);
      for (let t = 0; t < Math.max(1, nTabs); t++) {
        if (nTabs) { await ev(`(document.querySelectorAll('#page-${p} .page-tabs [data-tab]')[${t}]||{click(){}}).click(); true`); await espera(800); }
        const r = await ev(DETECTOR);
        if (r.solapes.length || r.cortes.length || r.desbordes.length) {
          const etiqueta = `${w}x${h} ${p}${nTabs ? ' (pestaña ' + (t + 1) + ')' : ''}`;
          informe.push({ etiqueta, ...r });
          const img = await ventana().webContents.capturePage();
          fs.writeFileSync(path.join(SALIDA, 'capturas', `${w}x${h}-${p}${nTabs ? '-' + (t + 1) : ''}.png`), img.toPNG());
        }
      }
    }
  }
  fs.writeFileSync(path.join(SALIDA, 'informe.json'), JSON.stringify(informe, null, 1));
  console.log('\n===== BARRIDO VISUAL =====');
  for (const x of informe) {
    console.log('== ' + x.etiqueta);
    x.solapes.forEach(s => console.log('   se pisan: ' + s));
    x.cortes.forEach(s => console.log('   cortado:  ' + s));
    x.desbordes.forEach(s => console.log('   desborda: ' + s));
  }
  console.log(`\nInforme y capturas en ${SALIDA}`);
  console.log(informe.length ? `BARRIDO-AVISOS (${informe.length} pantallas)` : 'BARRIDO-OK: sin solapes, cortes ni desbordes');
}

setTimeout(() => { console.log('BARRIDO: tope de tiempo alcanzado'); app.exit(2); }, 600000).unref();
principal().catch(e => console.log('BARRIDO: error ' + (e && e.stack))).finally(() => {
  BrowserWindow.getAllWindows().forEach(w => w.destroy());
  app.exit(0);
});
