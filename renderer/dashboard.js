// ─── DASHBOARD ───────────────────────────────────────────────────────────────
// Tarjetas de estadísticas y alertas del panel principal, y la navegación entre
// pestañas internas de las páginas de Kilómetros y Datos.

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function loadDashboard() {
  const r = await window.api.getResumen();
  document.getElementById('stat-vehiculos').textContent = r.vehiculos;
  document.getElementById('stat-alumnos').textContent = r.alumnos;
  document.getElementById('stat-practicas').textContent = r.practicas;

  const pref = getDashboardPref();
  document.getElementById('stat-card-vehiculos').classList.toggle('hidden', !pref.vehiculos);
  document.getElementById('stat-card-alumnos').classList.toggle('hidden', !pref.alumnos);
  document.getElementById('stat-card-practicas').classList.toggle('hidden', !pref.practicas);
  document.getElementById('stat-card-practicas-hoy').classList.toggle('hidden', !pref.practicasHoy);
  document.getElementById('stat-card-km-mes').classList.toggle('hidden', !pref.kmMes);
  document.getElementById('stat-card-total-adeudado').classList.toggle('hidden', !pref.totalAdeudado);
  document.getElementById('stat-card-alumnos-deuda').classList.toggle('hidden', !pref.alumnosConDeuda);

  if (pref.practicasHoy || pref.kmMes || pref.totalAdeudado || pref.alumnosConDeuda) {
    const stats = await window.api.getStatsDashboard();
    document.getElementById('stat-practicas-hoy').textContent = stats.practicasHoy;
    document.getElementById('stat-km-mes').textContent = stats.kmMes + ' km';
    document.getElementById('stat-total-adeudado').textContent = fmt(stats.totalAdeudado) + ' €';
    document.getElementById('stat-alumnos-deuda').textContent = stats.alumnosConDeuda;
  }

  const alertas = document.getElementById('dash-alertas');
  const partes = [];

  if (r.sinKm > 0) {
    partes.push(
      `<div class="alert alert-warn" style="margin-bottom:8px;cursor:pointer" onclick="navegarA('vehiculos')" title="Ir a Vehículos para rellenar">` +
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><strong>${r.sinKm} práctica(s) sin kilómetros.</strong> Ve a <u>Vehículos → Relleno masivo</u> para generarlos automáticamente.</div>`
    );
  }
  if (r.solapamientos > 0) {
    partes.push(
      `<div class="alert alert-err" style="margin-bottom:8px;cursor:pointer" onclick="navegarA('kilometros','conflictos')" title="Ir a Kilómetros → Conflictos">` +
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><strong>${r.solapamientos} solapamiento(s) detectado(s).</strong> Ve a <u>Solapamientos</u> para corregirlos.</div>`
    );
  }
  if (partes.length === 0 && r.practicas > 0) {
    partes.push(
      `<div class="alert alert-ok" style="margin-bottom:8px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.27"/></svg>Todo en orden. No hay prácticas sin km ni solapamientos.</div>`
    );
  }
  alertas.innerHTML = partes.join('');
}

function navegarA(page, tab) {
  const link = document.querySelector(`#sidebar nav a[data-page="${page}"]`);
  if (link) link.click();
  if (tab) {
    if (page === 'kilometros') cambiarTabKilometros(tab);
    if (page === 'datos') cambiarTabDatos(tab);
  }
}

// ─── PESTAÑAS DE PÁGINA (Kilómetros / Datos) ──────────────────────────────────
function cambiarTabKilometros(tab) {
  document.querySelectorAll('#page-kilometros .page-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#page-kilometros .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-kilometros-' + tab));
  if (tab === 'mapa') loadTimelineSelect();
  if (tab === 'conflictos') { aplicarRangoPref('solap-min', 'solap-max'); loadSolapamientos(); }
}

function cambiarTabDatos(tab) {
  document.querySelectorAll('#page-datos .page-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#page-datos .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-datos-' + tab));
  if (tab === 'importar') aplicarRangoPref('imp-min', 'imp-max');
}

