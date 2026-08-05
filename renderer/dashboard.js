// ─── DASHBOARD ───────────────────────────────────────────────────────────────
// Tarjetas de estadísticas y alertas del panel principal, y la navegación entre
// pestañas internas de las páginas de Kilómetros y Datos.

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function loadDashboard() {
  const r = await window.api.getResumen(getSucursalActual());
  animarContador(document.getElementById('stat-vehiculos'), r.vehiculos);
  animarContador(document.getElementById('stat-alumnos'), r.alumnos);
  animarContador(document.getElementById('stat-practicas'), r.practicas);

  const pref = getDashboardPref();
  document.getElementById('stat-card-vehiculos').classList.toggle('hidden', !pref.vehiculos);
  document.getElementById('stat-card-alumnos').classList.toggle('hidden', !pref.alumnos);
  document.getElementById('stat-card-practicas').classList.toggle('hidden', !pref.practicas);
  document.getElementById('stat-card-practicas-hoy').classList.toggle('hidden', !pref.practicasHoy);
  document.getElementById('stat-card-km-mes').classList.toggle('hidden', !pref.kmMes);
  document.getElementById('stat-card-total-adeudado').classList.toggle('hidden', !pref.totalAdeudado);
  document.getElementById('stat-card-alumnos-deuda').classList.toggle('hidden', !pref.alumnosConDeuda);

  if (pref.practicasHoy || pref.kmMes || pref.totalAdeudado || pref.alumnosConDeuda) {
    const stats = await window.api.getStatsDashboard(undefined, getSucursalActual());
    animarContador(document.getElementById('stat-practicas-hoy'), stats.practicasHoy);
    animarContador(document.getElementById('stat-km-mes'), stats.kmMes, v => v + ' km');
    animarContador(document.getElementById('stat-total-adeudado'), stats.totalAdeudado, v => fmt(v) + ' €');
    animarContador(document.getElementById('stat-alumnos-deuda'), stats.alumnosConDeuda);
  }

  loadGraficos();
  loadAgendaDashboard();
  loadSemaforoDashboard();
  loadRiesgoAbandonoDashboard();

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

// Tarjeta "Agenda": solicitudes pendientes de confirmar y próximas reservas
// confirmadas. Módulo opcional (Bloque 2 SaaS) — si getReservas falla o no
// hay nada que mostrar, la tarjeta se oculta sin romper el resto del panel.
async function loadAgendaDashboard() {
  const card = document.getElementById('dash-agenda-card');
  if (!card) return;
  let reservas = [];
  try {
    reservas = await window.api.getReservas(getSucursalActual());
  } catch (e) {
    card.classList.add('hidden');
    return;
  }
  if (!Array.isArray(reservas) || reservas.length === 0) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  const solicitadas = reservas.filter(r => r.estado === 'solicitada');
  const contSolic = document.getElementById('dash-agenda-solicitudes');
  if (solicitadas.length > 0) {
    contSolic.innerHTML =
      `<div class="alert alert-warn" style="cursor:pointer" onclick="navegarA('reservas')" title="Ir a Agenda">` +
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><strong>${solicitadas.length} solicitud(es) pendiente(s).</strong> Ve a <u>Agenda</u> para confirmarlas o rechazarlas.</div>`;
  } else {
    contSolic.innerHTML = '';
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const proximas = reservas
    .filter(r => r.estado === 'confirmada' && r.fecha >= hoy)
    .sort((a, b) => (a.fecha + (a.hora_inicio || '')).localeCompare(b.fecha + (b.hora_inicio || '')))
    .slice(0, 5);

  const contProx = document.getElementById('dash-agenda-proximas');
  if (proximas.length === 0) {
    contProx.innerHTML = '<div style="color:var(--placeholder);font-size:13px">No hay próximas reservas confirmadas.</div>';
  } else {
    contProx.innerHTML = proximas.map(r => {
      const fechaHora = `${fmtFecha(r.fecha)}${r.hora_inicio ? ' · ' + esc(r.hora_inicio) : ''}`;
      const alumno = r.alumno_nombre ? esc(r.alumno_nombre) : '—';
      return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">` +
        `<span>${fechaHora}</span><span>${alumno}</span></div>`;
    }).join('');
  }
}

// Tarjeta "Semáforo de examen": recuento listos/casi/lejos de todos los
// alumnos (heurística v1, ver db/estadisticas.js:getSemaforoExamen). Si
// falla, se oculta sin romper el resto del dashboard.
async function loadSemaforoDashboard() {
  const card = document.getElementById('dash-semaforo-card');
  if (!card) return;
  let semaforo = [];
  try {
    semaforo = await window.api.getSemaforoExamen();
  } catch (e) {
    card.classList.add('hidden');
    return;
  }
  if (!Array.isArray(semaforo) || semaforo.length === 0) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  document.getElementById('dash-semaforo-verde').textContent = semaforo.filter(s => s.nivel === 'verde').length;
  document.getElementById('dash-semaforo-ambar').textContent = semaforo.filter(s => s.nivel === 'ambar').length;
  document.getElementById('dash-semaforo-rojo').textContent = semaforo.filter(s => s.nivel === 'rojo').length;
}

// Tarjeta "Alumnos en riesgo de abandono": alumnos que llevan tiempo sin
// venir a clase (heurística v1, ver db/estadisticas.js:getAlumnosEnRiesgo).
// Si falla, se oculta sin romper el resto del dashboard.
async function loadRiesgoAbandonoDashboard() {
  const card = document.getElementById('dash-riesgo-card');
  if (!card) return;
  let riesgo = [];
  try {
    riesgo = await window.api.getAlumnosEnRiesgo();
  } catch (e) {
    card.classList.add('hidden');
    return;
  }
  if (!Array.isArray(riesgo)) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  const resumen = document.getElementById('dash-riesgo-resumen');
  const lista = document.getElementById('dash-riesgo-lista');

  if (riesgo.length === 0) {
    resumen.innerHTML = '<div class="alert alert-ok"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.27"/></svg>Ningún alumno en riesgo de abandono. Todos siguen dando clases con regularidad.</div>';
    lista.innerHTML = '';
    return;
  }

  resumen.innerHTML =
    `<div class="alert alert-warn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><strong>${riesgo.length} alumno(s) en riesgo.</strong> Llevan más de un mes sin dar clase.</div>`;

  lista.innerHTML = riesgo.slice(0, 5).map(r => {
    return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="navegarA('alumnos')" title="Ir a Alumnos">` +
      `<span>${esc(r.nombre)}</span><span>${r.diasSinPractica} días sin práctica</span></div>`;
  }).join('');
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

