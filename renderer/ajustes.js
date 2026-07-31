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

const PREF_DASHBOARD_KEY = 'kmalumnos_dashboard_stats';
const PREF_DASHBOARD_DEFAULT = {
  vehiculos: true, alumnos: true, practicas: true,
  practicasHoy: false, kmMes: false, totalAdeudado: false, alumnosConDeuda: false
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
    alumnosConDeuda: document.getElementById('pref-dash-alumnos-deuda').checked
  };
  guardarDashboardPref(p);
}


// ─── AJUSTES ──────────────────────────────────────────────────────────────────
async function loadAjustes() {
  aplicarRangoPref('pref-km-min', 'pref-km-max');
  const dashPref = getDashboardPref();
  document.getElementById('pref-dash-vehiculos').checked = dashPref.vehiculos;
  document.getElementById('pref-dash-alumnos').checked = dashPref.alumnos;
  document.getElementById('pref-dash-practicas').checked = dashPref.practicas;
  document.getElementById('pref-dash-practicas-hoy').checked = dashPref.practicasHoy;
  document.getElementById('pref-dash-km-mes').checked = dashPref.kmMes;
  document.getElementById('pref-dash-total-adeudado').checked = dashPref.totalAdeudado;
  document.getElementById('pref-dash-alumnos-deuda').checked = dashPref.alumnosConDeuda;
  refrescarEstadoCuenta();
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

