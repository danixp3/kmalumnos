// ─── TUTORIAL INTERACTIVO ───────────────────────────────────────────────────
// Tutorial guiado por secciones (27 pasos): foco visual, bocadillo, navegación
// entre pasos y persistencia de qué tutoriales ya se han visto.

// ─── TUTORIAL ───────────────────────────────────────────────────────────────
const TUTORIAL_VISTO_KEY = 'kmalumnos_tutorial_visto';

function getTutorialVisto() {
  try {
    const raw = localStorage.getItem(TUTORIAL_VISTO_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object') return v;
    }
  } catch (e) {}
  return {};
}

function marcarTutorialVisto(page) {
  try {
    const v = getTutorialVisto();
    v[page] = true;
    localStorage.setItem(TUTORIAL_VISTO_KEY, JSON.stringify(v));
  } catch (e) {}
}

const TUTORIAL_PASOS = {
  dashboard: [
    { sel: '#page-dashboard .stats', pos: 'bottom',
      titulo: 'Tus estadísticas de un vistazo',
      texto: 'Estas tarjetas resumen vehículos, alumnos y prácticas. En Ajustes → Preferencias puedes elegir cuáles ver aquí.' },
    { sel: '#dash-alertas', pos: 'bottom',
      titulo: 'Alertas que puedes seguir',
      texto: 'Si aparece un aviso de km sin rellenar o de solapamientos, haz clic en él: te lleva directo a la pantalla donde resolverlo.' },
    { sel: '#graficos-dashboard', pos: 'bottom',
      titulo: 'Gráficos del panel',
      texto: 'Activa los que te interesen desde Ajustes → Preferencias: kilómetros y prácticas por mes, por profesor, por vehículo o ingresos.' },
    { sel: '.quick-card-primary', pos: 'right',
      titulo: 'Registro Rápido',
      texto: 'Es el acceso al día a día: apunta en segundos las prácticas de todos los alumnos de un vehículo en una fecha.' },
    { sel: '#sync-bar', pos: 'right',
      titulo: 'Estado de la nube',
      texto: 'Aquí ves si tus datos están sincronizados. Haz clic para forzar una sincronización manual.' }
  ],
  alumnos: [
    { sel: '#a-permiso', pos: 'bottom',
      titulo: 'El permiso importa',
      texto: 'El permiso que elijas aquí determina la tarifa que se aplica y, por tanto, la deuda que genera cada práctica del alumno.' },
    { sel: '#f-alumnos-nombre', pos: 'bottom',
      titulo: 'Filtra la lista',
      texto: 'Busca por nombre o combina los filtros de vehículo, permiso y profesor para encontrar a un alumno al momento.' },
    { sel: '#tabla-alumnos tbody .btn-primary', pos: 'top',
      titulo: 'Prácticas y anotaciones',
      texto: 'El botón Prácticas abre su historial de km; Anotaciones guarda notas sueltas del alumno sin crear una práctica.' }
  ],
  vehiculos: [
    { sel: '#tabla-vehiculos', pos: 'top',
      titulo: 'El odómetro real',
      texto: 'La columna Km actual es el odómetro del vehículo: se actualiza solo con cada práctica y puedes corregirlo a mano con Editar.' },
    { sel: '.card-banner', pos: 'bottom',
      titulo: 'Relleno masivo de km',
      texto: 'Para las prácticas que se quedaron sin kilómetros, esto los genera automáticamente respetando el rango por defecto de Ajustes.' }
  ],
  'registro-rapido': [
    { sel: '#rr-vehiculo', pos: 'bottom',
      titulo: 'Elige vehículo y fecha',
      texto: 'Selecciona el vehículo y la fecha del día; los botones de flecha cambian de día sin tocar el teclado.' },
    { sel: '#rr-lista', pos: 'top',
      titulo: 'Un clic, una práctica',
      texto: 'Haz clic en un alumno para crear al instante su práctica del día. Los botones laterales del ratón también cambian de fecha.' },
    { sel: '#rr-profesor', pos: 'bottom',
      titulo: 'Profesor y tipo',
      texto: 'Elige aquí el profesor y si la práctica es de circulación o de pista antes de registrar; se aplican a las que anotes.' }
  ],
  pagos: [
    { sel: '#tabla-tarifas', pos: 'top', antes: () => cambiarTabPagos('tarifas'),
      titulo: 'Sin tarifa, sin deuda',
      texto: 'Define aquí el precio de circulación y pista por cada permiso. Si un permiso no tiene tarifa, sus prácticas no generan deuda.' },
    { sel: '#tabla-deudas', pos: 'top', antes: () => cambiarTabPagos('deudas'),
      titulo: 'Cómo se calcula el saldo',
      texto: 'Saldo pendiente = total generado − total pagado. El generado sale de sumar el precio de cada práctica según su tarifa.' },
    { sel: '#f-deudas-estado', pos: 'bottom',
      titulo: 'Filtra por estado',
      texto: 'Puedes ver solo quién tiene deuda, quién está al día o quién tiene prácticas sin tarifa asignada.' },
    { sel: '#tabla-deudas tbody .btn-primary', pos: 'top',
      titulo: 'Anotar pago y Desglose',
      texto: 'Anotar pago registra un ingreso del alumno. Desglose marca como pagadas primero las prácticas más antiguas, así ves qué queda pendiente.' }
  ],
  kilometros: [
    { sel: '#tab-kilometros-mapa', pos: 'bottom', antes: () => cambiarTabKilometros('mapa'),
      titulo: 'Mapa del vehículo',
      texto: 'Visualiza la línea de tiempo de kilómetros del vehículo elegido: cada tramo es una práctica.' },
    { sel: '#tab-kilometros-conflictos', pos: 'top', antes: () => cambiarTabKilometros('conflictos'),
      titulo: '¿Qué es un solapamiento?',
      texto: 'Ocurre cuando dos prácticas del mismo vehículo comparten el mismo tramo de km. "Corregir todo automáticamente" los reordena respetando la duración de cada una.' }
  ],
  datos: [
    { sel: '#tab-datos-importar', pos: 'bottom', antes: () => cambiarTabDatos('importar'),
      titulo: 'Importar desde CSV',
      texto: 'Carga un archivo con el formato indicado; si dejas los km en blanco, se generan solos con el rango por defecto.' },
    { sel: '#tab-datos-exportar', pos: 'bottom', antes: () => cambiarTabDatos('exportar'),
      titulo: 'Exportar y comparar',
      texto: 'Exporta tus prácticas a CSV o compara dos archivos para detectar diferencias antes de importar.' }
  ],
  profesores: [
    { sel: '#pf-nombre', pos: 'bottom',
      titulo: 'Asigna profesores',
      texto: 'Una vez creado, podrás asignarlo a un alumno o a una práctica concreta desde Alumnos o Registro Rápido.' },
    { sel: '#tabla-profesores', pos: 'top',
      titulo: 'Borrar es seguro',
      texto: 'Si borras un profesor, las prácticas que ya impartió conservan su nombre; no se pierde ningún dato histórico.' }
  ],
  logs: [
    { sel: '#logs-result', pos: 'top',
      titulo: 'Historial de la app',
      texto: 'Aquí quedan registradas las operaciones automáticas (rellenos masivos, correcciones) y los conflictos de sincronización entre dispositivos.' }
  ],
  ajustes: [
    { sel: '#ajustes-sync-estado', pos: 'bottom',
      titulo: 'Cuenta de empresa',
      texto: 'Inicia sesión para que tus datos viajen solo entre tus dispositivos, protegidos de otras autoescuelas que usen la app.' },
    { sel: '.card-banner-success', pos: 'top',
      titulo: 'Copias de seguridad',
      texto: 'Guarda una copia cuando quieras; las tarjetas de al lado te dejan restaurar la última automática o elegir un archivo antiguo.' },
    { sel: '#pref-km-min', pos: 'bottom',
      titulo: 'Tus preferencias',
      texto: 'Aquí fijas el rango de km por defecto, qué tarjetas ver en el panel principal, y puedes volver a lanzar estos tutoriales cuando quieras.' }
  ]
};

