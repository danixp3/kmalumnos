// ─── ESTADO GLOBAL Y NAVEGACIÓN ────────────────────────────────────────────
// Fix de foco de diálogos nativos, estado/caches compartidos por todos los módulos
// del renderer, constantes de dominio y la navegación entre pestañas del sidebar.
// Debe cargarse PRIMERO: el resto de módulos asume que este estado ya existe.

// ─── DIÁLOGOS NATIVOS (fix de foco) ────────────────────────────────────────────
// Los diálogos nativos de Chromium dejan los inputs sin foco en Electron
// (bug conocido): tras cada confirm/alert forzamos blur+focus de la ventana.
const _confirm = window.confirm.bind(window);
const _alert = window.alert.bind(window);
window.confirm = (msg) => { const r = _confirm(msg); window.api.refocus(); return r; };
window.alert = (msg) => { _alert(msg); window.api.refocus(); };

// ─── ESTADO ──────────────────────────────────────────────────────────────────
let currentAlumnoId = null;
let currentAlumnoVehiculoId = null;
let selectedCsvPath = null;
let vehiculosCache = [];
let profesoresCache = [];
let alumnosCache = [];
let alumnosSort = { col: null, dir: 1 };
let deudasCache = [];
let deudasSort = { col: null, dir: 1 };
let statsProfesoresCache = [];
let statsProfesoresSort = { col: 'num_practicas', dir: -1 };
let practicasGlobalCache = [];
let practicasGlobalSort = { col: 'fecha', dir: -1 };
let reservasCache = [];

// ─── NAVEGACIÓN ──────────────────────────────────────────────────────────────
document.querySelectorAll('#sidebar nav a').forEach(link => {
  link.addEventListener('click', () => {
    const page = link.dataset.page;
    document.querySelectorAll('#sidebar nav a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('page-' + page);
    pageEl.classList.add('active');
    // Marca temporal: las filas de las tablas entran en cascada SOLO al abrir la
    // pantalla. Al filtrar/buscar la tabla se repinta con la página ya activa (sin
    // esta clase), así que no re-animan y no marean.
    pageEl.classList.add('entrando');
    clearTimeout(pageEl._entrandoTimer);
    pageEl._entrandoTimer = setTimeout(() => pageEl.classList.remove('entrando'), 1500);
    // El dashboard rellena sus tarjetas con una llamada IPC async: si el tutorial se
    // comprobara antes de que termine, se pintaría señalando tarjetas todavía a 0
    // (mismo fallo que en el arranque, ver arranque.js). Se espera a que cargue.
    let dashboardListo = Promise.resolve();
    if (page === 'dashboard') dashboardListo = loadDashboard().catch(() => {});
    if (page === 'vehiculos') { loadVehiculos(); aplicarRangoPref('relleno-min', 'relleno-max'); }
    if (page === 'profesores') { loadProfesores(); loadStatsProfesores(); }
    if (page === 'pagos') {
      const activeTab = document.querySelector('#page-pagos .page-tab.active')?.dataset.tab || 'deudas';
      cambiarTabPagos(activeTab);
    }
    if (page === 'alumnos') { loadVehiculosSelect(); llenarSelectProfesores('a-profesor'); loadAlumnos(); }
    if (page === 'reservas') loadReservas();
    if (page === 'practicas-global') loadPracticasGlobal();
    if (page === 'kilometros') {
      const activeTab = document.querySelector('#page-kilometros .page-tab.active')?.dataset.tab || 'mapa';
      cambiarTabKilometros(activeTab);
    }
    if (page === 'datos') {
      const activeTab = document.querySelector('#page-datos .page-tab.active')?.dataset.tab || 'importar';
      cambiarTabDatos(activeTab);
    }
    if (page === 'logs') loadLogs();
    if (page === 'registro-rapido') loadRegistroRapidoInit();
    if (page === 'ajustes') loadAjustes();
    dashboardListo.then(() => comprobarTutorial(page));
  });
});

