// ─── UTILIDADES DE UI ───────────────────────────────────────────────────────
// Helpers de formato/escapado (esc, fmt, fmtFecha, tagPermiso), apertura/cierre
// de modales, el bloque de TEMA (claro/oscuro/negro) y los toasts no bloqueantes.
// Va SEGUNDO: lo usan prácticamente todos los demás módulos.

// ─── MODALES ─────────────────────────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  // Avisos de validación de la vez anterior (otro alumno, otro profesor…) fuera
  m.querySelectorAll('.val-msg').forEach(x => x.remove());
  m.querySelectorAll('.val-ok, .val-aviso, .val-mal').forEach(x => { x.classList.remove('val-ok', 'val-aviso', 'val-mal'); x._valMsg = null; });
  m.querySelectorAll('.dp-msg').forEach(x => x.remove());
  m.querySelectorAll('.dp-error').forEach(x => x.classList.remove('dp-error'));
  m.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (typeof cerrarDatepicker === 'function') cerrarDatepicker();
}

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
// Clases con fracciones (¼, ½, ¾ — las anota el móvil): 2.5 → «2 ½», 0.75 → «¾».
function fmtClases(n) {
  const v = Math.round((Number(n) || 0) * 4) / 4;
  const ent = Math.floor(v), frac = ['', '¼', '½', '¾'][Math.round((v - ent) * 4)];
  return ent && frac ? `${ent} ${frac}` : frac || String(ent);
}
// Cantidad de clases escrita de cualquier forma (de ¼ en ¼): «12», «12,5», «12.5»,
// «0.25», «½», «12 ½», «1/2», «1 1/2». null si no se entiende. Igual que
// leerCantidadClases de db/core.js.
function leerClases(v) {
  if (typeof v === 'number') { const q = Math.round(v * 4); return Number.isFinite(v) && q >= 1 && Math.abs(v * 4 - q) < 1e-6 ? q / 4 : null; }
  const t = String(v == null ? '' : v).toLowerCase().replace(/\b(clases?|cl\.?)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const FR = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
  let n, r;
  if ((r = t.match(/^(\d+)?\s*([¼½¾])$/))) n = (r[1] ? +r[1] : 0) + FR[r[2]];
  else if ((r = t.match(/^(\d+)\s+(\d)\s*\/\s*(\d)$/))) n = +r[1] + (+r[3] ? +r[2] / +r[3] : NaN);
  else if ((r = t.match(/^(\d)\s*\/\s*(\d)$/))) n = +r[2] ? +r[1] / +r[2] : NaN;
  else if (/^\d*[.,]?\d+$/.test(t)) n = Number(t.replace(',', '.'));
  else return null;
  const q = Math.round(n * 4);
  return Number.isFinite(n) && q >= 1 && Math.abs(n * 4 - q) < 1e-6 ? q / 4 : null;
}
// 12.5 → «12,5» (para casillas de texto que luego se vuelven a leer)
const clasesEnCasilla = n => (n > 0 ? String(Math.round(n * 4) / 4).replace('.', ',') : '');
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

// ─── LISTAS LARGAS ───────────────────────────────────────────────────────────
// Con miles de alumnos (o de exámenes) pintar todas las filas de golpe tarda
// segundos. pintarPorTandas pinta las primeras al momento y añade las demás
// cuando el usuario se acerca al final (una fila «centinela» vigilada con
// IntersectionObserver). Cada llamada sustituye a la anterior de esa tabla.
const sinTildes = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const COLLATOR_ES = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
// Ejecuta fn cuando se deja de llamar durante `ms` (teclear en un buscador).
function retrasar(fn, ms = 140) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function pintarPorTandas(tbody, items, filaHTML, { tanda = 80, columnas = 1 } = {}) {
  if (tbody._tandas) tbody._tandas.disconnect();
  tbody._tandas = null;
  let hechas = 0;
  const siguiente = () => {
    const trozo = items.slice(hechas, hechas + tanda);
    hechas += trozo.length;
    const viejo = tbody.querySelector('tr.fila-centinela');
    if (viejo) viejo.remove();
    tbody.insertAdjacentHTML('beforeend', trozo.map(filaHTML).join('') +
      (hechas < items.length ? `<tr class="fila-centinela"><td colspan="${columnas}">Cargando ${Math.min(tanda, items.length - hechas)} más…</td></tr>` : ''));
    const centinela = tbody.querySelector('tr.fila-centinela');
    if (centinela && tbody._tandas) tbody._tandas.observe(centinela);
  };
  tbody.innerHTML = '';
  if (typeof IntersectionObserver === 'function' && items.length > tanda) {
    const obs = new IntersectionObserver(entradas => {
      if (entradas.some(e => e.isIntersecting)) { obs.unobserve(entradas[0].target); siguiente(); }
    }, { rootMargin: '600px 0px' });
    tbody._tandas = obs;
  }
  siguiente();
  if (!tbody._tandas) while (hechas < items.length) siguiente();
}

// Desplegables de alumnos (agenda, exámenes, bonos…): con miles de fichas,
// «Apellidos, Nombre» ordenado, primero los que están en curso y los
// terminados (aprobados, bajas, inactivos) aparte, al final.
// Nombre y primer apellido (así se distinguen dos alumnos que se llaman igual). Igual que
// nombreCorto de db/core.js: si el nombre ya trae el apellido no se repite.
function nombreCortoAlumno(a) {
  if (!a) return '';
  const nombre = String(a.nombre || '').trim(), apellido = String(a.primer_apellido || '').trim();
  if (!apellido) return nombre;
  const plano = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return plano(nombre).includes(plano(apellido)) ? nombre : `${nombre} ${apellido}`;
}
const ESTADOS_ALUMNO_TERMINADO = ['baja', 'aprobado', 'apto', 'no_apto', 'inactivo'];
function nombreAlumnoLista(a) {
  const ap = [a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ');
  return ap ? `${ap}, ${a.nombre}` : (a.nombre || '');
}
function opcionesAlumnosHTML(alumnos, seleccionado) {
  const ord = (alumnos || []).filter(a => !a.deleted).slice().sort((x, y) => COLLATOR_ES.compare(nombreAlumnoLista(x), nombreAlumnoLista(y)));
  const sel = seleccionado == null ? '' : String(seleccionado);
  const op = a => `<option value="${a.id}"${String(a.id) === sel ? ' selected' : ''}>${esc(nombreAlumnoLista(a))}${a.n_registro ? ' · nº ' + esc(a.n_registro) : ''}</option>`;
  const fuera = a => ESTADOS_ALUMNO_TERMINADO.includes(a.estado);
  const terminados = ord.filter(fuera);
  return ord.filter(a => !fuera(a)).map(op).join('') +
    (terminados.length ? `<optgroup label="Terminados (aprobados, bajas e inactivos)">${terminados.map(op).join('')}</optgroup>` : '');
}

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

