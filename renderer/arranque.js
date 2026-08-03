// ─── ARRANQUE ────────────────────────────────────────────────────────────────
// Bienvenida para instalaciones nuevas y todo el código que se ejecuta al cargar
// la app (tema inicial, listeners a nivel superior, primeras llamadas). ÚLTIMO
// script cargado: aquí es seguro invocar cualquier función de los módulos previos.

// ─── BIENVENIDA (acceso obligatorio: cuenta de empresa) ────────────────────────
// AulaMovil es SaaS puro: toda instalación exige una cuenta de empresa
// conectada (credenciales guardadas y válidas, con o sin internet en ese
// momento) antes de dejar pasar a la app. Ya no existe un "continuar sin
// cuenta" ni se exime a instalaciones con datos locales previos: si no hay
// cuenta conectada, se abre este modal y se queda abierto sin vía de escape
// (ver el handler de click-fuera-cierra en renderer/utils-ui.js) hasta que el
// login o el registro tengan éxito.
// El gate cubre bienvenida y sus modales hijos (login/registro): mientras
// cualquiera de ellos esté resolviendo la cuenta, #app debe quedar oculto del
// todo (no solo difuminado). ocultarAppPorGate()/mostrarAppPorGate() (en
// renderer/sync-ui.js) son el único punto de entrada para esto.
function abrirBienvenida() {
  ocultarAppPorGate();
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

// Única fuente de verdad del gate: se llama en INIT, tras cerrar sesión y al
// cancelar login/registro (renderer/sync-ui.js). Abre (o reabre) el modal de
// bienvenida siempre que no haya cuenta conectada, sin mirar si ya hay datos
// locales. Si hay cuenta conectada pero los datos locales de este PC
// pertenecen a otra cuenta (conflictoEmpresa, ver sync.js), no deja pasar a
// la app: abre el modal de conflicto en su lugar (renderer/sync-ui.js).
async function comprobarBienvenida() {
  try {
    const estado = await window.api.getEstadoCuenta();
    if (estado && estado.conectado) {
      if (estado.conflictoEmpresa) { abrirConflictoEmpresa(estado.conflictoEmpresa, estado.email); return; }
      mostrarAppPorGate();
      return;
    }
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