let tutorialFocoEl = null;
let tutorialBocadilloEl = null;
let tutorialActivo = false;
let tutorialPage = null;
let tutorialPasoIdx = 0;

function crearDomTutorial() {
  if (tutorialFocoEl) return;
  tutorialFocoEl = document.createElement('div');
  tutorialFocoEl.id = 'tutorial-foco';
  document.body.appendChild(tutorialFocoEl);

  tutorialBocadilloEl = document.createElement('div');
  tutorialBocadilloEl.id = 'tutorial-bocadillo';
  document.body.appendChild(tutorialBocadilloEl);
}

function comprobarTutorial(page) {
  if (!page) return;
  const pasos = TUTORIAL_PASOS[page];
  if (!pasos || !pasos.length) return;
  if (tutorialActivo) return;
  if (getTutorialVisto()[page]) return;
  if (document.querySelector('.overlay.open')) return;

  tutorialActivo = true;
  tutorialPage = page;
  tutorialPasoIdx = 0;
  crearDomTutorial();
  window.addEventListener('resize', tutorialAlRedimensionar);
  window.addEventListener('scroll', tutorialOnScroll, true);
  mostrarPasoTutorial(0);
}

let tutorialRafPending = false;
let tutorialScrollEndTimer = null;

// Throttlea el reposicionamiento durante el scroll con requestAnimationFrame para no
// saturar de cálculos de layout, y quita momentáneamente la transición CSS del foco y
// el bocadillo (si no, dan sensación de "arrastre" persiguiendo al elemento).
function tutorialOnScroll() {
  if (!tutorialActivo) return;

  if (tutorialFocoEl) tutorialFocoEl.classList.add('tutorial-sin-transicion');
  if (tutorialBocadilloEl) tutorialBocadilloEl.classList.add('tutorial-sin-transicion');
  clearTimeout(tutorialScrollEndTimer);
  tutorialScrollEndTimer = setTimeout(() => {
    if (tutorialFocoEl) tutorialFocoEl.classList.remove('tutorial-sin-transicion');
    if (tutorialBocadilloEl) tutorialBocadilloEl.classList.remove('tutorial-sin-transicion');
  }, 150);

  if (tutorialRafPending) return;
  tutorialRafPending = true;
  requestAnimationFrame(() => {
    tutorialRafPending = false;
    if (tutorialActivo) tutorialAlRedimensionar();
  });
}

