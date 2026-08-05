// ─── AJUSTES ─────────────────────────────────────────────────────────────────
// Preferencias (rango de km por defecto, dashboard personalizable), pantalla de
// Ajustes y comprobación/descarga de actualizaciones (auto-update).

// ─── PREFERENCIAS (rango de km por defecto) ──────────────────────────────────
const PREF_RANGO_KEY = 'kmalumnos_rango_km';

function getRangoPref() {
  try {
    const raw = localStorage.getItem(PREF_RANGO_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && !isNaN(p.min) && !isNaN(p.max)) return p;
    }
  } catch (e) {}
  return { min: 40, max: 45 };
}

function guardarRangoPref(min, max) {
  try { localStorage.setItem(PREF_RANGO_KEY, JSON.stringify({ min, max })); } catch (e) {}
}

function aplicarRangoPref(idMin, idMax) {
  const pref = getRangoPref();
  const elMin = document.getElementById(idMin);
  const elMax = document.getElementById(idMax);
  if (elMin) elMin.value = pref.min;
  if (elMax) elMax.value = pref.max;
}

function guardarRangoPrefDesdeAjustes() {
  const min = parseFloat(document.getElementById('pref-km-min').value) || 40;
  const max = parseFloat(document.getElementById('pref-km-max').value) || 45;
  guardarRangoPref(min, max);
}

// Minutos por clase/práctica: usado por la agenda (renderer/reservas.js) para
// calcular la duración de una reserva a partir del nº de prácticas que pide
// el modal. Mismo patrón localStorage que PREF_RANGO_KEY.
const DURACION_CLASE_KEY = 'km_duracion_clase_min';

function getDuracionClaseMin() {
  try {
    const raw = localStorage.getItem(DURACION_CLASE_KEY);
    const n = parseInt(raw);
    if (!isNaN(n) && n >= 1) return n;
  } catch (e) {}
  return 45;
}

function guardarDuracionClaseMin(min) {
  try { localStorage.setItem(DURACION_CLASE_KEY, String(Math.max(1, parseInt(min) || 45))); } catch (e) {}
}

function guardarDuracionClaseDesdeAjustes() {
  const min = parseInt(document.getElementById('pref-duracion-clase').value) || 45;
  guardarDuracionClaseMin(min);
}

// Precio del combustible y consumo medio: usados por el análisis de coste
// de vehículos (renderer/vehiculos.js, getAnalisisVehiculos) para estimar el
// gasto en € a partir de los km ya registrados. Mismo patrón localStorage que
// DURACION_CLASE_KEY.
const PRECIO_COMBUSTIBLE_KEY = 'km_precio_combustible';
const CONSUMO_MEDIO_KEY = 'km_consumo_medio';

function getPrecioCombustible() {
  try {
    const raw = localStorage.getItem(PRECIO_COMBUSTIBLE_KEY);
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) return n;
  } catch (e) {}
  return 1.60;
}

function getConsumoMedio() {
  try {
    const raw = localStorage.getItem(CONSUMO_MEDIO_KEY);
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) return n;
  } catch (e) {}
  return 6.5;
}

function guardarCombustiblePrefDesdeAjustes() {
  const precio = parseFloat(document.getElementById('pref-precio-combustible').value);
  const consumo = parseFloat(document.getElementById('pref-consumo-medio').value);
  try {
    if (!isNaN(precio) && precio > 0) localStorage.setItem(PRECIO_COMBUSTIBLE_KEY, String(precio));
    if (!isNaN(consumo) && consumo > 0) localStorage.setItem(CONSUMO_MEDIO_KEY, String(consumo));
  } catch (e) {}
  if (typeof loadAnalisisVehiculos === 'function') loadAnalisisVehiculos();
}

// Política de cancelación de la Agenda: plazo mínimo (horas) y si hay
// devolución cuando se cancela dentro de plazo. Usado por renderer/reservas.js
// (cancelarReserva) solo como aviso informativo. Mismo patrón localStorage
// que DURACION_CLASE_KEY.
const CANCEL_PLAZO_KEY = 'km_cancel_plazo_horas';
const CANCEL_DEVOLUCION_KEY = 'km_cancel_devolucion';

function getCancelPlazoHoras() {
  try {
    const raw = localStorage.getItem(CANCEL_PLAZO_KEY);
    const n = parseInt(raw);
    if (!isNaN(n) && n >= 0) return n;
  } catch (e) {}
  return 24;
}

function setCancelPlazoHoras(horas) {
  try { localStorage.setItem(CANCEL_PLAZO_KEY, String(Math.max(0, parseInt(horas) || 24))); } catch (e) {}
}

function getCancelDevolucion() {
  try {
    const raw = localStorage.getItem(CANCEL_DEVOLUCION_KEY);
    if (raw !== null) return raw !== 'false';
  } catch (e) {}
  return true;
}

