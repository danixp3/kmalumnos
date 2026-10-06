// ─── SELECTOR DE FECHA PROPIO ─────────────────────────────────────────────────
// Sustituye los <input type="date"> nativos por un campo propio con el tema de
// la app. El input original se conserva como almacén oculto (mismo id, valor en
// ISO 'YYYY-MM-DD' y su onchange); encima va:
//   · un campo de texto donde la fecha SE ESCRIBE: solo números y las barras
//     salen solas (14042026 → 14/04/2026; también 1/4/26, 14-04-2026 o ISO);
//     ↑/↓ cambian el día, Intro confirma, Alt+↓ abre el calendario;
//   · un botón con el calendario: pulsar el mes o el año salta a elegirlos de un
//     golpe (las fechas de nacimiento abren directamente en los años).
// Los campos que se crean después (ficha del alumno, modales en JS) se
// convierten solos (MutationObserver). Respeta min/max del input original.

const DP_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DP_MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DP_DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
let dpAbierto = null; // { input, caja, pop, anio, mes, vista: 'dias'|'meses'|'anios', cursor }

const dpPad = n => String(n).padStart(2, '0');
const dpEsIso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const DP_ICONO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

function dpHoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${dpPad(d.getMonth() + 1)}-${dpPad(d.getDate())}`;
}
function dpIsoDe(y, m, d) { return `${y}-${dpPad(m)}-${dpPad(d)}`; }
function dpSumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d + n);
  return dpIsoDe(f.getFullYear(), f.getMonth() + 1, f.getDate());
}

// ── Escritura (puras: también las usan los tests) ─────────────────────────────
// Lo tecleado → «dd/mm/aaaa» con las barras puestas. Un separador escrito tras
// un solo dígito lo completa con cero (1/4 → 01/04). La barra solo aparece
// cuando ya hay algo detrás o la escribe la persona (así borrar no se atasca).
function dpMascara(raw) {
  let d = '', m = '', y = '', campo = 0, sep1 = false, sep2 = false;
  for (const ch of String(raw || '')) {
    if (/\d/.test(ch)) {
      if (campo === 0) { d += ch; if (d.length === 2) campo = 1; }
      else if (campo === 1) { m += ch; if (m.length === 2) campo = 2; }
      else if (y.length < 4) y += ch;
    } else if (/[\/\-\. ,]/.test(ch)) {
      if (campo === 0 && d.length) { if (d.length === 1) d = '0' + d; campo = 1; sep1 = true; }
      else if (campo === 1 && !m.length && d.length === 2) sep1 = true;
      else if (campo === 1 && m.length) { if (m.length === 1) m = '0' + m; campo = 2; sep2 = true; }
      else if (campo === 2 && !y.length) sep2 = true;
    }
  }
  let s = d;
  if (m || sep1 || campo >= 2) s += '/' + m;
  if (y || sep2) s += '/' + y;
  return s;
}

// Texto → ISO, o null si no es una fecha que exista. `tipo` = 'nacimiento'
// decide el siglo de los años de dos cifras hacia el pasado.
function dpLeerFecha(texto, tipo) {
  const t = String(texto || '').trim();
  if (!t) return '';
  let y, m, d;
  let r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // ISO pegado
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else {
    r = t.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{2}|\d{4})$/) || t.match(/^(\d{2})(\d{2})(\d{4}|\d{2})$/);
    if (!r) return null;
    d = +r[1]; m = +r[2]; y = +r[3];
    if (r[3].length === 2) {
      const ahora = new Date().getFullYear();
      y += 2000;
      if (tipo === 'nacimiento' ? y > ahora : y > ahora + 20) y -= 100;
    }
  }
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(y, m, 0).getDate()) return null;
  return dpIsoDe(y, m, d);
}

function dpTextoDe(iso) {
  if (!dpEsIso(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Fechas de nacimiento: el calendario abre en los años y no deja el futuro
function dpTipo(orig) {
  if (orig.dataset.fecha) return orig.dataset.fecha;
  return /nacimiento/i.test(orig.id || orig.dataset.campo || '') ? 'nacimiento' : '';
}
function dpLimites(orig) {
  let min = orig.getAttribute('min') || '';
  let max = orig.getAttribute('max') || '';
  if (!max && dpTipo(orig) === 'nacimiento') max = dpHoyIso();
  if (!min && dpTipo(orig) === 'nacimiento') min = '1900-01-01';
  return { min: dpEsIso(min) ? min : '', max: dpEsIso(max) ? max : '' };
}
function dpFueraDeRango(orig, iso) {
  const { min, max } = dpLimites(orig);
  return (min && iso < min) || (max && iso > max);
}

// ── Montaje ──────────────────────────────────────────────────────────────────
function mejorarInputsFecha() {
  document.querySelectorAll('input[type="date"]').forEach(dpUpgrade);
  // Los campos de fecha que se pinten más tarde (ficha, modales hechos en JS)
  new MutationObserver(cambios => {
    for (const c of cambios) for (const n of c.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches && n.matches('input[type="date"]')) dpUpgrade(n);
      else if (n.querySelectorAll) n.querySelectorAll('input[type="date"]').forEach(dpUpgrade);
    }
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', e => {
    if (!dpAbierto) return;
    // Un clic dentro del calendario que provoca un re-render (cambiar de mes)
    // deja su e.target fuera del DOM: no es un clic "fuera", es uno ya atendido.
    if (!e.target.isConnected) return;
    if (!dpAbierto.pop.contains(e.target) && !dpAbierto.caja.contains(e.target)) cerrarDatepicker();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dpAbierto) { e.stopPropagation(); cerrarDatepicker(); } }, true);
  window.addEventListener('resize', cerrarDatepicker);
  window.addEventListener('scroll', e => { if (dpAbierto && !dpAbierto.pop.contains(e.target)) cerrarDatepicker(); }, true);
}

function dpUpgrade(orig) {
  if (orig._dpUpgraded || !orig.parentNode) return;
  orig._dpUpgraded = true;

  const wrap = document.createElement('div');
  wrap.className = 'datepicker';
  orig.parentNode.insertBefore(wrap, orig);

  const caja = document.createElement('div');
  caja.className = 'dp-trigger';
  // Traslada el ancho del input original (p. ej. width:100% en los modales)
  // (con un mínimo para que «dd/mm/aaaa» quepa entera junto al icono)
  if (orig.style.width) {
    const px = /^\d+px$/.test(orig.style.width) ? parseInt(orig.style.width, 10) : null;
    wrap.style.width = px && px < 150 ? '150px' : orig.style.width;
    caja.style.width = '100%';
  }

  const texto = document.createElement('input');
  texto.type = 'text';
  texto.className = 'dp-texto';
  texto.placeholder = 'dd/mm/aaaa';
  texto.inputMode = 'numeric';
  texto.autocomplete = 'off';
  texto.spellcheck = false;
  texto.maxLength = 10;
  // La etiqueta <label for="id"> del campo apunta ahora al texto visible
  if (orig.id) {
    document.querySelectorAll(`label[for="${CSS.escape(orig.id)}"]`).forEach(l => {
      l.addEventListener('click', ev => { ev.preventDefault(); texto.focus(); });
    });
  }
  if (orig.title) texto.title = orig.title;
  texto.setAttribute('aria-label', orig.getAttribute('aria-label') || 'Fecha (dd/mm/aaaa)');

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'dp-btn';
  boton.tabIndex = -1;
  boton.title = 'Abrir el calendario';
  boton.setAttribute('aria-label', 'Abrir el calendario');
  boton.innerHTML = DP_ICONO;

  // El input pasa a oculto: conserva id, value, data-* y onchange
  orig.type = 'hidden';
  wrap.appendChild(orig);
  caja.appendChild(texto);
  caja.appendChild(boton);
  wrap.appendChild(caja);
  orig._dpAnchor = caja;
  orig._dpTexto = texto;
  orig._dpCaja = caja;

  // Hook del value: cuando el código de la app cambie la fecha por su cuenta
  // (hoy por defecto, día ±1, limpiar filtros...), el texto se refresca solo.
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(orig, 'value', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); dpRefrescarTexto(orig); }
  });

  dpRefrescarTexto(orig);
  boton.addEventListener('mousedown', e => e.preventDefault()); // no quitar el foco al texto
  boton.addEventListener('click', e => { e.stopPropagation(); dpToggle(orig); });
  texto.addEventListener('input', e => dpAlEscribir(orig, e));
  texto.addEventListener('keydown', e => dpTeclas(orig, e));
  texto.addEventListener('blur', () => {
    // Si el foco se va al propio calendario, se decide al elegir
    setTimeout(() => {
      if (dpAbierto && dpAbierto.input === orig && dpAbierto.pop.contains(document.activeElement)) return;
      dpConfirmarTexto(orig);
    }, 0);
  });
}

function dpRefrescarTexto(orig) {
  const texto = orig._dpTexto;
  if (!texto) return;
  const iso = orig.value;
  texto.value = dpTextoDe(iso);
  orig._dpCaja.classList.toggle('dp-vacio', !dpEsIso(iso));
  dpMarcarError(orig, '');
}

function dpMarcarError(orig, msg) {
  const caja = orig._dpCaja;
  if (!caja) return;
  caja.classList.toggle('dp-error', !!msg);
  let el = caja.parentNode.querySelector('.dp-msg');
  if (!msg) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'dp-msg'; el.setAttribute('role', 'alert'); caja.parentNode.appendChild(el); }
  el.textContent = msg;
}

function dpAlEscribir(orig, e) {
  const texto = orig._dpTexto;
  const raw = texto.value;
  // Dónde estaba el cursor contado en dígitos, para dejarlo en el mismo sitio
  const pos = texto.selectionStart ?? raw.length;
  const digitosAntes = raw.slice(0, pos).replace(/\D/g, '').length;
  const borrando = e && e.inputType && e.inputType.startsWith('delete');
  const isoPegado = /^\s*\d{4}-\d{1,2}-\d{1,2}\s*$/.test(raw) ? dpLeerFecha(raw) : null;
  const nuevo = isoPegado ? dpTextoDe(isoPegado) : borrando ? raw.replace(/[^\d\/]/g, '') : dpMascara(raw);
  if (nuevo !== raw) {
    texto.value = nuevo;
    let p = 0, vistos = 0;
    while (p < nuevo.length && vistos < digitosAntes) { if (/\d/.test(nuevo[p])) vistos++; p++; }
    if (!borrando && nuevo[p] === '/') p++;
    texto.setSelectionRange(p, p);
  }
  dpMarcarError(orig, '');
  // Fecha completa escrita → el calendario abierto se va a ese mes
  const iso = dpLeerFecha(texto.value, dpTipo(orig));
  if (iso && dpAbierto && dpAbierto.input === orig && texto.value.length === 10) {
    const [y, m] = iso.split('-').map(Number);
    Object.assign(dpAbierto, { anio: y, mes: m - 1, vista: 'dias', cursor: iso });
    dpRender();
  }
}

// Lo escrito pasa al campo de verdad (al salir, con Intro o al elegir)
function dpConfirmarTexto(orig) {
  const texto = orig._dpTexto;
  const t = texto.value.trim();
  const iso = dpLeerFecha(t, dpTipo(orig));
  if (iso === null) {
    dpMarcarError(orig, t.replace(/\D/g, '').length < 6 ? 'Fecha incompleta: dd/mm/aaaa' : `«${t}» no es una fecha válida`);
    return false;
  }
  if (iso && dpFueraDeRango(orig, iso)) {
    const { min, max } = dpLimites(orig);
    dpMarcarError(orig, max && iso > max ? (dpTipo(orig) === 'nacimiento' ? 'La fecha de nacimiento no puede ser futura' : `Como muy tarde el ${dpTextoDe(max)}`) : `Como muy pronto el ${dpTextoDe(min)}`);
    return false;
  }
  if (iso !== orig.value) {
    orig.value = iso;
    orig.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    texto.value = dpTextoDe(iso); // normaliza «1/4/26» → «01/04/2026»
  }
  dpMarcarError(orig, '');
  return true;
}

function dpTeclas(orig, e) {
  const abierto = dpAbierto && dpAbierto.input === orig;
  if (e.key === 'Enter') {
    if (abierto && dpAbierto.vista === 'dias' && dpAbierto.cursor && !e.target.value.trim()) { dpElegir(dpAbierto.cursor); e.preventDefault(); return; }
    if (abierto && dpAbierto.vista === 'dias' && dpAbierto.cursor && dpAbierto.teclado) { dpElegir(dpAbierto.cursor); e.preventDefault(); return; }
    const ok = dpConfirmarTexto(orig);
    if (abierto) cerrarDatepicker();
    if (!ok) e.preventDefault(); // no enviar el formulario con una fecha mala
    return;
  }
  if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); if (!abierto) abrirDatepicker(orig); return; }
  if (e.key === 'Tab' && abierto) { cerrarDatepicker(); return; }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.key)) return;
  if (abierto && dpAbierto.vista === 'dias') {
    // Con el calendario abierto, las flechas mueven el día marcado
    const st = dpAbierto;
    const base = st.cursor || (dpEsIso(orig.value) ? orig.value : dpHoyIso());
    let nuevo = base;
    if (e.key === 'ArrowLeft') nuevo = dpSumarDias(base, -1);
    else if (e.key === 'ArrowRight') nuevo = dpSumarDias(base, 1);
    else if (e.key === 'ArrowUp') nuevo = dpSumarDias(base, -7);
    else if (e.key === 'ArrowDown') nuevo = dpSumarDias(base, 7);
    else {
      const [y, m, d] = base.split('-').map(Number);
      const salto = (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1);
      const f = new Date(y, m - 1 + salto, 1);
      nuevo = dpIsoDe(f.getFullYear(), f.getMonth() + 1, Math.min(d, new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate()));
    }
    e.preventDefault();
    const [y, m] = nuevo.split('-').map(Number);
    Object.assign(st, { cursor: nuevo, anio: y, mes: m - 1, teclado: true });
    dpRender();
    return;
  }
  if (abierto || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key.startsWith('Page')) return;
  // Cerrado: ↑/↓ = día siguiente/anterior de la fecha escrita
  const iso = dpLeerFecha(e.target.value, dpTipo(orig)) || (e.target.value.trim() ? null : dpHoyIso());
  if (!iso) return;
  e.preventDefault();
  const nuevo = e.target.value.trim() ? dpSumarDias(iso, e.key === 'ArrowUp' ? 1 : -1) : iso;
  if (dpFueraDeRango(orig, nuevo)) return;
  e.target.value = dpTextoDe(nuevo);
  dpConfirmarTexto(orig);
}

// ── Calendario ───────────────────────────────────────────────────────────────
function dpToggle(orig) {
  if (dpAbierto && dpAbierto.input === orig) { cerrarDatepicker(); return; }
  abrirDatepicker(orig);
}

function abrirDatepicker(orig) {
  cerrarDatepicker();
  const escrito = dpLeerFecha(orig._dpTexto.value, dpTipo(orig));
  const actual = escrito || (dpEsIso(orig.value) ? orig.value : '');
  const { min, max } = dpLimites(orig);
  let base = actual || dpHoyIso();
  if (max && base > max) base = max;
  if (min && base < min) base = min;
  let [y, m] = base.split('-').map(Number);
  let vista = 'dias';
  // Nacimiento sin fecha: empezar eligiendo el año (alrededor de 18 años atrás)
  if (!actual && dpTipo(orig) === 'nacimiento') { y = new Date().getFullYear() - 18; vista = 'anios'; }

  const pop = document.createElement('div');
  pop.className = 'dp-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Calendario');
  document.body.appendChild(pop);

  dpAbierto = { input: orig, caja: orig._dpCaja, pop, anio: y, mes: m - 1, vista, cursor: actual || '', inicioAnios: y - 7 };
  orig._dpCaja.classList.add('dp-abierto');
  pop.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); }); // el foco sigue en el texto
  pop.addEventListener('click', dpClickPop);

  dpRender();
  dpPosicionar();
  requestAnimationFrame(() => pop.classList.add('dp-visible'));
}

function cerrarDatepicker() {
  if (!dpAbierto) return;
  dpAbierto.caja.classList.remove('dp-abierto');
  dpAbierto.pop.remove();
  dpAbierto = null;
}

const DP_FLECHA_IZQ = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
const DP_FLECHA_DER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

function dpRender() {
  const st = dpAbierto;
  const orig = st.input;
  const { min, max } = dpLimites(orig);
  const sel = orig.value;
  const hoy = dpHoyIso();
  let cuerpo = '';
  let titulo = '';
  if (st.vista === 'anios') {
    const desde = st.inicioAnios;
    titulo = `<button type="button" class="dp-titulo" data-ir="dias">${desde} – ${desde + 15}</button>`;
    const anioSel = dpEsIso(sel) ? +sel.slice(0, 4) : null;
    const anioHoy = +hoy.slice(0, 4);
    let celdas = '';
    for (let a = desde; a < desde + 16; a++) {
      const fuera = (min && a < +min.slice(0, 4)) || (max && a > +max.slice(0, 4));
      const cls = ['dp-celda', a === anioSel ? 'dp-sel' : '', a === anioHoy ? 'dp-hoy-marca' : '', a === st.anio && a !== anioSel ? 'dp-cursor' : ''].filter(Boolean).join(' ');
      celdas += `<button type="button" class="${cls}" data-anio="${a}"${fuera ? ' disabled' : ''}>${a}</button>`;
    }
    cuerpo = `<div class="dp-rejilla dp-rejilla-anios">${celdas}</div>`;
  } else if (st.vista === 'meses') {
    titulo = `<button type="button" class="dp-titulo" data-ir="anios" title="Elegir el año">${st.anio}</button>`;
    let celdas = '';
    for (let i = 0; i < 12; i++) {
      const ini = dpIsoDe(st.anio, i + 1, 1), fin = dpIsoDe(st.anio, i + 1, new Date(st.anio, i + 1, 0).getDate());
      const fuera = (min && fin < min) || (max && ini > max);
      const esSel = dpEsIso(sel) && +sel.slice(0, 4) === st.anio && +sel.slice(5, 7) === i + 1;
      const cls = ['dp-celda', esSel ? 'dp-sel' : '', i === st.mes && !esSel ? 'dp-cursor' : ''].filter(Boolean).join(' ');
      celdas += `<button type="button" class="${cls}" data-mes="${i}"${fuera ? ' disabled' : ''}>${DP_MESES_CORTOS[i]}</button>`;
    }
    cuerpo = `<div class="dp-rejilla">${celdas}</div>`;
  } else {
    titulo = `<button type="button" class="dp-titulo" data-ir="meses" title="Elegir el mes">${DP_MESES[st.mes]}</button>`
      + `<button type="button" class="dp-titulo" data-ir="anios" title="Elegir el año">${st.anio}</button>`;
    const primerDia = new Date(st.anio, st.mes, 1).getDay(); // 0 = domingo
    const offset = (primerDia + 6) % 7;                       // semana empieza en lunes
    const diasMes = new Date(st.anio, st.mes + 1, 0).getDate();
    let celdas = '';
    for (let i = 0; i < offset; i++) celdas += '<span class="dp-vacia"></span>';
    for (let d = 1; d <= diasMes; d++) {
      const iso = dpIsoDe(st.anio, st.mes + 1, d);
      const fuera = (min && iso < min) || (max && iso > max);
      const cls = ['dp-dia'];
      if (iso === sel) cls.push('dp-sel');
      if (iso === hoy) cls.push('dp-hoy-marca');
      if (iso === st.cursor && iso !== sel) cls.push('dp-cursor');
      celdas += `<button type="button" class="${cls.join(' ')}" data-iso="${iso}"${fuera ? ' disabled' : ''}>${d}</button>`;
    }
    cuerpo = `<div class="dp-semana">${DP_DIAS.map(d => `<span>${d}</span>`).join('')}</div><div class="dp-grid">${celdas}</div>`;
  }
  const opcional = !orig.required && !orig.dataset.obligatoria;
  const hoyFuera = dpFueraDeRango(orig, hoy) || dpTipo(orig) === 'nacimiento';
  const pie = [
    opcional && dpEsIso(sel) ? '<button type="button" class="dp-borrar">Borrar</button>' : '<span></span>',
    hoyFuera ? '' : '<button type="button" class="dp-hoy">Hoy</button>'
  ].join('');
  st.pop.innerHTML =
    `<div class="dp-head">
      <button type="button" class="dp-nav" data-dir="-1" aria-label="Anterior">${DP_FLECHA_IZQ}</button>
      <div class="dp-mesanio">${titulo}</div>
      <button type="button" class="dp-nav" data-dir="1" aria-label="Siguiente">${DP_FLECHA_DER}</button>
    </div>
    ${cuerpo}
    <div class="dp-foot">${pie}</div>`;
}

function dpClickPop(e) {
  // El clic ya se atiende aquí; que no llegue a los cierres globales por fuera.
  e.stopPropagation();
  const st = dpAbierto;
  if (!st) return;
  const nav = e.target.closest('.dp-nav');
  if (nav) {
    const dir = parseInt(nav.dataset.dir, 10);
    if (st.vista === 'anios') st.inicioAnios += dir * 16;
    else if (st.vista === 'meses') st.anio += dir;
    else {
      st.mes += dir;
      if (st.mes < 0) { st.mes = 11; st.anio--; } else if (st.mes > 11) { st.mes = 0; st.anio++; }
    }
    dpRender();
    dpPosicionar(); // el alto cambia si el mes ocupa otra fila
    return;
  }
  const ir = e.target.closest('[data-ir]');
  if (ir) {
    st.vista = ir.dataset.ir;
    if (st.vista === 'anios') st.inicioAnios = st.anio - 7;
    dpRender(); dpPosicionar();
    return;
  }
  const anio = e.target.closest('[data-anio]');
  if (anio && !anio.disabled) { st.anio = +anio.dataset.anio; st.vista = 'meses'; dpRender(); dpPosicionar(); return; }
  const mes = e.target.closest('[data-mes]');
  if (mes && !mes.disabled) { st.mes = +mes.dataset.mes; st.vista = 'dias'; dpRender(); dpPosicionar(); return; }
  if (e.target.closest('.dp-hoy')) { dpElegir(dpHoyIso()); return; }
  if (e.target.closest('.dp-borrar')) { dpElegir(''); return; }
  const dia = e.target.closest('.dp-dia');
  if (dia && !dia.disabled) dpElegir(dia.dataset.iso);
}

function dpElegir(iso) {
  const orig = dpAbierto.input;
  const cambia = orig.value !== iso;
  orig.value = iso; // dispara el hook → refresca el texto
  if (cambia) orig.dispatchEvent(new Event('change', { bubbles: true }));
  cerrarDatepicker();
  orig._dpTexto && orig._dpTexto.focus();
}

function dpPosicionar() {
  const r = dpAbierto.caja.getBoundingClientRect();
  const pop = dpAbierto.pop;
  const ancho = pop.offsetWidth;
  const alto = pop.offsetHeight;
  let left = r.left;
  let top = r.bottom + 6;
  if (left + ancho > window.innerWidth - 8) left = window.innerWidth - ancho - 8;
  if (left < 8) left = 8;
  if (top + alto > window.innerHeight - 8) top = r.top - alto - 6; // no cabe abajo → arriba
  pop.style.left = left + 'px';
  pop.style.top = Math.max(8, top) + 'px';
}

// Se ejecuta cuando el script se carga (al final del body, con el DOM ya listo).
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mejorarInputsFecha);
  else mejorarInputsFecha();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dpMascara, dpLeerFecha, dpTextoDe };
}