// Umbral por debajo del cual un elemento se considera "sin tamaño real" (p.ej. un
// contenedor de alertas vacío que existe y no está oculto, pero mide 0 de alto).
const TUTORIAL_TAM_MIN = 8;

// Ejecuta el `antes()` del paso (algunos solo son visibles tras cambiar de pestaña) y
// comprueba que su elemento exista, no esté oculto Y tenga tamaño real. Sin la
// comprobación de tamaño, un paso podía señalar un elemento visible pero vacío (0x0)
// y el recuadro de foco se dibujaba como una tira sin contenido.
function esPasoMostrable(paso) {
  if (typeof paso.antes === 'function') { try { paso.antes(); } catch (e) {} }
  const el = document.querySelector(paso.sel);
  if (!el || el.offsetParent === null) return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= TUTORIAL_TAM_MIN && rect.height >= TUTORIAL_TAM_MIN;
}

// Busca desde `desde`, avanzando en pasos de `dir` (+1 adelante, -1 atrás), el primer
// índice cuyo paso sea mostrable. Devuelve -1 si se sale del rango sin encontrar ninguno.
function buscarPasoMostrable(desde, dir) {
  const pasos = TUTORIAL_PASOS[tutorialPage] || [];
  let i = desde;
  while (i >= 0 && i < pasos.length) {
    if (esPasoMostrable(pasos[i])) return i;
    i += dir;
  }
  return -1;
}

