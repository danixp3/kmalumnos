// ─── HISTORIAL DE PANTALLAS (botones laterales del ratón) ────────────────────
// Como en un navegador: el botón lateral de abajo del ratón (o Alt+←) vuelve a
// la pantalla anterior y el de arriba (o Alt+→) va a la siguiente. Cada
// «pantalla» es una sección del menú o la ficha de un alumno. Se apunta solo:
// estado.js (al cambiar de sección) y practicas.js (al abrir o cerrar una
// ficha) llaman a navRegistrar().
// Con una ventana o un diálogo abierto encima no se mueve nada (se perdería lo
// que se está escribiendo); con cambios sin guardar en Puesta en marcha o en
// los datos de la ficha, se pregunta antes.

const NAV_MAX = 60;
let navPila = [];          // [{ page, alumno: { id, vehiculoId, nombre } | null }]
let navPos = -1;
let navRestaurando = false;
let navOcupado = false;

function navPaginaActiva() {
  return document.querySelector('#sidebar nav a.active')?.dataset.page
    || (document.querySelector('.page.active')?.id || 'page-dashboard').replace(/^page-/, '');
}

function navFichaAbierta() {
  const v = document.getElementById('view-practicas');
  return !!v && v.style.display === 'block' && typeof currentAlumnoId !== 'undefined' && currentAlumnoId != null;
}

function navEstadoActual() {
  const page = navPaginaActiva();
  const alumno = page === 'alumnos' && navFichaAbierta()
    ? { id: currentAlumnoId, vehiculoId: typeof currentAlumnoVehiculoId !== 'undefined' ? currentAlumnoVehiculoId : null, nombre: document.getElementById('practicas-titulo')?.textContent || '' }
    : null;
  return { page, alumno };
}

const navMismo = (a, b) => !!a && !!b && a.page === b.page && (a.alumno ? a.alumno.id : null) === (b.alumno ? b.alumno.id : null);

// La pantalla que se ve al arrancar (antes de que nadie navegue)
const navInicial = navEstadoActual();

function navRegistrar(estado = navEstadoActual()) {
  if (navRestaurando || !estado || !estado.page) return;
  if (!navPila.length && !navMismo(navInicial, estado)) navPila.push(navInicial);
  if (navMismo(navPila[navPos], estado)) { navPila[navPos] = estado; return; }
  navPila = navPila.slice(0, navPos + 1);
  navPila.push(estado);
  if (navPila.length > NAV_MAX) navPila.splice(0, navPila.length - NAV_MAX);
  navPos = navPila.length - 1;
}

// ¿Hay algo abierto encima (ventana, diálogo, calendario)?
function navHayAlgoEncima() {
  return !!document.querySelector('.overlay.open, .dp-pop.dp-visible');
}

async function navPuedeSalir() {
  if (typeof pmSucio !== 'undefined' && pmSucio && navPaginaActiva() === 'puesta-en-marcha') {
    return await confirmar('Hay cambios sin guardar en Puesta en marcha. Si cambias de pantalla se pierden.', { titulo: 'Cambios sin guardar', textoAceptar: 'Salir sin guardar' });
  }
  if (typeof fdEditando !== 'undefined' && fdEditando && navFichaAbierta()) {
    return await confirmar('Estás editando los datos del alumno y no los has guardado. Si cambias de pantalla se pierden.', { titulo: 'Cambios sin guardar', textoAceptar: 'Salir sin guardar' });
  }
  return true;
}

function navAplicar(e) {
  const link = document.querySelector(`#sidebar nav a[data-page="${e.page}"]`);
  if (!link) return false;
  if (e.alumno) {
    if (navPaginaActiva() !== 'alumnos') link.click();
    verPracticas(e.alumno.id, e.alumno.vehiculoId, e.alumno.nombre);
    return true;
  }
  if (e.page === 'alumnos' && navFichaAbierta()) {
    if (navPaginaActiva() !== 'alumnos') link.click();
    volverAlumnos();
    return true;
  }
  link.click();
  return true;
}

// delta = -1 (atrás) o +1 (adelante)
async function navIr(delta) {
  if (navOcupado || navHayAlgoEncima()) return;
  if (typeof tutorialEnCurso === 'function' && tutorialEnCurso()) return;
  if (!navPila.length) navPila.push(navInicial), navPos = 0;
  const destino = navPos + delta;
  if (destino < 0 || destino >= navPila.length) return;
  navOcupado = true;
  try {
    if (!(await navPuedeSalir())) return;
    if (typeof pmSucio !== 'undefined') pmSucio = false;
    if (typeof fdEditando !== 'undefined' && navFichaAbierta()) fdEditando = false;
    navRestaurando = true;
    try { if (navAplicar(navPila[destino])) navPos = destino; } finally { navRestaurando = false; }
  } finally {
    navOcupado = false;
  }
}

// Botones laterales: 3 = el de abajo (atrás), 4 = el de arriba (adelante).
// También se anula su acción por defecto al pulsarlos (main.js bloquea además
// la navegación de Electron con 'app-command').
document.addEventListener('mousedown', e => { if (e.button === 3 || e.button === 4) e.preventDefault(); });
document.addEventListener('mouseup', e => {
  if (e.button !== 3 && e.button !== 4) return;
  e.preventDefault();
  navIr(e.button === 3 ? -1 : 1);
});
document.addEventListener('keydown', e => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  navIr(e.key === 'ArrowLeft' ? -1 : 1);
});
