// ─── SELECTOR DE FECHA PROPIO ─────────────────────────────────────────────────
// Sustituye los <input type="date"> nativos (calendario del sistema, no
// estilizable) por un calendario propio con el tema de la app. No invasivo: el
// input original se conserva como almacén oculto que mantiene su id, su valor en
// formato ISO 'YYYY-MM-DD' y su onchange; solo cambia cómo se ve y se elige.

const DP_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DP_DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
let dpAbierto = null; // { input, anchor, pop, anio, mes }

const dpPad = n => String(n).padStart(2, '0');
const dpEsIso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function dpHoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${dpPad(d.getMonth() + 1)}-${dpPad(d.getDate())}`;
}

// Convierte todos los campos de fecha nativos y engancha el cierre global.
function mejorarInputsFecha() {
  document.querySelectorAll('input[type="date"]').forEach(dpUpgrade);
  document.addEventListener('click', e => {
    if (dpAbierto && !dpAbierto.pop.contains(e.target) && e.target !== dpAbierto.anchor) cerrarDatepicker();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarDatepicker(); });
  window.addEventListener('resize', cerrarDatepicker);
  window.addEventListener('scroll', cerrarDatepicker, true);
}

function dpUpgrade(orig) {
  if (orig._dpUpgraded) return;
  orig._dpUpgraded = true;

  const wrap = document.createElement('div');
  wrap.className = 'datepicker';
  orig.parentNode.insertBefore(wrap, orig);

  const anchor = document.createElement('button');
  anchor.type = 'button';
  anchor.className = 'dp-trigger';
  // Traslada el ancho del input original (p. ej. width:100% en los modales) al
  // contenedor, y deja el botón al 100% para que lo rellene.
  if (orig.style.width) { wrap.style.width = orig.style.width; anchor.style.width = '100%'; }
  anchor.innerHTML = '<span class="dp-txt"></span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

  // El input pasa a oculto: conserva id, value y onchange, pero no se ve.
  orig.type = 'hidden';
  wrap.appendChild(orig);
  wrap.appendChild(anchor);
  orig._dpAnchor = anchor;

  // Hook del value: cuando el código de la app cambie la fecha por su cuenta
  // (hoy por defecto, día ±1, limpiar filtros...), el botón se refresca solo.
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(orig, 'value', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); dpRefrescarTexto(orig); }
  });

  dpRefrescarTexto(orig);
  anchor.addEventListener('click', e => { e.stopPropagation(); dpToggle(orig, anchor); });
}

function dpRefrescarTexto(orig) {
  const anchor = orig._dpAnchor;
  if (!anchor) return;
  const txt = anchor.querySelector('.dp-txt');
  const iso = orig.value;
  if (dpEsIso(iso)) {
    txt.textContent = fmtFecha(iso);
    anchor.classList.remove('dp-vacio');
  } else {
    txt.textContent = 'dd/mm/aaaa';
    anchor.classList.add('dp-vacio');
  }
}

function dpToggle(orig, anchor) {
  if (dpAbierto && dpAbierto.input === orig) { cerrarDatepicker(); return; }
  abrirDatepicker(orig, anchor);
}

function abrirDatepicker(orig, anchor) {
  cerrarDatepicker();
  const base = dpEsIso(orig.value) ? orig.value : dpHoyIso();
  const [y, m] = base.split('-').map(Number);

  const pop = document.createElement('div');
  pop.className = 'dp-pop';
  document.body.appendChild(pop);

  dpAbierto = { input: orig, anchor, pop, anio: y, mes: m - 1 };
  anchor.classList.add('dp-abierto');
  pop.addEventListener('click', dpClickPop);

  dpRender();
  dpPosicionar();
  requestAnimationFrame(() => pop.classList.add('dp-visible'));
}

function cerrarDatepicker() {
  if (!dpAbierto) return;
  dpAbierto.anchor.classList.remove('dp-abierto');
  dpAbierto.pop.remove();
  dpAbierto = null;
}

function dpRender() {
  const st = dpAbierto;
  const primerDia = new Date(st.anio, st.mes, 1).getDay(); // 0 = domingo
  const offset = (primerDia + 6) % 7;                       // semana empieza en lunes
  const diasMes = new Date(st.anio, st.mes + 1, 0).getDate();
  const sel = st.input.value;
  const hoy = dpHoyIso();

  let celdas = '';
  for (let i = 0; i < offset; i++) celdas += '<span class="dp-vacia"></span>';
  for (let d = 1; d <= diasMes; d++) {
    const iso = `${st.anio}-${dpPad(st.mes + 1)}-${dpPad(d)}`;
    const cls = ['dp-dia'];
    if (iso === sel) cls.push('dp-sel');
    if (iso === hoy) cls.push('dp-hoy-marca');
    celdas += `<button type="button" class="${cls.join(' ')}" data-iso="${iso}">${d}</button>`;
  }

  st.pop.innerHTML =
    `<div class="dp-head">
      <button type="button" class="dp-nav" data-dir="-1" aria-label="Mes anterior"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
      <div class="dp-mesanio">${DP_MESES[st.mes]} ${st.anio}</div>
      <button type="button" class="dp-nav" data-dir="1" aria-label="Mes siguiente"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>
    <div class="dp-semana">${DP_DIAS.map(d => `<span>${d}</span>`).join('')}</div>
    <div class="dp-grid">${celdas}</div>
    <div class="dp-foot"><button type="button" class="dp-hoy">Hoy</button></div>`;
}

function dpClickPop(e) {
  const nav = e.target.closest('.dp-nav');
  if (nav) {
    dpAbierto.mes += parseInt(nav.dataset.dir, 10);
    if (dpAbierto.mes < 0) { dpAbierto.mes = 11; dpAbierto.anio--; }
    else if (dpAbierto.mes > 11) { dpAbierto.mes = 0; dpAbierto.anio++; }
    dpRender();
    return;
  }
  if (e.target.closest('.dp-hoy')) { dpElegir(dpHoyIso()); return; }
  const dia = e.target.closest('.dp-dia');
  if (dia) dpElegir(dia.dataset.iso);
}

function dpElegir(iso) {
  const orig = dpAbierto.input;
  orig.value = iso; // dispara el hook → refresca el botón
  orig.dispatchEvent(new Event('change', { bubbles: true }));
  cerrarDatepicker();
}

function dpPosicionar() {
  const r = dpAbierto.anchor.getBoundingClientRect();
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mejorarInputsFecha);
} else {
  mejorarInputsFecha();
}
