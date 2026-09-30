// ─── TUTORIAL INTERACTIVO ───────────────────────────────────────────────────
// Tutorial guiado por secciones: foco visual, bocadillo, navegación entre pasos
// y persistencia de qué tutoriales ya se han visto. Cubre el panel y todas las
// secciones, incluidas las nuevas (jornada, caducidades, captación/CRM, bonos,
// exámenes, caja, informes y agenda visual), centrándose en lo no evidente.

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
    { sel: '#panel-kpis', pos: 'bottom',
      titulo: 'Tu día de un vistazo',
      texto: 'Prácticas de hoy, kilómetros del mes, alumnos en prácticas y lo que queda por revisar. En Ajustes → Panel principal eliges qué más tarjetas ver.' },
    { sel: '#dash-alertas', pos: 'top',
      titulo: 'Avisos que puedes seguir',
      texto: 'Km sin rellenar, solapamientos, caducidades, bonos casi agotados o solicitudes de reserva: cada aviso tiene un botón que te lleva directo a la pantalla donde resolverlo.' },
    { sel: '#graficos-dashboard', pos: 'bottom',
      titulo: 'Gráficos del panel',
      texto: 'Activa los que te interesen desde Ajustes → Panel principal: kilómetros y prácticas por mes, por profesor, por vehículo o ingresos.' },
    { sel: '.quick-card-primary', pos: 'right',
      titulo: 'Registro Rápido',
      texto: 'Es el acceso al día a día: apunta en segundos las prácticas de todos los alumnos de un vehículo en una fecha.' },
    { sel: '#sync-bar', pos: 'right',
      titulo: 'Estado de la nube',
      texto: 'Aquí ves si tus datos están sincronizados con la web del móvil y los demás equipos. Haz clic para sincronizar ahora.' },
    { sel: '.nav-personalizar', pos: 'right',
      titulo: 'Menú a tu medida',
      texto: 'Oculta las funciones que todavía no uses (bonos, caja, captación…) para ver solo lo que necesitas. No se borra nada: vuelves a mostrarlas cuando quieras.' },
    { sel: '#titlebar', pos: 'bottom',
      titulo: 'Barra de accesos rápidos',
      texto: 'Deja el ratón quieto un momento sobre esta barra y se despliega con la fecha, el resumen del día y accesos para registrar prácticas, dar de alta un alumno o una cita. Se desactiva en Ajustes → Menú lateral.' }
  ],
  alumnos: [
    { sel: '#alumnos-tabs', pos: 'bottom',
      titulo: 'Grupos de alumnos',
      texto: 'Activos, nuevos, en riesgo de abandono… Cada pestaña filtra la lista; los filtros de profesor, vehículo y permiso se combinan con ella.' },
    { sel: '#f-alumnos-profesor', pos: 'bottom',
      titulo: 'Asigna cada alumno a su profesor',
      texto: 'Es lo que hace que en la web del móvil cada profesor vea «sus» alumnos. Se asigna al editar el alumno o, para todos a la vez, en Puesta en marcha.' },
    { sel: '#tabla-alumnos', pos: 'top',
      titulo: 'La ficha del alumno',
      texto: 'Haz clic en un alumno para abrir su ficha: progreso, km por clase, calendario de prácticas y el historial con la firma de cada clase.' }
  ],
  ficha: [
    { sel: '#ficha-cab', pos: 'bottom',
      titulo: 'El progreso del alumno',
      texto: 'Clases, km recorridos y horas al volante. Si el alumno empezó antes de usar la app, sus clases anteriores ya están sumadas (se ajustan al editar el alumno).' },
    { sel: '#ficha-kmclase', pos: 'bottom',
      titulo: 'Km por clase',
      texto: 'Una barra por clase; pasa el ratón por encima para ver la fecha. La última, en ámbar.' },
    { sel: '#tabla-practicas .firma-pill', pos: 'left',
      titulo: 'Firma del alumno',
      texto: 'Cada clase dada con el móvil se firma al terminar. Pulsa «Firmada» para ver la firma y todos los datos de la clase; también se imprime en la Ficha de clases prácticas (Documentos).' }
  ],
  vehiculos: [
    { sel: '#veh-tarjetas', pos: 'bottom',
      titulo: 'El odómetro real',
      texto: 'Cada tarjeta muestra el odómetro del vehículo, que se actualiza solo con cada práctica. Corrígelo a mano con el menú ⋯ → Editar.' },
    { sel: '#veh-continuidad', pos: 'top',
      titulo: 'Continuidad del cuentakilómetros',
      texto: 'Cada práctica debe empezar en el km donde acabó la anterior. Los tramos rayados en rojo son kilómetros que nadie ha registrado.' },
    { sel: '#veh-relleno', pos: 'bottom',
      titulo: 'Km en blanco',
      texto: 'Las prácticas que se quedaron sin kilómetros se rellenan en Kilómetros → Generar km, con tres métodos distintos.' }
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
      texto: 'Ocurre cuando dos prácticas del mismo vehículo comparten el mismo tramo de km. "Corregir todo automáticamente" los reordena respetando la duración de cada una.' },
    { sel: '#kilometros-tabs', pos: 'bottom',
      titulo: 'Generar km',
      texto: 'La tercera pestaña rellena los km de las prácticas en blanco: encadenado desde el odómetro, hasta un km máximo o repartido en un rango.' }
  ],
  'generar-km': [
    { sel: '#gk-vehiculo', pos: 'bottom',
      titulo: 'Elige el vehículo',
      texto: 'Al lado verás cuántas prácticas de ese coche tienen los km en blanco.' },
    { sel: '#generar-km-tabs', pos: 'bottom',
      titulo: 'Tres formas de generar',
      texto: 'Encadenado: sigue desde el odómetro actual. Hasta un máximo: das el km final y se reparte hacia atrás. Por rango: entre dos km con una media. Los dos últimos te enseñan el resultado antes de guardarlo.' }
  ],
  reservas: [
    { sel: '#page-reservas .page-tabs', pos: 'bottom',
      titulo: 'Lista o semana',
      texto: 'La misma agenda en dos vistas: la lista con filtros por estado y la semana, donde arrastras una cita para cambiarla de día.' },
    { sel: '#tabla-reservas', pos: 'top',
      titulo: 'Citas y solicitudes',
      texto: 'Las solicitudes llegan también desde el portal del alumno. Confírmalas, cancélalas o márcalas como realizadas; las del día aparecen al profesor en la web del móvil.' }
  ],
  'practicas-global': [
    { sel: '#pg-tabs', pos: 'bottom',
      titulo: 'Todas las prácticas',
      texto: 'Las de todos los alumnos, con pestañas para hoy, esta semana, sin km o en curso (las que un profesor está dando ahora desde el móvil).' },
    { sel: '#tabla-practicas-global', pos: 'top',
      titulo: 'Despliega una práctica',
      texto: 'Haz clic en una fila para ver si el km encaja con la práctica anterior del coche, las zonas recorridas, la observación del profesor y la firma del alumno.' }
  ],
  'puesta-en-marcha': [
    { sel: '#pm-paso-vehiculos', pos: 'bottom',
      titulo: '1 · El km real de cada coche',
      texto: 'Escribe lo que marca hoy el cuentakilómetros. La primera clase que registre un profesor empezará ahí.' },
    { sel: '#pm-paso-alumnos', pos: 'top',
      titulo: '2 · Lo que cada alumno ya lleva hecho',
      texto: 'Clases y km anteriores a la app: la numeración continúa (si lleva 12, la siguiente será la 13) sin inventarse prácticas. Puedes pegar la lista desde Excel.' },
    { sel: '#pm-borrar', pos: 'top',
      titulo: 'Empezar limpio (opcional)',
      texto: 'Si has hecho pruebas con alumnos inventados, bórralos aquí antes de meter los reales. Se guarda antes una copia de seguridad.' }
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
    { sel: '#aj-cuadros', pos: 'bottom',
      titulo: 'Todo por secciones',
      texto: 'Cada cuadro abre una parte de la configuración y te enseña su estado actual. Vuelves aquí con «Todos los ajustes».' },
    { sel: '[data-aj-cuadro="puesta"]', pos: 'bottom',
      titulo: 'Puesta en marcha',
      texto: 'Si vas a empezar con tus datos reales, empieza aquí: km de cada coche y clases que ya lleva cada alumno.' },
    { sel: '[data-aj-cuadro="zonas"]', pos: 'bottom',
      titulo: 'Zonas de prácticas',
      texto: 'Las zonas que el profesor marca en el móvil al dar la clase (centro, polígono, autovía…). Sin zonas, la web no las pide.' },
    { sel: '[data-aj-cuadro="menu"]', pos: 'bottom',
      titulo: 'Menú lateral',
      texto: 'Muestra solo las funciones que uses y activa o desactiva la barra superior desplegable.' }
  ],
  jornada: [
    { sel: '#jor-empleado', pos: 'bottom',
      titulo: 'Fichar por empleado',
      texto: 'Escribe el nombre y el botón cambia solo entre "Fichar entrada" y "Fichar salida" según si esa persona ya tiene una jornada abierta hoy.' },
    { sel: '#tabla-jornadas', pos: 'top',
      titulo: 'Correcciones auditadas',
      texto: 'Puedes corregir una entrada o salida, pero cada cambio queda registrado (columna de correcciones) para cumplir el art. 34.9. El botón Exportar CSV genera el registro para Inspección.' }
  ],
  vencimientos: [
    { sel: '#vencimientos-lista', pos: 'top',
      titulo: 'Caducidades de todo',
      texto: 'ITV y seguro de vehículos, psicotécnico o DNI de alumnos, certificado del profesor… Cada vencimiento se liga a un vehículo, alumno, profesor, o es general. Lo que esté a punto de caducar aparece como alerta en el panel de inicio.' }
  ],
  crm: [
    { sel: '#crm-stats', pos: 'bottom',
      titulo: 'Embudo de captación',
      texto: 'Mide cuántos contactos tienes en cada estado, tu ratio de conversión y de qué origen vienen los que acaban matriculándose.' },
    { sel: '#leads-lista', pos: 'top',
      titulo: 'Convertir en alumno',
      texto: 'Cuando un contacto se matricula, el botón Convertir le crea la ficha de alumno automáticamente y marca el lead como ganado.' }
  ],
  bonos: [
    { sel: '#bonos-lista', pos: 'top',
      titulo: 'Bonos de clases',
      texto: 'Un bono son varias clases prepagadas. Con los botones +1 / −1 consumes o repones clases del saldo. El plazo y la devolución al cancelar se configuran en Ajustes.' }
  ],
  examenes: [
    { sel: '#examenes-stats', pos: 'bottom',
      titulo: 'Ratio de aprobados',
      texto: 'Se calcula solo sobre las presentaciones con resultado apto o no apto, desglosado por tipo y por profesor. Las pendientes o aplazadas no cuentan.' },
    { sel: '#presentaciones-lista', pos: 'top',
      titulo: 'Resultado rápido',
      texto: 'El desplegable de cada fila cambia el resultado (apto, no apto, aplazado, no presentado) al momento, sin abrir la ficha.' }
  ],
  caja: [
    { sel: '#caja-desde', pos: 'bottom',
      titulo: 'Arqueo por fechas',
      texto: 'Elige un rango y pulsa Generar: verás el total cobrado desglosado por forma de pago, por empleado y por sede, además de la lista de morosos. La forma de pago se elige al anotar cada cobro en Pagos.' }
  ],
  informes: [
    { sel: '#inf-print', pos: 'bottom',
      titulo: 'Guardar en PDF',
      texto: 'Genera el informe con las fechas de arriba y usa este botón para imprimir: elige "Guardar como PDF" como impresora. Exportar CSV descarga los datos para Excel.' },
    { sel: '#btn-libro-ventas', pos: 'top',
      titulo: 'Libro de ventas / IVA',
      texto: 'Genera el desglose de base imponible e IVA de los cobros para tu gestoría. El tipo de IVA se ajusta en Ajustes (consúltalo con tu asesor).' }
  ],
  'agenda-visual': [
    { sel: '#av-rango', pos: 'bottom',
      titulo: 'Semana a la vista',
      texto: 'Muévete entre semanas con las flechas; el día de hoy aparece resaltado. Es la misma agenda de reservas, vista como calendario.' },
    { sel: '#av-grid', pos: 'top',
      titulo: 'Arrastrar para reprogramar',
      texto: 'Arrastra una clase de un día a otro para cambiarle la fecha. Haz clic en una clase para confirmarla, cancelarla o marcarla como realizada.' }
  ]
};

