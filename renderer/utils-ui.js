// ─── UTILIDADES DE UI ───────────────────────────────────────────────────────
// Helpers de formato/escapado (esc, fmt, fmtFecha, tagPermiso), apertura/cierre
// de modales, el bloque de TEMA (claro/oscuro/negro) y los toasts no bloqueantes.
// Va SEGUNDO: lo usan prácticamente todos los demás módulos.

// ─── MODALES ─────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Cerrar modal al hacer click fuera.
// Se exige que el clic EMPIECE y TERMINE en el fondo: si se pulsa dentro del
// cuadro y se suelta fuera (al arrastrar o seleccionar texto), el evento click
// se dispara sobre el overlay por ser el ancestro común, y no debe cerrar.
// Excepción: 'modal-bienvenida' es el gate de cuenta obligatoria (ver
// renderer/arranque.js) — sin cuenta conectada no tiene vía de escape, ni
// siquiera haciendo click fuera. 'modal-conflicto-empresa' es igual de
// bloqueante (renderer/sync-ui.js): solo se sale de él con uno de sus dos
// botones. Los modales de login/registro que abre modal-bienvenida sí se
// pueden cerrar, pero al hacerlo se reevalúa el gate y reaparece si sigue sin
// cuenta conectada.
document.querySelectorAll('.overlay').forEach(overlay => {
  let pulsadoEnElFondo = false;

  overlay.addEventListener('mousedown', e => {
    pulsadoEnElFondo = (e.target === overlay);
  });

  overlay.addEventListener('click', e => {
    const cierra = e.target === overlay && pulsadoEnElFondo;
    pulsadoEnElFondo = false;
    if (!cierra) return;
    if (overlay.id === 'modal-bienvenida' || overlay.id === 'modal-conflicto-empresa') return;
    overlay.classList.remove('open');
    if (overlay.id === 'modal-sync-creds' || overlay.id === 'modal-crear-empresa') {
      detenerReintentoLogin();
      comprobarBienvenida();
    }
  });
});

// ─── HELPERS DEL REDISEÑO (fechas cortas, iniciales, miles) ─────────────────
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtMiles = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtDec = n => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Number(n) || 0);
const parteFecha = iso => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d, dow: new Date(y, m - 1, d).getDay() }; };
// "lun 28 sep"
const fechaCorta = iso => { const f = parteFecha(iso); return `${DIAS_CORTOS[f.dow]} ${f.d} ${MESES_CORTOS[f.m - 1]}`; };
// "28 sep"
const diaMes = iso => { const f = parteFecha(iso); return `${f.d} ${MESES_CORTOS[f.m - 1]}`; };
function hoyISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
// Días enteros entre dos fechas ISO (b - a).
function diasEntre(a, b) {
  const fa = parteFecha(a), fb = parteFecha(b);
  return Math.round((Date.UTC(fb.y, fb.m - 1, fb.d) - Date.UTC(fa.y, fa.m - 1, fa.d)) / 86400000);
}
// "Hoy, 09:15" / "Mañana" / "Ayer" / "lun 28 sep"
function fechaRelativa(iso, hora) {
  if (!iso) return '';
  const d = diasEntre(hoyISO(), iso);
  let txt;
  if (d === 0) txt = 'Hoy'; else if (d === 1) txt = 'Mañana'; else if (d === -1) txt = 'Ayer';
  else { const c = fechaCorta(iso); txt = c.charAt(0).toUpperCase() + c.slice(1); }
  return hora ? `${txt}, ${hora}` : txt;
}
// Iniciales para el avatar: "Lucía Martín Pérez" → "LM"
function iniciales(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}
// Matrícula con aspecto de placa europea (estilos .placa en styles.css)
function placaHTML(matricula, grande) {
  if (!matricula) return '';
  return `<span class="placa${grande ? ' placa-lg' : ''}"><span class="placa-e" aria-hidden="true">E</span><span class="placa-num">${esc(matricula)}</span></span>`;
}

// Menús "⋯" de las filas de tabla (<details class="menu-fila">): se cierran al
// hacer clic fuera, al elegir una opción o al desplazar la página, y solo puede
// haber uno abierto. La lista flota junto a su botón (position:fixed): así no la
// recorta la tabla (que hace scroll lateral en ventanas estrechas) ni la tapa lo
// que viene detrás; si no cabe por debajo, se abre hacia arriba.
document.addEventListener('click', e => {
  document.querySelectorAll('details.menu-fila[open]').forEach(d => {
    if (!d.contains(e.target) || e.target.closest('.menu-fila-lista button')) d.removeAttribute('open');
  });
});
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.classList.contains('menu-fila')) return;
  const lista = d.querySelector('.menu-fila-lista');
  if (!lista) return;
  if (!d.open) { lista.style.cssText = ''; return; }
  document.querySelectorAll('details.menu-fila[open]').forEach(o => { if (o !== d) o.removeAttribute('open'); });
  const b = d.querySelector('summary').getBoundingClientRect();
  Object.assign(lista.style, { position: 'fixed', zIndex: '160', left: 'auto', right: Math.max(8, window.innerWidth - b.right) + 'px' });
  const alto = lista.offsetHeight;
  if (b.bottom + 4 + alto > window.innerHeight - 8 && b.top - 4 - alto > 8) Object.assign(lista.style, { top: 'auto', bottom: (window.innerHeight - b.top + 4) + 'px' });
  else Object.assign(lista.style, { bottom: 'auto', top: (b.bottom + 4) + 'px' });
}, true);
const cerrarMenusFila = () => document.querySelectorAll('details.menu-fila[open]').forEach(d => d.removeAttribute('open'));
window.addEventListener('scroll', e => { if (!(e.target.closest && e.target.closest('.menu-fila-lista'))) cerrarMenusFila(); }, true);
window.addEventListener('resize', cerrarMenusFila);

