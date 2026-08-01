// ─── ARRANQUE ────────────────────────────────────────────────────────────────
// Bienvenida para instalaciones nuevas y todo el código que se ejecuta al cargar
// la app (tema inicial, listeners a nivel superior, primeras llamadas). ÚLTIMO
// script cargado: aquí es seguro invocar cualquier función de los módulos previos.

// ─── BIENVENIDA (instalación nueva) ────────────────────────────────────────────
const BIENVENIDA_DESCARTADA_KEY = 'kmalumnos_bienvenida_descartada';

function abrirBienvenida() {
  openModal('modal-bienvenida');
}

function bienvenidaCrearEmpresa() {
  closeModal('modal-bienvenida');
  abrirCrearEmpresa();
}

function bienvenidaIniciarSesion() {
  closeModal('modal-bienvenida');
  abrirCredsSync();
}

function continuarSinCuenta() {
  try { localStorage.setItem(BIENVENIDA_DESCARTADA_KEY, '1'); } catch (e) {}
  closeModal('modal-bienvenida');
  comprobarTutorial('dashboard');
}

async function comprobarBienvenida() {
  try {
    if (localStorage.getItem(BIENVENIDA_DESCARTADA_KEY) === '1') return;
    const estado = await window.api.getEstadoCuenta();
    if (estado && estado.conectado) return;
    const resumen = await window.api.getResumen();
    if (!resumen || resumen.vehiculos > 0 || resumen.alumnos > 0 || resumen.practicas > 0) return;
    abrirBienvenida();
  } catch (e) {}
}


// ─── INIT ─────────────────────────────────────────────────────────────────────
aplicarTema(getTema());
document.getElementById('relleno-vehiculo')?.addEventListener('change', actualizarContadorSinKm);
document.getElementById('rr-vehiculo')?.addEventListener('change', loadRegistroRapido);
document.getElementById('rr-profesor')?.addEventListener('change', (e) => { rrProfesorActual = e.target.value || null; });
document.getElementById('rr-tipo')?.addEventListener('change', (e) => { rrTipoActual = e.target.value || 'circulacion'; });
// loadDashboard() es async (espera a window.api.getResumen() por IPC) y no se
// esperaba antes de lanzar el tutorial: si comprobarBienvenida() resolvía antes
// (p.ej. la bienvenida ya estaba descartada, caso normal en instalaciones con datos),
// el tutorial del panel principal se pintaba con las tarjetas todavía a 0. Se espera
// a que ambas promesas terminen antes de comprobar si toca mostrar el tutorial.
const dashboardListo = loadDashboard().catch(() => {});
aplicarPermisosPorRol();
comprobarBienvenida().catch(() => {}).then(() => dashboardListo).then(() => comprobarTutorial('dashboard'));
window.api.getVersion().then(v => {
  const el = document.getElementById('app-version');
  if (el) el.textContent = 'v' + v;
});
window.api.ventanaEstaMaximizada().then(actualizarIconoMaximizar).catch(() => {});