let tutorialFocoEl = null;
let tutorialBocadilloEl = null;
let tutorialActivo = false;
let tutorialPage = null;
let tutorialPasoIdx = 0;

// Lo usa la navegación del sidebar (renderer/estado.js) para NO cambiar de
// sección mientras el tutorial está en marcha: al navegar, el DOM cambia y los
// recuadros/bocadillos del tutorial quedaban apuntando a elementos que ya no
// existen. Durante el tutorial la navegación queda inerte; se sale con "Saltar".
function tutorialEnCurso() { return tutorialActivo; }

function crearDomTutorial() {
  if (tutorialFocoEl) return;
  tutorialFocoEl = document.createElement('div');
  tutorialFocoEl.id = 'tutorial-foco';
  document.body.appendChild(tutorialFocoEl);

  tutorialBocadilloEl = document.createElement('div');
  tutorialBocadilloEl.id = 'tutorial-bocadillo';
  document.body.appendChild(tutorialBocadilloEl);
}

function comprobarTutorial(page, _intento) {
  if (!page) return;
  const pasos = TUTORIAL_PASOS[page];
  if (!pasos || !pasos.length) return;
  if (tutorialActivo) return;
  if (getTutorialVisto()[page]) return;
  if (document.querySelector('.overlay.open')) return;

  // El contenido de muchas secciones se pinta de forma asíncrona (una consulta
  // por IPC). Si arrancáramos antes de que exista un paso mostrable, un tutorial
  // de un solo paso se autocerraría y quedaría marcado como visto sin haberse
  // mostrado nunca. Por eso, si aún no hay nada que señalar, reintentamos unas
  // cuantas veces (sin marcar visto) hasta que la sección esté lista.
  tutorialPage = page; // buscarPasoMostrable() se apoya en tutorialPage
  if (buscarPasoMostrable(0, +1) < 0) {
    const intento = _intento || 0;
    const sigueEnLaSeccion = document.getElementById('page-' + page)?.classList.contains('active') !== false;
    if (intento < 15 && sigueEnLaSeccion) {
      setTimeout(() => { if (!tutorialActivo) comprobarTutorial(page, intento + 1); }, 150);
    }
    return;
  }

  tutorialActivo = true;
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