function setCancelDevolucion(valor) {
  try { localStorage.setItem(CANCEL_DEVOLUCION_KEY, String(!!valor)); } catch (e) {}
}

function guardarCancelacionPrefDesdeAjustes() {
  const plazo = document.getElementById('pref-cancel-plazo').value;
  const devolucion = document.getElementById('pref-cancel-devolucion').checked;
  setCancelPlazoHoras(plazo);
  setCancelDevolucion(devolucion);
}

// Importe por defecto de matrícula y tasa (tarea D2, cargos automáticos):
// precargan el modal de "Añadir cargo/descuento" cuando se pulsan los
// botones rápidos "Añadir matrícula"/"Añadir tasa" en la ficha económica del
// alumno (renderer/alumnos.js). Mismo patrón localStorage que
// DURACION_CLASE_KEY.
const MATRICULA_IMPORTE_KEY = 'km_matricula_importe';
const TASA_IMPORTE_KEY = 'km_tasa_importe';

function getMatriculaImporte() {
  try {
    const raw = localStorage.getItem(MATRICULA_IMPORTE_KEY);
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) return n;
  } catch (e) {}
  return 0;
}

function getTasaImporte() {
  try {
    const raw = localStorage.getItem(TASA_IMPORTE_KEY);
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) return n;
  } catch (e) {}
  return 0;
}

function guardarCargosPrefDesdeAjustes() {
  const matricula = parseFloat(document.getElementById('pref-matricula').value);
  const tasa = parseFloat(document.getElementById('pref-tasa').value);
  try {
    if (!isNaN(matricula) && matricula >= 0) localStorage.setItem(MATRICULA_IMPORTE_KEY, String(matricula));
    if (!isNaN(tasa) && tasa >= 0) localStorage.setItem(TASA_IMPORTE_KEY, String(tasa));
  } catch (e) {}
}

const PREF_DASHBOARD_KEY = 'kmalumnos_dashboard_stats';
const PREF_DASHBOARD_DEFAULT = {
  vehiculos: true, alumnos: true, practicas: true,
  practicasHoy: false, kmMes: false, totalAdeudado: false, alumnosConDeuda: false,
  // Gráficos configurables (renderer/graficos.js): km y prácticas por mes activos
  // por defecto, el resto apagado para no saturar la pantalla de entrada.
  graficoKmMes: true, graficoPracticasMes: true,
  graficoPorProfesor: false, graficoPorVehiculo: false, graficoIngresos: false
};

function getDashboardPref() {
  try {
    const raw = localStorage.getItem(PREF_DASHBOARD_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') return { ...PREF_DASHBOARD_DEFAULT, ...p };
    }
  } catch (e) {}
  return { ...PREF_DASHBOARD_DEFAULT };
}

function guardarDashboardPref(p) {
  try { localStorage.setItem(PREF_DASHBOARD_KEY, JSON.stringify(p)); } catch (e) {}
}

function guardarDashboardPrefDesdeAjustes() {
  const p = {
    vehiculos: document.getElementById('pref-dash-vehiculos').checked,
    alumnos: document.getElementById('pref-dash-alumnos').checked,
    practicas: document.getElementById('pref-dash-practicas').checked,
    practicasHoy: document.getElementById('pref-dash-practicas-hoy').checked,
    kmMes: document.getElementById('pref-dash-km-mes').checked,
    totalAdeudado: document.getElementById('pref-dash-total-adeudado').checked,
    alumnosConDeuda: document.getElementById('pref-dash-alumnos-deuda').checked,
    graficoKmMes: document.getElementById('pref-dash-grafico-km-mes').checked,
    graficoPracticasMes: document.getElementById('pref-dash-grafico-practicas-mes').checked,
    graficoPorProfesor: document.getElementById('pref-dash-grafico-profesor').checked,
    graficoPorVehiculo: document.getElementById('pref-dash-grafico-vehiculo').checked,
    graficoIngresos: document.getElementById('pref-dash-grafico-ingresos').checked
  };
  guardarDashboardPref(p);
}