// ─── UTILS ───────────────────────────────────────────────────────────────────
function fmt(num) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(num);
}

// Anima un contador desde su valor actual hasta `valorFinal` con una curva suave.
// `formato` (opcional) recibe el número entero de cada fotograma y devuelve el texto
// a mostrar (p. ej. v => v + ' km' o v => fmt(v) + ' €'). Respeta "reducir movimiento"
// y no re-anima si el valor no ha cambiado.
function animarContador(el, valorFinal, formato, sinFlash) {
  if (!el) return;
  const fmtTxt = typeof formato === 'function' ? formato : (v => String(v));
  valorFinal = Number(valorFinal) || 0;

  // Valor de partida = número que ya se muestra (0 en el primer pintado).
  const desde = parseFloat(String(el.textContent).replace(/[^\d.-]/g, '')) || 0;

  // Cancela cualquier animación anterior sobre este mismo elemento.
  if (el._contadorRAF) cancelAnimationFrame(el._contadorRAF);

  // Destello cuando el valor cambia respecto a uno real anterior (no en el primer
  // pintado desde 0), para que se note qué acaba de cambiar.
  if (!sinFlash && desde !== 0 && desde !== valorFinal) {
    el.classList.remove('valor-flash');
    void el.offsetWidth;
    el.classList.add('valor-flash');
    setTimeout(() => el.classList.remove('valor-flash'), 800);
  }

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || desde === valorFinal) {
    el.textContent = fmtTxt(valorFinal);
    return;
  }

  const duracion = 800;
  const t0 = performance.now();
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  const paso = (ahora) => {
    const t = Math.min(1, (ahora - t0) / duracion);
    const valor = Math.round(desde + (valorFinal - desde) * easeOut(t));
    el.textContent = fmtTxt(valor);
    if (t < 1) {
      el._contadorRAF = requestAnimationFrame(paso);
    } else {
      el.textContent = fmtTxt(valorFinal);
      el._contadorRAF = null;
    }
  };
  el._contadorRAF = requestAnimationFrame(paso);
}

function fmtFecha(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tagPermiso(p) {
  const cls = p === 'B' ? 'tag-b' : p === 'C' ? 'tag-c' : 'tag-a';
  return `<span class="tag ${cls}">${p}</span>`;
}

// ─── TEMA ─────────────────────────────────────────────────────────────────────
const TEMA_KEY = 'kmalumnos_tema';
const ICONO_TEMA_SOL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const ICONO_TEMA_LUNA = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function getTema() {
  try {
    const t = localStorage.getItem(TEMA_KEY);
    if (t === 'claro' || t === 'oscuro' || t === 'negro') return t;
  } catch (e) {}
  return 'claro';
}

function aplicarTema(t) {
  if (t === 'claro') document.body.removeAttribute('data-theme');
  else document.body.setAttribute('data-theme', t);

  const btn = document.getElementById('tb-tema');
  if (btn) btn.innerHTML = t === 'claro' ? ICONO_TEMA_SOL : ICONO_TEMA_LUNA;

  document.querySelectorAll('#tema-menu .tema-menu-item').forEach(el => {
    el.classList.toggle('activa', el.dataset.tema === t);
  });
}

function guardarTema(t) {
  try { localStorage.setItem(TEMA_KEY, t); } catch (e) {}
  const color = t === 'negro' ? '#000000' : t === 'oscuro' ? '#0f172a' : '#f6f7f9';
  if (window.api && window.api.guardarTemaFondo) window.api.guardarTemaFondo(color).catch(() => {});
}

function elegirTema(t) {
  aplicarTema(t);
  guardarTema(t);
  document.getElementById('tema-menu')?.classList.add('hidden');
}

function toggleMenuTema() {
  document.getElementById('tema-menu')?.classList.toggle('hidden');
}

document.getElementById('tb-tema')?.addEventListener('click', (e) => { e.stopPropagation(); toggleMenuTema(); });
document.addEventListener('click', (e) => {
  const menu = document.getElementById('tema-menu');
  if (!menu || menu.classList.contains('hidden')) return;
  if (!menu.contains(e.target)) menu.classList.add('hidden');
});


// ─── TOASTS (mensajes no bloqueantes) ─────────────────────────────────────────
let toastTimers = {};

function showToast(elementId, msg, type = 'err') {
  const el = document.getElementById(elementId);
  if (!el) return;
  clearTimeout(toastTimers[elementId]);
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  toastTimers[elementId] = setTimeout(() => hideToast(elementId), 4000);
}

function hideToast(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  clearTimeout(toastTimers[elementId]);
  el.classList.add('hidden');
}