// Recalcula, en el momento de pintar, qué índices de TUTORIAL_PASOS[tutorialPage] son
// realmente mostrables ahora mismo (una tabla puede haberse llenado, una alerta puede
// haber aparecido entre paso y paso). Se usa para numerar solo sobre lo que el usuario
// ve de verdad, nunca sobre el total de pasos definidos.
function indicesPasosMostrables() {
  const pasos = TUTORIAL_PASOS[tutorialPage] || [];
  const idx = [];
  for (let i = 0; i < pasos.length; i++) {
    if (esPasoMostrable(pasos[i])) idx.push(i);
  }
  return idx;
}

function mostrarPasoTutorial(i) {
  const pasos = TUTORIAL_PASOS[tutorialPage] || [];
  if (!tutorialActivo) return;
  const idx = buscarPasoMostrable(i, +1);
  if (idx < 0) { cerrarTutorial(true); return; }
  tutorialPasoIdx = idx;
  const paso = pasos[idx];

  // indicesPasosMostrables() prueba TODOS los pasos (incluidos los que cambian de
  // pestaña con antes()), así que puede dejar el DOM en la pestaña del último paso
  // probado: se vuelve a ejecutar antes() del paso actual para restaurar su contexto.
  const mostrables = indicesPasosMostrables();
  if (typeof paso.antes === 'function') { try { paso.antes(); } catch (e) {} }
  const numero = mostrables.indexOf(idx) + 1;
  const total = mostrables.length;
  const esUltimo = mostrables.length > 0 && idx === mostrables[mostrables.length - 1];

  const el = document.querySelector(paso.sel);
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!tutorialActivo || tutorialPasoIdx !== idx) return;
      const rect = el.getBoundingClientRect();
      tutorialFocoEl.style.display = 'block';
      tutorialBocadilloEl.style.display = 'block';
      pintarFocoTutorial(rect);
      pintarBocadilloTutorial(rect, paso, numero, total, esUltimo);
      setTimeout(() => { if (tutorialActivo && tutorialPasoIdx === idx) tutorialAlRedimensionar(); }, 320);
    });
  });
}

function siguientePasoTutorial() {
  mostrarPasoTutorial(tutorialPasoIdx + 1);
}

function anteriorPasoTutorial() {
  const prev = buscarPasoMostrable(tutorialPasoIdx - 1, -1);
  if (prev >= 0) mostrarPasoTutorial(prev);
}

function pintarFocoTutorial(rect) {
  const m = 6;
  tutorialFocoEl.style.top = (rect.top - m) + 'px';
  tutorialFocoEl.style.left = (rect.left - m) + 'px';
  tutorialFocoEl.style.width = (rect.width + m * 2) + 'px';
  tutorialFocoEl.style.height = (rect.height + m * 2) + 'px';
}

function pintarBocadilloTutorial(rect, paso, numero, total, esUltimo) {
  tutorialBocadilloEl.innerHTML =
    `<strong>${paso.titulo}</strong>` +
    `<p>${paso.texto}</p>` +
    `<div class="tutorial-footer">` +
      `<span class="tutorial-contador">Paso ${numero} de ${total}</span>` +
      `<div class="tutorial-botones">` +
        `<button class="btn btn-gray btn-sm" onclick="cerrarTutorial(true)">Saltar</button>` +
        (numero > 1 ? `<button class="btn btn-gray btn-sm" onclick="anteriorPasoTutorial()">Atrás</button>` : '') +
        `<button class="btn btn-primary btn-sm" onclick="siguientePasoTutorial()">${esUltimo ? 'Entendido' : 'Siguiente'}</button>` +
      `</div>` +
    `</div>`;
  posicionarBocadillo(rect, paso.pos);
}

