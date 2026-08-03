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