// ─── AJUSTES ──────────────────────────────────────────────────────────────────
async function loadAjustes() {
  aplicarRangoPref('pref-km-min', 'pref-km-max');
  const elDuracionClase = document.getElementById('pref-duracion-clase');
  if (elDuracionClase) elDuracionClase.value = getDuracionClaseMin();
  const elPrecioCombustible = document.getElementById('pref-precio-combustible');
  if (elPrecioCombustible) elPrecioCombustible.value = getPrecioCombustible();
  const elConsumoMedio = document.getElementById('pref-consumo-medio');
  if (elConsumoMedio) elConsumoMedio.value = getConsumoMedio();
  const elCancelPlazo = document.getElementById('pref-cancel-plazo');
  if (elCancelPlazo) elCancelPlazo.value = getCancelPlazoHoras();
  const elCancelDevolucion = document.getElementById('pref-cancel-devolucion');
  if (elCancelDevolucion) elCancelDevolucion.checked = getCancelDevolucion();
  const elMatricula = document.getElementById('pref-matricula');
  if (elMatricula) elMatricula.value = getMatriculaImporte();
  const elTasa = document.getElementById('pref-tasa');
  if (elTasa) elTasa.value = getTasaImporte();
  const dashPref = getDashboardPref();
  document.getElementById('pref-dash-vehiculos').checked = dashPref.vehiculos;
  document.getElementById('pref-dash-alumnos').checked = dashPref.alumnos;
  document.getElementById('pref-dash-practicas').checked = dashPref.practicas;
  document.getElementById('pref-dash-practicas-hoy').checked = dashPref.practicasHoy;
  document.getElementById('pref-dash-km-mes').checked = dashPref.kmMes;
  document.getElementById('pref-dash-total-adeudado').checked = dashPref.totalAdeudado;
  document.getElementById('pref-dash-alumnos-deuda').checked = dashPref.alumnosConDeuda;
  document.getElementById('pref-dash-grafico-km-mes').checked = dashPref.graficoKmMes;
  document.getElementById('pref-dash-grafico-practicas-mes').checked = dashPref.graficoPracticasMes;
  document.getElementById('pref-dash-grafico-profesor').checked = dashPref.graficoPorProfesor;
  document.getElementById('pref-dash-grafico-vehiculo').checked = dashPref.graficoPorVehiculo;
  document.getElementById('pref-dash-grafico-ingresos').checked = dashPref.graficoIngresos;
  refrescarEstadoCuenta();
  aplicarPermisosPorRol();
  const v = await window.api.getVersion();
  const el = document.getElementById('ajustes-version');
  if (el) el.textContent = 'v' + v;
  const s = await window.api.getSyncStatus();
  updateSyncBar(s || 'offline');
  loadUltimoBackup();
}

// ─── AUTO-UPDATE ──────────────────────────────────────────────────────────────
function checkUpdates() {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.textContent = 'Buscando...';
  bar.style.pointerEvents = 'none';
  window.api.checkForUpdates();
}

window.api.onUpdateNotAvailable(() => {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.textContent = '✓ Ya tienes la última versión';
  bar.style.color = 'rgba(16,185,129,.7)';
  bar.style.pointerEvents = '';
  setTimeout(() => {
    label.textContent = 'Buscar actualizaciones';
    bar.style.color = '';
  }, 3000);
});

// Cuando el usuario acepta descargar
window.api.onUpdateDownloadStart((version) => {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.innerHTML = `<span style="display:flex;align-items:center;gap:6px">⬇ v${version} <span id="update-pct">0%</span></span>`;
  bar.style.color = 'rgba(99,102,241,.8)';
  bar.style.pointerEvents = 'none';
  
  // Mostrar barra de progreso
  showUpdateProgress(0);
});

window.api.onUpdateDownloadProgress((pct) => {
  const pctEl = document.getElementById('update-pct');
  if (pctEl) pctEl.textContent = `${pct}%`;
  showUpdateProgress(pct);
});

function showUpdateProgress(pct) {
  let progressBar = document.getElementById('update-progress-bar');
  if (!progressBar) {
    const bar = document.getElementById('update-bar');
    progressBar = document.createElement('div');
    progressBar.id = 'update-progress-bar';
    progressBar.style.cssText = 'position:absolute;bottom:0;left:0;height:3px;background:#6366f1;border-radius:0 2px 2px 0;transition:width .2s';
    bar.style.position = 'relative';
    bar.appendChild(progressBar);
  }
  progressBar.style.width = `${pct}%`;
  if (pct >= 100) {
    setTimeout(() => { if (progressBar) progressBar.remove(); }, 500);
  }
}

window.api.onUpdateDownloaded(() => {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.textContent = '✓ Descargada — clic para instalar';
  bar.style.color = 'rgba(16,185,129,.8)';
  bar.style.pointerEvents = '';
  bar.onclick = () => {
    if (confirm('¿Instalar la actualización ahora?\n\nLa aplicación se cerrará y reiniciará.')) {
      window.api.installUpdate();
    }
  };
});

window.api.onUpdateError((msg) => {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.textContent = '✕ Error al actualizar';
  bar.style.color = 'rgba(239,68,68,.7)';
  bar.style.pointerEvents = '';
  setTimeout(() => {
    label.textContent = 'Buscar actualizaciones';
    bar.style.color = '';
  }, 4000);
});