function posicionarBocadillo(rect, posPref) {
  const margen = 14;
  const bw = tutorialBocadilloEl.offsetWidth || 300;
  const bh = tutorialBocadilloEl.offsetHeight || 120;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const opciones = {
    top: { top: rect.top - bh - margen, left: rect.left + rect.width / 2 - bw / 2 },
    bottom: { top: rect.bottom + margen, left: rect.left + rect.width / 2 - bw / 2 },
    left: { top: rect.top + rect.height / 2 - bh / 2, left: rect.left - bw - margen },
    right: { top: rect.top + rect.height / 2 - bh / 2, left: rect.right + margen }
  };
  const opuesto = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  // El bocadillo no debe tapar el propio elemento que señala (con el mismo margen que
  // usa el recuadro de foco): sin esto, un elemento muy ancho y bajo podía dejar la
  // posición "bottom" prácticamente encima de lo que hay justo debajo del elemento.
  const focoM = 6;
  const rectFoco = { top: rect.top - focoM, left: rect.left - focoM, right: rect.right + focoM, bottom: rect.bottom + focoM };
  const solapaFoco = (o) => !(o.left + bw <= rectFoco.left || o.left >= rectFoco.right || o.top + bh <= rectFoco.top || o.top >= rectFoco.bottom);
  const cabe = (o) => o.top >= 40 && o.top + bh <= vh - 8 && o.left >= 8 && o.left + bw <= vw - 8 && !solapaFoco(o);

  const orden = [posPref, opuesto[posPref], 'bottom', 'top', 'right', 'left'];
  let lado = posPref;
  let elegido = opciones[posPref];
  for (const o of orden) {
    if (o && opciones[o] && cabe(opciones[o])) { elegido = opciones[o]; lado = o; break; }
  }

  const left = Math.max(8, Math.min(elegido.left, vw - bw - 8));
  const top = Math.max(40, Math.min(elegido.top, vh - bh - 8));

  tutorialBocadilloEl.style.top = top + 'px';
  tutorialBocadilloEl.style.left = left + 'px';
  tutorialBocadilloEl.className = 'tutorial-lado-' + lado;

  const centroX = rect.left + rect.width / 2 - left;
  const centroY = rect.top + rect.height / 2 - top;
  tutorialBocadilloEl.style.setProperty('--tutorial-flecha-x', Math.max(16, Math.min(centroX, bw - 16)) + 'px');
  tutorialBocadilloEl.style.setProperty('--tutorial-flecha-y', Math.max(16, Math.min(centroY, bh - 16)) + 'px');
}

function tutorialAlRedimensionar() {
  if (!tutorialActivo) return;
  const pasos = TUTORIAL_PASOS[tutorialPage] || [];
  const paso = pasos[tutorialPasoIdx];
  if (!paso) return;
  const el = document.querySelector(paso.sel);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  pintarFocoTutorial(rect);
  posicionarBocadillo(rect, paso.pos);
}

function cerrarTutorial(marcarVisto) {
  if (marcarVisto && tutorialPage) marcarTutorialVisto(tutorialPage);
  if (tutorialFocoEl) tutorialFocoEl.style.display = 'none';
  if (tutorialBocadilloEl) tutorialBocadilloEl.style.display = 'none';
  window.removeEventListener('resize', tutorialAlRedimensionar);
  window.removeEventListener('scroll', tutorialOnScroll, true);
  clearTimeout(tutorialScrollEndTimer);
  tutorialActivo = false;
  tutorialPage = null;
  tutorialPasoIdx = 0;
}

function reiniciarTutorialesUI() {
  try { localStorage.removeItem(TUTORIAL_VISTO_KEY); } catch (e) {}
  showToast('tutorial-reset-toast', 'Los tutoriales volverán a aparecer al entrar en cada sección.', 'ok');
  navegarA('dashboard');
  comprobarTutorial('dashboard');
}

