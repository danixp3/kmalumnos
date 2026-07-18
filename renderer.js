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

// ─── NAVEGACIÓN ──────────────────────────────────────────────────────────────
document.querySelectorAll('#sidebar nav a').forEach(link => {
  link.addEventListener('click', () => {
    const page = link.dataset.page;
    document.querySelectorAll('#sidebar nav a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    if (page === 'dashboard') loadDashboard();
    if (page === 'vehiculos') { loadVehiculos(); aplicarRangoPref('relleno-min', 'relleno-max'); }
    if (page === 'profesores') loadProfesores();
    if (page === 'pagos') {
      const activeTab = document.querySelector('#page-pagos .page-tab.active')?.dataset.tab || 'deudas';
      cambiarTabPagos(activeTab);
    }
    if (page === 'alumnos') { loadVehiculosSelect(); llenarSelectProfesores('a-profesor'); loadAlumnos(); }
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
  });
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function loadDashboard() {
  const r = await window.api.getResumen();
  document.getElementById('stat-vehiculos').textContent = r.vehiculos;
  document.getElementById('stat-alumnos').textContent = r.alumnos;
  document.getElementById('stat-practicas').textContent = r.practicas;

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

// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
async function loadVehiculos() {
  vehiculosCache = await window.api.getVehiculos();
  const tbody = document.querySelector('#tabla-vehiculos tbody');

  // Actualizar select de relleno masivo
  const sel = document.getElementById('relleno-vehiculo');
  if (sel) {
    sel.innerHTML = vehiculosCache.map(v => `<option value="${v.id}">${esc(v.nombre)}</option>`).join('');
    actualizarContadorSinKm();
  }

  if (!vehiculosCache.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No hay vehículos registrados</td></tr>';
    return;
  }

  const rows = await Promise.all(vehiculosCache.map(async v => {
    const sinKm = await window.api.getPracticasSinKm(v.id);
    const sinKmBadge = sinKm > 0
      ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700">${sinKm}</span>`
      : `<span style="color:#bbb">—</span>`;
    return `<tr>
      <td><strong>${esc(v.nombre)}</strong></td>
      <td>${esc(v.matricula) || '<span style="color:#bbb">—</span>'}</td>
      <td><span class="km-badge">${fmt(v.km_actual)} km</span></td>
      <td>${sinKmBadge}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="openEditVehiculo(${v.id},'${esc(v.nombre)}','${esc(v.matricula || '')}',${v.km_actual})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteVehiculo(${v.id},'${esc(v.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> Borrar</button>
      </td>
    </tr>`;
  }));
  tbody.innerHTML = rows.join('');
}

async function actualizarContadorSinKm() {
  const sel = document.getElementById('relleno-vehiculo');
  const info = document.getElementById('relleno-sinKm');
  if (!sel || !info) return;
  const vid = parseInt(sel.value);
  if (!vid) { info.textContent = ''; return; }
  const n = await window.api.getPracticasSinKm(vid);
  info.textContent = n > 0 ? `${n} práctica(s) sin km` : '✓ Todo relleno';
  info.style.color = n > 0 ? '#d97706' : '#15803d';
}

async function rellenarMasivo() {
  const sel = document.getElementById('relleno-vehiculo');
  const vid = parseInt(sel.value);
  if (!vid) { alert('Selecciona un vehículo.'); return; }
  const min = parseFloat(document.getElementById('relleno-min').value) || 40;
  const max = parseFloat(document.getElementById('relleno-max').value) || 45;
  if (max <= min) { alert('El máximo debe ser mayor que el mínimo.'); return; }
  
  // Topes opcionales del odómetro
  const inicioVal = document.getElementById('relleno-inicio').value;
  const finalVal = document.getElementById('relleno-final').value;
  const inicio = inicioVal ? parseFloat(inicioVal) : null;
  const final = finalVal ? parseFloat(finalVal) : null;
  
  if (inicio !== null && final !== null && final <= inicio) {
    alert('El tope final debe ser mayor que el tope inicial.'); return;
  }

  const n = await window.api.getPracticasSinKm(vid);
  if (n === 0) {
    const el = document.getElementById('relleno-alert');
    el.className = 'alert alert-info'; el.textContent = 'Este vehículo no tiene prácticas con km en blanco.'; el.classList.remove('hidden');
    return;
  }

  const topeInfo = (inicio || final) ? `\n\nTope odómetro: ${inicio || '(auto)'} → ${final || '(sin límite)'}` : '';
  if (!confirm(`Se van a generar km para ${n} práctica(s) con km en blanco del vehículo seleccionado.\n\nRango por práctica: ${min}-${max} km${topeInfo}\n\n¿Continuar?`)) return;

  const result = await window.api.rellenarKmMasivo(vid, min, max, inicio, final);
  const el = document.getElementById('relleno-alert');
  el.className = 'alert alert-ok';
  const saltadasMsg = result.saltadas ? ` (${result.saltadas} saltadas por tope)` : '';
  el.innerHTML = `${result.rellenadas} práctica(s) rellenadas${saltadasMsg}. &nbsp;
    <button class="btn btn-warn btn-sm" style="margin-left:8px" onclick="navegarA('kilometros','conflictos')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Verificar solapamientos ahora
    </button>`;
  el.classList.remove('hidden');
  loadVehiculos();
}

async function addVehiculo() {
  const nombre = document.getElementById('v-nombre').value.trim();
  const matricula = document.getElementById('v-matricula').value.trim();
  const km = parseFloat(document.getElementById('v-km').value) || 0;
  if (!nombre) { alert('Introduce un nombre para el vehículo.'); return; }
  await window.api.addVehiculo(nombre, matricula, km);
  document.getElementById('v-nombre').value = '';
  document.getElementById('v-matricula').value = '';
  document.getElementById('v-km').value = '';
  loadVehiculos();
}

async function deleteVehiculo(id, nombre) {
  if (!confirm(`¿Borrar el vehículo "${nombre}"? Se eliminará de todos los alumnos asignados.`)) return;
  await window.api.deleteVehiculo(id);
  loadVehiculos();
}

function openEditVehiculo(id, nombre, matricula, km) {
  document.getElementById('edit-v-id').value = id;
  document.getElementById('edit-v-nombre').value = nombre;
  document.getElementById('edit-v-matricula').value = matricula || '';
  document.getElementById('edit-v-km').value = km;
  openModal('modal-vehiculo');
}

async function saveVehiculo() {
  const id = parseInt(document.getElementById('edit-v-id').value);
  const nombre = document.getElementById('edit-v-nombre').value.trim();
  const matricula = document.getElementById('edit-v-matricula').value.trim();
  const km = parseFloat(document.getElementById('edit-v-km').value);
  if (!nombre) { alert('Introduce un nombre para el vehículo.'); return; }
  if (isNaN(km)) { alert('Introduce un km válido.'); return; }
  await window.api.updateVehiculo(id, nombre, matricula);
  await window.api.updateVehiculoKm(id, km);
  closeModal('modal-vehiculo');
  loadVehiculos();
}

// ─── PROFESORES ───────────────────────────────────────────────────────────────
async function loadProfesores() {
  profesoresCache = await window.api.getProfesores();
  const tbody = document.querySelector('#tabla-profesores tbody');
  if (!profesoresCache.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No hay profesores registrados</td></tr>';
    return;
  }
  tbody.innerHTML = profesoresCache.map(p => `<tr>
      <td><strong>${esc(p.nombre)}</strong></td>
      <td>${esc(p.nota) || '<span style="color:#bbb">—</span>'}</td>
      <td>${p.num_practicas}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="openEditProfesor(${p.id},'${esc(p.nombre)}','${esc(p.nota || '')}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProfesor(${p.id},'${esc(p.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> Borrar</button>
      </td>
    </tr>`).join('');
}

async function addProfesor() {
  const nombre = document.getElementById('pf-nombre').value.trim();
  const nota = document.getElementById('pf-nota').value.trim();
  if (!nombre) { alert('Introduce un nombre para el profesor.'); return; }
  await window.api.addProfesor(nombre, nota);
  document.getElementById('pf-nombre').value = '';
  document.getElementById('pf-nota').value = '';
  loadProfesores();
}

async function deleteProfesor(id, nombre) {
  if (!confirm(`¿Borrar el profesor "${nombre}"? Las prácticas ya registradas conservarán a este profesor en su historial.`)) return;
  await window.api.deleteProfesor(id);
  loadProfesores();
}

function openEditProfesor(id, nombre, nota) {
  document.getElementById('edit-pf-id').value = id;
  document.getElementById('edit-pf-nombre').value = nombre;
  document.getElementById('edit-pf-nota').value = nota;
  openModal('modal-profesor');
}

async function saveProfesor() {
  const id = parseInt(document.getElementById('edit-pf-id').value);
  const nombre = document.getElementById('edit-pf-nombre').value.trim();
  const nota = document.getElementById('edit-pf-nota').value.trim();
  if (!nombre) { alert('Introduce un nombre para el profesor.'); return; }
  await window.api.updateProfesor(id, nombre, nota);
  closeModal('modal-profesor');
  loadProfesores();
}

// Rellena un <select> de profesores con un placeholder "Sin profesor" y,
// opcionalmente, deja preseleccionado un id (usado al editar una práctica).
async function llenarSelectProfesores(selectId, selectedId) {
  profesoresCache = await window.api.getProfesores();
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin profesor —</option>' +
    profesoresCache.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  sel.value = (selectedId !== undefined && selectedId !== null) ? String(selectedId) : '';
}

// ─── ALUMNOS ─────────────────────────────────────────────────────────────────
async function loadVehiculosSelect() {
  vehiculosCache = await window.api.getVehiculos();
  ['a-vehiculo', 'edit-a-vehiculo'].forEach(selId => {
    const sel = document.getElementById(selId);
    sel.innerHTML = '<option value="">-- Sin asignar --</option>';
    vehiculosCache.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = `${v.nombre}${v.matricula ? ' (' + v.matricula + ')' : ''}`;
      sel.appendChild(opt);
    });
  });
}

async function loadAlumnos() {
  const alumnos = await window.api.getAlumnos();
  // Para cada alumno contar prácticas (una sola vez; el resto de filtrado/orden es en memoria)
  alumnosCache = await Promise.all(alumnos.map(async a => {
    const practicas = await window.api.getPracticas(a.id);
    return { ...a, num_practicas: practicas.length };
  }));
  poblarFiltrosAlumnos();
  renderAlumnosTabla();
}

// ─── Filtros y ordenación de la tabla de alumnos (en memoria, sobre alumnosCache) ───
function poblarFiltrosAlumnos() {
  const selVehiculo = document.getElementById('f-alumnos-vehiculo');
  const selPermiso = document.getElementById('f-alumnos-permiso');
  const selProfesor = document.getElementById('f-alumnos-profesor');
  if (!selVehiculo || !selPermiso) return;

  const vehiculoActual = selVehiculo.value;
  const permisoActual = selPermiso.value;
  const profesorActual = selProfesor ? selProfesor.value : '';

  const vehiculosVistos = new Map();
  let haySinAsignar = false;
  alumnosCache.forEach(a => {
    if (a.vehiculo_id) {
      if (!vehiculosVistos.has(a.vehiculo_id)) {
        vehiculosVistos.set(a.vehiculo_id, a.vehiculo_nombre || `Vehículo ${a.vehiculo_id}`);
      }
    } else {
      haySinAsignar = true;
    }
  });
  const vehiculosOpts = [...vehiculosVistos.entries()]
    .sort((x, y) => x[1].localeCompare(y[1], 'es', { numeric: true }));

  selVehiculo.innerHTML = '<option value="">Todos los vehículos</option>' +
    vehiculosOpts.map(([id, nombre]) => `<option value="${id}">${esc(nombre)}</option>`).join('') +
    (haySinAsignar ? '<option value="none">Sin asignar</option>' : '');

  const permisosOpts = [...new Set(alumnosCache.map(a => a.permiso).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  selPermiso.innerHTML = '<option value="">Todos los permisos</option>' +
    permisosOpts.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');

  if (selProfesor) {
    const profesoresVistos = new Map();
    let haySinProfesor = false;
    alumnosCache.forEach(a => {
      if (a.profesor_id) {
        if (!profesoresVistos.has(a.profesor_id)) {
          profesoresVistos.set(a.profesor_id, a.profesor_nombre || `Profesor ${a.profesor_id}`);
        }
      } else {
        haySinProfesor = true;
      }
    });
    const profesoresOpts = [...profesoresVistos.entries()]
      .sort((x, y) => x[1].localeCompare(y[1], 'es', { numeric: true }));
    selProfesor.innerHTML = '<option value="">Todos los profesores</option>' +
      profesoresOpts.map(([id, nombre]) => `<option value="${id}">${esc(nombre)}</option>`).join('') +
      (haySinProfesor ? '<option value="none">Sin asignar</option>' : '');
  }

  // Restaurar la selección previa si la opción sigue existiendo (para no perder el filtro al refrescar)
  if ([...selVehiculo.options].some(o => o.value === vehiculoActual)) selVehiculo.value = vehiculoActual;
  if ([...selPermiso.options].some(o => o.value === permisoActual)) selPermiso.value = permisoActual;
  if (selProfesor && [...selProfesor.options].some(o => o.value === profesorActual)) selProfesor.value = profesorActual;
}

function limpiarFiltrosAlumnos() {
  const nombre = document.getElementById('f-alumnos-nombre');
  const vehiculo = document.getElementById('f-alumnos-vehiculo');
  const permiso = document.getElementById('f-alumnos-permiso');
  const profesor = document.getElementById('f-alumnos-profesor');
  if (nombre) nombre.value = '';
  if (vehiculo) vehiculo.value = '';
  if (permiso) permiso.value = '';
  if (profesor) profesor.value = '';
  renderAlumnosTabla();
}

function ordenarAlumnos(col) {
  if (alumnosSort.col === col) {
    alumnosSort.dir *= -1;
  } else {
    alumnosSort.col = col;
    alumnosSort.dir = 1;
  }
  renderAlumnosTabla();
}

const SVG_SORT_ASC = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
const SVG_SORT_DESC = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

function actualizarIndicadoresOrdenAlumnos() {
  document.querySelectorAll('#tabla-alumnos thead th[data-sort]').forEach(th => {
    const ind = th.querySelector('.sort-ind');
    if (!ind) return;
    if (th.dataset.sort === alumnosSort.col) {
      ind.innerHTML = alumnosSort.dir === 1 ? SVG_SORT_ASC : SVG_SORT_DESC;
      th.classList.add('sort-active');
    } else {
      ind.innerHTML = '';
      th.classList.remove('sort-active');
    }
  });
}

function renderAlumnosTabla() {
  const tbody = document.querySelector('#tabla-alumnos tbody');
  const nombreFiltro = (document.getElementById('f-alumnos-nombre')?.value || '').trim().toLowerCase();
  const vehiculoFiltro = document.getElementById('f-alumnos-vehiculo')?.value || '';
  const permisoFiltro = document.getElementById('f-alumnos-permiso')?.value || '';
  const profesorFiltro = document.getElementById('f-alumnos-profesor')?.value || '';

  let filtrados = alumnosCache.filter(a => {
    if (nombreFiltro && !a.nombre.toLowerCase().includes(nombreFiltro)) return false;
    if (vehiculoFiltro === 'none') {
      if (a.vehiculo_id) return false;
    } else if (vehiculoFiltro && String(a.vehiculo_id || '') !== vehiculoFiltro) {
      return false;
    }
    if (permisoFiltro && a.permiso !== permisoFiltro) return false;
    if (profesorFiltro === 'none') {
      if (a.profesor_id) return false;
    } else if (profesorFiltro && String(a.profesor_id || '') !== profesorFiltro) {
      return false;
    }
    return true;
  });

  const { col, dir } = alumnosSort;
  if (col) {
    filtrados = [...filtrados].sort((a, b) => {
      if (col === 'practicas') return (a.num_practicas - b.num_practicas) * dir;
      let va = '', vb = '';
      if (col === 'nombre') { va = a.nombre || ''; vb = b.nombre || ''; }
      else if (col === 'permiso') { va = a.permiso || ''; vb = b.permiso || ''; }
      else if (col === 'vehiculo') { va = a.vehiculo_nombre || ''; vb = b.vehiculo_nombre || ''; }
      else if (col === 'profesor') { va = a.profesor_nombre || ''; vb = b.profesor_nombre || ''; }
      return va.localeCompare(vb, 'es', { numeric: true }) * dir;
    });
  }
  actualizarIndicadoresOrdenAlumnos();

  if (!alumnosCache.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay alumnos registrados</td></tr>';
    return;
  }
  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Ningún alumno coincide con los filtros</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(a => {
    const tag = tagPermiso(a.permiso);
    return `<tr>
      <td><strong>${esc(a.nombre)}</strong></td>
      <td>${tag}</td>
      <td>${a.vehiculo_nombre ? esc(a.vehiculo_nombre) : '<span style="color:#bbb">Sin asignar</span>'}</td>
      <td>${a.profesor_nombre ? esc(a.profesor_nombre) : '<span style="color:#bbb">Sin asignar</span>'}</td>
      <td><span style="font-weight:700">${a.num_practicas}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="verPracticas(${a.id},${a.vehiculo_id || 'null'},'${esc(a.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> Prácticas</button>
        <button class="btn btn-sm" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d" onclick="verAnotaciones(${a.id},'${esc(a.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Anotaciones</button>
        <button class="btn btn-warn btn-sm" onclick="openEditAlumno(${a.id},'${esc(a.nombre)}','${a.permiso}',${a.vehiculo_id || 'null'},${a.profesor_id || 'null'})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAlumno(${a.id},'${esc(a.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> Borrar</button>
      </td>
    </tr>`;
  }).join('');
}

async function addAlumno() {
  const nombre = document.getElementById('a-nombre').value.trim();
  const permiso = document.getElementById('a-permiso').value;
  const vid = document.getElementById('a-vehiculo').value || null;
  const profId = document.getElementById('a-profesor')?.value || null;
  if (!nombre) {
    showToast('alumno-alert', 'Introduce el nombre del alumno.', 'err');
    document.getElementById('a-nombre').focus();
    return;
  }
  hideToast('alumno-alert');
  await window.api.addAlumno(nombre, permiso, vid ? parseInt(vid) : null, profId ? parseInt(profId) : null);
  document.getElementById('a-nombre').value = '';
  loadAlumnos();
}

async function deleteAlumno(id, nombre) {
  if (!confirm(`¿Borrar al alumno "${nombre}" y todas sus prácticas?`)) return;
  await window.api.deleteAlumno(id);
  loadAlumnos();
}

async function verAnotaciones(alumnoId, nombre) {
  const anotaciones = await window.api.getAnotacionesAlumno(alumnoId);
  const modal = document.getElementById('modal-anotaciones');
  document.getElementById('modal-anotaciones-titulo').textContent = `Anotaciones de ${nombre}`;
  const body = document.getElementById('modal-anotaciones-body');
  if (!anotaciones.length) {
    body.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No hay anotaciones para este alumno.</p>';
  } else {
    body.innerHTML = anotaciones.map(a => `
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <strong style="color:var(--primary)">${esc(a.fecha)}</strong>
          <span style="font-size:12px;color:var(--text-muted)">${esc(a.vehiculo_nombre)}</span>
        </div>
        <div style="font-size:14px">${esc(a.nota)}</div>
      </div>
    `).join('');
  }
  modal.classList.add('open');
}

async function openEditAlumno(id, nombre, permiso, vehiculo_id, profesor_id) {
  document.getElementById('edit-a-id').value = id;
  document.getElementById('edit-a-nombre').value = nombre;
  document.getElementById('edit-a-permiso').value = permiso;
  document.getElementById('edit-a-vehiculo').value = vehiculo_id || '';
  await llenarSelectProfesores('edit-a-profesor', profesor_id);
  openModal('modal-alumno');
}

async function saveAlumno() {
  const id = parseInt(document.getElementById('edit-a-id').value);
  const nombre = document.getElementById('edit-a-nombre').value.trim();
  const permiso = document.getElementById('edit-a-permiso').value;
  const vid = document.getElementById('edit-a-vehiculo').value || null;
  const profId = document.getElementById('edit-a-profesor')?.value || null;
  if (!nombre) { alert('Introduce un nombre.'); return; }
  await window.api.updateAlumno(id, nombre, permiso, vid ? parseInt(vid) : null, profId ? parseInt(profId) : null);
  closeModal('modal-alumno');
  loadAlumnos();
}

// ─── PRÁCTICAS ───────────────────────────────────────────────────────────────
function verPracticas(alumnoId, vehiculoId, nombre) {
  currentAlumnoId = alumnoId;
  currentAlumnoVehiculoId = vehiculoId;
  document.getElementById('practicas-titulo').textContent = `Prácticas de ${nombre}`;
  document.getElementById('view-alumnos').style.display = 'none';
  document.getElementById('view-practicas').style.display = 'block';
  // Fecha de hoy por defecto
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('p-fecha').value = hoy;
  document.getElementById('p-ki').value = '';
  document.getElementById('p-kf').value = '';
  document.getElementById('km-preview').classList.add('hidden');
  aplicarRangoPref('p-min', 'p-max');
  loadPracticas();
}

function volverAlumnos() {
  currentAlumnoId = null;
  document.getElementById('view-alumnos').style.display = 'block';
  document.getElementById('view-practicas').style.display = 'none';
  loadAlumnos();
}

async function loadPracticas() {
  if (!currentAlumnoId) return;
  const practicas = await window.api.getPracticas(currentAlumnoId);
  const tbody = document.querySelector('#tabla-practicas tbody');
  if (!practicas.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay prácticas registradas para este alumno</td></tr>';
    return;
  }
  tbody.innerHTML = practicas.map((p, i) => {
    const sinKm = p.km_inicial === 0 && p.km_final === 0;
    const diff = Math.round((p.km_final - p.km_inicial) * 10) / 10;
    const kmICell = sinKm ? '<span style="color:#d97706;font-style:italic">Sin km</span>' : fmt(p.km_inicial);
    const kmFCell = sinKm ? '<span style="color:#d97706;font-style:italic">Sin km</span>' : fmt(p.km_final);
    const diffCell = sinKm ? '<span style="color:#d97706;font-style:italic">—</span>' : `<span class="km-badge">+${diff} km</span>`;
    const profesorCell = p.profesor_nombre ? esc(p.profesor_nombre) : '<span style="color:#bbb">—</span>';
    const profesorIdArg = p.profesor_id != null ? p.profesor_id : 'null';
    const tipo = p.tipo || 'circulacion';
    const tipoCell = tipo === 'pista' ? 'Pista' : 'Circulación';
    return `<tr${sinKm ? ' style="background:#fffbeb"' : ''}>
      <td>${i + 1}</td>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${kmICell}</td>
      <td>${kmFCell}</td>
      <td>${diffCell}</td>
      <td>${profesorCell}</td>
      <td>${tipoCell}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="openEditPractica(${p.id},'${p.fecha}',${p.km_inicial},${p.km_final},${profesorIdArg},'${tipo}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
        <button class="btn btn-danger btn-sm" onclick="deletePractica(${p.id})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
      </td>
    </tr>`;
  }).join('');
}

async function generarKmPractica() {
  if (!currentAlumnoId) return;
  const min = parseFloat(document.getElementById('p-min').value) || 40;
  const max = parseFloat(document.getElementById('p-max').value) || 45;

  // Obtener km de partida: última práctica del alumno o km del vehículo
  let kmBase = 0;
  const ultima = await window.api.getUltimaPractica(currentAlumnoId);
  if (ultima) {
    kmBase = ultima.km_final;
  } else if (currentAlumnoVehiculoId) {
    const vehiculos = await window.api.getVehiculos();
    const v = vehiculos.find(x => x.id === currentAlumnoVehiculoId);
    if (v) kmBase = v.km_actual;
  }

  const result = await window.api.generarKm(kmBase, min, max);
  document.getElementById('p-ki').value = result.km_inicial;
  document.getElementById('p-kf').value = result.km_final;

  const preview = document.getElementById('km-preview');
  preview.textContent = `Generado: ${fmt(result.km_inicial)} → ${fmt(result.km_final)}  (+${result.diff} km)`;
  preview.classList.remove('hidden');
}

async function addPractica() {
  if (!currentAlumnoId) return;
  const fecha = document.getElementById('p-fecha').value;
  const kiRaw = document.getElementById('p-ki').value;
  const kfRaw = document.getElementById('p-kf').value;

  if (!fecha) { alert('Selecciona una fecha.'); return; }

  const vid = currentAlumnoVehiculoId;
  if (!vid) { alert('El alumno no tiene un vehículo asignado. Asígnale uno primero.'); return; }

  // Si los km están vacíos se guardan como 0,0 para rellenar luego
  let ki = parseFloat(kiRaw);
  let kf = parseFloat(kfRaw);
  const sinKm = isNaN(ki) || isNaN(kf);

  if (!sinKm && kf <= ki) { alert('El km final debe ser mayor que el km inicial.'); return; }

  if (sinKm) { ki = 0; kf = 0; }

  const tipo = document.getElementById('p-tipo')?.value || 'circulacion';
  await window.api.addPractica(currentAlumnoId, vid, fecha, ki, kf, null, tipo);
  document.getElementById('p-ki').value = '';
  document.getElementById('p-kf').value = '';
  document.getElementById('km-preview').classList.add('hidden');
  loadPracticas();
}

async function deletePractica(id) {
  if (!confirm('¿Borrar esta práctica?')) return;
  await window.api.deletePractica(id);
  loadPracticas();
}

async function openEditPractica(id, fecha, ki, kf, profesorId, tipo) {
  document.getElementById('edit-p-id').value = id;
  document.getElementById('edit-p-fecha').value = fecha;
  document.getElementById('edit-p-ki').value = ki;
  document.getElementById('edit-p-kf').value = kf;
  document.getElementById('edit-p-tipo').value = tipo || 'circulacion';
  await llenarSelectProfesores('edit-p-profesor', profesorId);
  openModal('modal-practica');
}

async function savePractica() {
  const id = parseInt(document.getElementById('edit-p-id').value);
  const fecha = document.getElementById('edit-p-fecha').value;
  const ki = parseFloat(document.getElementById('edit-p-ki').value);
  const kf = parseFloat(document.getElementById('edit-p-kf').value);
  const profesorId = document.getElementById('edit-p-profesor').value;
  const tipo = document.getElementById('edit-p-tipo').value || 'circulacion';
  if (!fecha || isNaN(ki) || isNaN(kf)) { alert('Rellena todos los campos.'); return; }
  if (kf <= ki) { alert('El km final debe ser mayor que el inicial.'); return; }

  // Validación cruzada: comprobar solapamiento con otras prácticas del mismo vehículo
  const vid = currentAlumnoVehiculoId;
  if (vid) {
    const conflictos = await window.api.validarSolapamiento(vid, fecha, ki, kf, id);
    if (conflictos.length) {
      const detalle = conflictos.map(c =>
        `• ${c.alumno} — ${fmtFecha(c.fecha)}: ${fmt(c.km_inicial)} → ${fmt(c.km_final)}`
      ).join('\n');
      const continuar = confirm(
        `Estos km se solapan con ${conflictos.length} práctica(s) del mismo vehículo:\n\n${detalle}\n\n¿Guardar igualmente?`
      );
      if (!continuar) return;
    }
  }

  await window.api.updatePractica(id, fecha, ki, kf, profesorId, tipo);
  closeModal('modal-practica');
  // Si venimos de la pestaña Conflictos (Kilómetros), recargar esa vista; si no, las prácticas del alumno
  const kilometrosPage = document.getElementById('page-kilometros');
  const conflictosTab = document.getElementById('tab-kilometros-conflictos');
  if (kilometrosPage && kilometrosPage.classList.contains('active') && conflictosTab && conflictosTab.classList.contains('active')) {
    loadSolapamientos();
  } else {
    loadPracticas();
  }
}

// ─── PAGOS ────────────────────────────────────────────────────────────────────
function cambiarTabPagos(tab) {
  document.querySelectorAll('#page-pagos .page-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#page-pagos .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-pagos-' + tab));
  if (tab === 'deudas') loadDeudas();
  if (tab === 'tarifas') loadTarifas();
}

async function loadDeudas() {
  const deudas = await window.api.getDeudas();
  const tbody = document.querySelector('#tabla-deudas tbody');
  const aviso = document.getElementById('pagos-aviso-sin-tarifa');
  aviso.classList.toggle('hidden', !deudas.some(d => d.sin_tarifa));

  if (!deudas.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay alumnos registrados</td></tr>';
    return;
  }

  tbody.innerHTML = deudas.map(d => {
    const saldoClase = d.saldo > 0 ? 'saldo-pendiente' : 'saldo-ok';
    const avisoIcon = d.sin_tarifa
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--warn);vertical-align:-2px;margin-right:4px" title="Alguna práctica no tiene tarifa asignada"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      : '';
    return `<tr>
      <td>${avisoIcon}<strong>${esc(d.alumno_nombre)}</strong></td>
      <td>${tagPermiso(d.permiso)}</td>
      <td>${d.num_practicas}</td>
      <td>${fmt(d.total_generado)} €</td>
      <td>${fmt(d.total_pagado)} €</td>
      <td><span class="${saldoClase}">${fmt(d.saldo)} €</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="abrirModalPago(${d.alumno_id},'${esc(d.alumno_nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Anotar pago</button>
        <button class="btn btn-gray btn-sm" onclick="abrirHistorialPagos(${d.alumno_id},'${esc(d.alumno_nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Historial</button>
      </td>
    </tr>`;
  }).join('');
}

function abrirModalPago(alumnoId, alumnoNombre) {
  document.getElementById('edit-pago-id').value = '';
  document.getElementById('edit-pago-alumno-id').value = alumnoId;
  document.getElementById('edit-pago-cantidad').value = '';
  document.getElementById('edit-pago-nota').value = '';
  document.getElementById('edit-pago-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('modal-pago-titulo').textContent = `Anotar pago — ${alumnoNombre}`;
  openModal('modal-pago');
}

function openEditPago(id, alumnoId, alumnoNombre, fecha, cantidad, nota) {
  document.getElementById('edit-pago-id').value = id;
  document.getElementById('edit-pago-alumno-id').value = alumnoId;
  document.getElementById('edit-pago-fecha').value = fecha;
  document.getElementById('edit-pago-cantidad').value = cantidad;
  document.getElementById('edit-pago-nota').value = nota || '';
  document.getElementById('modal-pago-titulo').textContent = `Editar pago — ${alumnoNombre}`;
  openModal('modal-pago');
}

async function savePago() {
  const id = document.getElementById('edit-pago-id').value;
  const alumnoId = parseInt(document.getElementById('edit-pago-alumno-id').value);
  const fecha = document.getElementById('edit-pago-fecha').value;
  const cantidad = parseFloat(document.getElementById('edit-pago-cantidad').value);
  const nota = document.getElementById('edit-pago-nota').value.trim();
  if (!fecha) { alert('Selecciona una fecha.'); return; }
  if (isNaN(cantidad) || cantidad <= 0) { alert('Introduce una cantidad válida.'); return; }

  if (id) {
    await window.api.updatePago(parseInt(id), fecha, cantidad, nota);
  } else {
    await window.api.addPago(alumnoId, fecha, cantidad, nota);
  }
  closeModal('modal-pago');
  loadDeudas();

  // Si el historial de este alumno está abierto, refrescarlo también
  const modalHist = document.getElementById('modal-historial-pagos');
  if (modalHist.classList.contains('open') && parseInt(modalHist.dataset.alumnoId) === alumnoId) {
    abrirHistorialPagos(alumnoId, modalHist.dataset.alumnoNombre);
  }
}

async function abrirHistorialPagos(alumnoId, alumnoNombre) {
  const pagos = await window.api.getPagosAlumno(alumnoId);
  const modal = document.getElementById('modal-historial-pagos');
  modal.dataset.alumnoId = alumnoId;
  modal.dataset.alumnoNombre = alumnoNombre;
  document.getElementById('modal-historial-pagos-titulo').textContent = `Historial de pagos — ${alumnoNombre}`;
  const tbody = document.querySelector('#tabla-historial-pagos tbody');
  if (!pagos.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No hay pagos registrados</td></tr>';
  } else {
    tbody.innerHTML = pagos.map(p => `<tr>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${fmt(p.cantidad)} €</td>
      <td>${p.nota ? esc(p.nota) : '<span style="color:#bbb">—</span>'}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="openEditPago(${p.id},${alumnoId},'${esc(alumnoNombre)}','${p.fecha}',${p.cantidad},'${esc(p.nota || '')}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
        <button class="btn btn-danger btn-sm" onclick="deletePagoUI(${p.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
      </td>
    </tr>`).join('');
  }
  openModal('modal-historial-pagos');
}

async function deletePagoUI(id) {
  if (!confirm('¿Borrar este pago?')) return;
  await window.api.deletePago(id);
  const modal = document.getElementById('modal-historial-pagos');
  const alumnoId = parseInt(modal.dataset.alumnoId);
  const alumnoNombre = modal.dataset.alumnoNombre;
  await abrirHistorialPagos(alumnoId, alumnoNombre);
  loadDeudas();
}

async function loadTarifas() {
  const [tarifas, alumnos] = await Promise.all([window.api.getTarifas(), window.api.getAlumnos()]);
  const permisos = Array.from(new Set([
    ...alumnos.map(a => a.permiso),
    ...tarifas.map(t => t.permiso)
  ])).sort();

  const tbody = document.querySelector('#tabla-tarifas tbody');
  if (!permisos.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">No hay permisos todavía — añade un alumno primero</td></tr>';
    return;
  }

  tbody.innerHTML = permisos.map(permiso => {
    const tCirc = tarifas.find(t => t.permiso === permiso && t.tipo === 'circulacion');
    const tPista = tarifas.find(t => t.permiso === permiso && t.tipo === 'pista');
    const idCirc = `tarifa-${permiso}-circulacion`;
    const idPista = `tarifa-${permiso}-pista`;
    return `<tr>
      <td>${tagPermiso(permiso)}</td>
      <td><input type="number" id="${idCirc}" min="0" step="0.01" value="${tCirc ? tCirc.precio : 0}" style="width:100px" onchange="guardarTarifaUI('${permiso}','circulacion','${idCirc}')"></td>
      <td><input type="number" id="${idPista}" min="0" step="0.01" value="${tPista ? tPista.precio : 0}" style="width:100px" onchange="guardarTarifaUI('${permiso}','pista','${idPista}')"></td>
    </tr>`;
  }).join('');
}

async function guardarTarifaUI(permiso, tipo, valorInputId) {
  const input = document.getElementById(valorInputId);
  const valor = parseFloat(input.value);
  if (isNaN(valor) || valor < 0) { alert('Introduce un precio válido.'); return; }
  await window.api.setTarifa(permiso, tipo, valor);
  const tipoTxt = tipo === 'pista' ? 'Pista' : 'Circulación';
  showToast('pagos-tarifa-toast', `Tarifa de ${permiso} (${tipoTxt}) guardada: ${fmt(valor)} €`, 'ok');
}

// ─── IMPORTAR CSV ─────────────────────────────────────────────────────────────
async function seleccionarCSV() {
  const filePath = await window.api.openCsvDialog();
  if (!filePath) return;
  selectedCsvPath = filePath;
  document.getElementById('csv-path').textContent = filePath;
  document.getElementById('btn-importar').disabled = false;
  showImportAlert('Archivo seleccionado. Pulsa "Importar" para procesar.', 'info');
}

async function importarCSV() {
  if (!selectedCsvPath) return;
  const kmMin = parseFloat(document.getElementById('imp-min').value) || 40;
  const kmMax = parseFloat(document.getElementById('imp-max').value) || 45;
  const result = await window.api.importarCsv(selectedCsvPath, kmMin, kmMax);
  if (!result.ok) {
    showImportAlert('Error: ' + result.msg, 'err');
    return;
  }
  let msg = `Importación completada: ${result.insertados} prácticas insertadas.`;
  if (result.errores > 0) {
    msg += `\n\n${result.errores} filas con error:\n`;
    msg += result.erroresDetalle.map(e => `  • Fila ${e.fila}: ${e.motivo}  [${e.datos}]`).join('\n');
    showImportAlert(msg.replace(/\n/g, '<br>'), result.insertados > 0 ? 'ok' : 'err');
  } else {
    showImportAlert(msg, 'ok');
  }
  if (result.erroresDetalle && result.erroresDetalle.length) {
    console.table(result.erroresDetalle);
  }
  selectedCsvPath = null;
  document.getElementById('csv-path').textContent = '';
  document.getElementById('btn-importar').disabled = true;
}

function showImportAlert(msg, type) {
  const el = document.getElementById('import-alert');
  el.className = `alert alert-${type}`;
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

// ─── EXPORTAR / COMPARAR CSV ─────────────────────────────────────────────────
let csvAPath = null, csvBPath = null;

async function exportarCSV() {
  const res = await window.api.exportarCsv({});
  const el = document.getElementById('export-result');
  if (res.canceled) { el.classList.add('hidden'); return; }
  if (!res.ok) {
    el.className = 'alert alert-err';
    el.textContent = 'Error: ' + res.msg;
  } else {
    el.className = 'alert alert-ok';
    el.textContent = `Exportadas ${res.total} prácticas a: ${res.path}`;
  }
  el.classList.remove('hidden');
}

async function seleccionarCsvA() {
  const path = await window.api.openCsvDialog();
  if (!path) return;
  csvAPath = path;
  document.getElementById('csv-a-path').value = path.split(/[/\\]/).pop();
  actualizarBtnComparar();
}

async function seleccionarCsvB() {
  const path = await window.api.openCsvDialog();
  if (!path) return;
  csvBPath = path;
  document.getElementById('csv-b-path').value = path.split(/[/\\]/).pop();
  actualizarBtnComparar();
}

function actualizarBtnComparar() {
  document.getElementById('btn-comparar').disabled = !(csvAPath && csvBPath);
}

async function compararCSVs() {
  if (!csvAPath || !csvBPath) return;
  const res = await window.api.compararCsvs(csvAPath, csvBPath, {});
  
  if (!res.ok) {
    alert('Error al comparar: ' + res.msg);
    return;
  }
  
  const r = res.resumen;
  document.getElementById('cmp-resumen').innerHTML = `
    <div style="background:var(--gray-light);padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700">${r.totalA}</div>
      <div style="font-size:11px;color:var(--text-muted)">Prácticas CSV A</div>
    </div>
    <div style="background:var(--gray-light);padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700">${r.totalB}</div>
      <div style="font-size:11px;color:var(--text-muted)">Prácticas CSV B</div>
    </div>
    <div style="background:#e0e7ff;padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#4f46e5">${r.alumnosTotal}</div>
      <div style="font-size:11px;color:#3730a3">Alumnos totales</div>
    </div>
    <div style="background:#d1fae5;padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#059669">${r.diasCoinciden}</div>
      <div style="font-size:11px;color:#065f46">Días coinciden</div>
    </div>
    <div style="background:#fee2e2;padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#dc2626">${r.diasConflicto}</div>
      <div style="font-size:11px;color:#991b1b">Conflictos (≠ prácticas)</div>
    </div>
    <div style="background:#fef3c7;padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#d97706">${r.diasSoloEnA}</div>
      <div style="font-size:11px;color:#92400e">Días solo en A</div>
    </div>
    <div style="background:#dbeafe;padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#2563eb">${r.diasSoloEnB}</div>
      <div style="font-size:11px;color:#1e40af">Días solo en B</div>
    </div>
  `;
  
  // Alumnos diferentes
  const alumnosCard = document.getElementById('cmp-alumnos-card');
  if (res.alumnosSoloEnA.length || res.alumnosSoloEnB.length) {
    alumnosCard.style.display = '';
    document.getElementById('cmp-alumnos').innerHTML = `
      ${res.alumnosSoloEnA.length ? `<div style="margin-bottom:8px"><strong style="color:#d97706">Solo en A:</strong> ${res.alumnosSoloEnA.map(a => esc(a)).join(', ')}</div>` : ''}
      ${res.alumnosSoloEnB.length ? `<div><strong style="color:#2563eb">Solo en B:</strong> ${res.alumnosSoloEnB.map(a => esc(a)).join(', ')}</div>` : ''}
    `;
  } else {
    alumnosCard.style.display = 'none';
  }
  
  // Detalle por alumno
  const detalleCard = document.getElementById('cmp-detalle-card');
  const detalleBody = document.getElementById('cmp-detalle-body');
  
  // Filtrar solo alumnos con diferencias
  const alumnosConDiferencias = res.porAlumno.filter(a => 
    a.conflictos.length > 0 || a.soloEnA.length > 0 || a.soloEnB.length > 0
  );
  
  if (alumnosConDiferencias.length > 0) {
    detalleCard.style.display = '';
    detalleBody.innerHTML = alumnosConDiferencias.map(a => {
      let html = `<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="font-weight:600;font-size:14px;margin-bottom:8px;color:var(--primary)">${esc(a.nombre)}</div>`;
      
      if (a.coincidencias.length > 0) {
        html += `<div style="margin-bottom:6px"><span style="color:#059669;font-weight:500">✓ Coinciden (${a.coincidencias.length}):</span> 
          <span style="font-size:12px;color:var(--text-muted)">${a.coincidencias.map(c => `${c.fecha} (${c.cant})`).join(', ')}</span></div>`;
      }
      
      if (a.conflictos.length > 0) {
        html += `<div style="margin-bottom:6px"><span style="color:#dc2626;font-weight:500">Conflictos (${a.conflictos.length}):</span> 
          <span style="font-size:12px">${a.conflictos.map(c => `<span style="background:#fee2e2;padding:2px 6px;border-radius:4px;margin:2px">${c.fecha}: A=${c.cantA} vs B=${c.cantB}</span>`).join(' ')}</span></div>`;
      }
      
      if (a.soloEnA.length > 0) {
        html += `<div style="margin-bottom:6px"><span style="color:#d97706;font-weight:500">Solo en A (${a.soloEnA.length}):</span> 
          <span style="font-size:12px">${a.soloEnA.map(d => `<span style="background:#fef3c7;padding:2px 6px;border-radius:4px;margin:2px">${d.fecha} (${d.cant})</span>`).join(' ')}</span></div>`;
      }
      
      if (a.soloEnB.length > 0) {
        html += `<div><span style="color:#2563eb;font-weight:500">Solo en B (${a.soloEnB.length}):</span> 
          <span style="font-size:12px">${a.soloEnB.map(d => `<span style="background:#dbeafe;padding:2px 6px;border-radius:4px;margin:2px">${d.fecha} (${d.cant})</span>`).join(' ')}</span></div>`;
      }
      
      html += '</div>';
      return html;
    }).join('');
  } else {
    detalleCard.style.display = 'none';
  }
  
  // Ocultar cards antiguos que ya no usamos
  document.getElementById('cmp-conflictos-card').style.display = 'none';
  document.getElementById('cmp-solo-a-card').style.display = 'none';
  document.getElementById('cmp-solo-b-card').style.display = 'none';
  document.getElementById('cmp-coincidencias-card').style.display = 'none';
  
  document.getElementById('cmp-results').classList.remove('hidden');
}

// ─── MODALES ─────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Cerrar modal al hacer click fuera
document.querySelectorAll('.overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ─── UTILS ───────────────────────────────────────────────────────────────────
function fmt(num) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(num);
}

function fmtFecha(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tagPermiso(p) {
  const cls = p === 'B' ? 'tag-b' : p === 'C' ? 'tag-c' : 'tag-a';
  return `<span class="tag ${cls}">${p}</span>`;
}

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

// ─── SOLAPAMIENTOS ───────────────────────────────────────────────────────────
async function loadSolapamientos() {
  const conflictos = await window.api.getSolapamientos();
  const el = document.getElementById('solap-result');
  const btnCorregir = document.getElementById('btn-corregir-todo');

  if (!conflictos.length) {
    el.innerHTML = '<div class="card"><p class="empty" style="color:#15803d;font-weight:600">✓ No se detectaron solapamientos de kilómetros.</p></div>';
    if (btnCorregir) btnCorregir.style.display = 'none';
    return;
  }

  if (btnCorregir) btnCorregir.style.display = 'inline-block';

  // Agrupar por vehículo
  const porVehiculo = {};
  conflictos.forEach(c => {
    if (!porVehiculo[c.vehiculo]) porVehiculo[c.vehiculo] = [];
    porVehiculo[c.vehiculo].push(c);
  });

  const vehiculosAfectados = Object.keys(porVehiculo).length;
  let html = `<div class="alert alert-err" style="margin-bottom:16px">Se encontraron <strong>${conflictos.length}</strong> solapamiento(s) en <strong>${vehiculosAfectados}</strong> vehículo(s). Pulsa <strong>Corregir todo automáticamente</strong> para que el programa reordene todos los km.</div>`;

  for (const [vehiculo, lista] of Object.entries(porVehiculo)) {
    html += `<div class="card" style="padding:0 0 1px;margin-bottom:16px">
      <div style="padding:12px 16px;background:#fef3c7;border-radius:10px 10px 0 0;font-weight:700;font-size:13px;color:#92400e">
        ${esc(vehiculo)} — ${lista.length} conflicto(s)
      </div>
      <table>
        <thead><tr><th>Alumno A</th><th>Fecha A</th><th>Km A</th><th></th><th>Alumno B</th><th>Fecha B</th><th>Km B</th></tr></thead>
        <tbody>`;
    lista.forEach(c => {
      const a = c.practica_a;
      const b = c.practica_b;
      html += `<tr>
        <td><strong>${esc(a.alumno)}</strong></td>
        <td>${fmtFecha(a.fecha)}</td>
        <td><span class="km-badge">${fmt(a.km_inicial)} → ${fmt(a.km_final)}</span></td>
        <td style="color:#dc2626;font-weight:700;text-align:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></td>
        <td><strong>${esc(b.alumno)}</strong></td>
        <td>${fmtFecha(b.fecha)}</td>
        <td><span class="km-badge">${fmt(b.km_inicial)} → ${fmt(b.km_final)}</span></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  el.innerHTML = html;
}

async function corregirTodosSolapamientos() {
  const min = parseFloat(document.getElementById('solap-min').value) || 40;
  const max = parseFloat(document.getElementById('solap-max').value) || 45;

  // Obtener todos los vehículos con solapamientos
  const conflictos = await window.api.getSolapamientos();
  if (!conflictos.length) return;

  const vehiculosAfectados = [...new Set(conflictos.map(c => c.vehiculo_id))];

  if (!confirm(`Se van a reordenar los kilómetros de ${vehiculosAfectados.length} vehículo(s) para eliminar todos los solapamientos.\n\nEl programa respetará la duración real de cada práctica y las reencadenará en orden cronológico.\n\n¿Continuar?`)) return;

  let totalCorregidas = 0;
  for (const vid of vehiculosAfectados) {
    const res = await window.api.corregirSolapamientos(vid, min, max);
    totalCorregidas += res.corregidas || 0;
  }

  // Reanalizar
  const restantes = await window.api.getSolapamientos();
  const el = document.getElementById('solap-result');
  const btnCorregir = document.getElementById('btn-corregir-todo');

  if (!restantes.length) {
    if (btnCorregir) btnCorregir.style.display = 'none';
    el.innerHTML = `<div class="alert alert-ok">Corrección completada. ${totalCorregidas} práctica(s) reordenadas. No quedan solapamientos.</div>`;
  } else {
    el.innerHTML = `<div class="alert alert-err">Se corrigieron ${totalCorregidas} prácticas pero aún quedan ${restantes.length} solapamientos. Pulsa Analizar para revisar.</div>`;
  }
}

// ─── LOGS ────────────────────────────────────────────────────────────────────
const LOG_ICONS = { importacion: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', relleno: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>', correccion: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>', conflicto_sync: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' };
const LOG_COLORS = { importacion: '#1d4ed8', relleno: '#15803d', correccion: '#92400e', conflicto_sync: '#b91c1c' };
const LOG_BG = { importacion: '#eff6ff', relleno: '#f0fdf4', correccion: '#fef3c7', conflicto_sync: '#fef2f2' };

async function loadLogs() {
  ocultarConflictosSync(); // visitar Historial cuenta como "visto" el aviso de conflictos
  const logs = await window.api.getLogs();
  const el = document.getElementById('logs-result');
  if (!logs.length) {
    el.innerHTML = '<div class="card"><p class="empty">No hay operaciones registradas todavía.</p></div>';
    return;
  }
  el.innerHTML = logs.map(log => {
    const ico = LOG_ICONS[log.tipo] || '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
    const color = LOG_COLORS[log.tipo] || '#444';
    const bg = LOG_BG[log.tipo] || '#f9f9f9';
    const fecha = new Date(log.fecha).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const detallesHtml = log.detalles && log.detalles.length
      ? `<ul style="margin:8px 0 0 16px;padding:0;font-size:12px;color:#555;list-style:disc">
          ${log.detalles.slice(0,20).map(d => `<li>${esc(d)}</li>`).join('')}
          ${log.detalles.length > 20 ? `<li style="color:#888">... y ${log.detalles.length - 20} más</li>` : ''}
         </ul>`
      : '';
    return `<div class="card" style="border-left:4px solid ${color};background:${bg};margin-bottom:10px;padding:14px 18px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:13px;color:${color}">${ico} ${esc(log.descripcion)}</span>
        <span style="font-size:11px;color:#888">${fecha}</span>
      </div>
      ${detallesHtml}
    </div>`;
  }).join('');
}

async function borrarLogs() {
  if (!confirm('¿Borrar todo el historial de operaciones automáticas?')) return;
  await window.api.clearLogs();
  loadLogs();
}

// ─── BACKUP ──────────────────────────────────────────────────────────────────
async function hacerBackup() {
  const result = await window.api.crearBackup();
  const el = document.getElementById('backup-ok');
  if (result.ok) {
    el.innerHTML = `Copia guardada: <strong>${esc(result.nombre || result.file)}</strong>`;
    el.className = 'alert alert-ok';
  } else {
    el.innerHTML = `Error: ${esc(result.msg)}`;
    el.className = 'alert alert-err';
  }
  el.classList.remove('hidden');
  loadUltimoBackup();
}

let ultimoBackupInfo = null;

async function loadUltimoBackup() {
  const el = document.getElementById('ultimo-backup-info');
  const btn = document.getElementById('btn-restaurar-ultimo');
  ultimoBackupInfo = await window.api.getUltimoBackup();
  if (!el || !btn) return;
  if (!ultimoBackupInfo) {
    el.textContent = 'Todavía no se ha guardado ninguna copia en la carpeta de la aplicación.';
    btn.disabled = true;
    return;
  }
  const fecha = ultimoBackupInfo.fecha
    ? new Date(ultimoBackupInfo.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  el.innerHTML = `Última copia: <strong>${esc(ultimoBackupInfo.nombre)}</strong>${fecha ? ' · ' + fecha : ''}`;
  btn.disabled = false;
}

async function restaurarUltimoBackup() {
  if (!ultimoBackupInfo) return;
  if (!confirm(`Esto reemplazará todos los datos actuales por la copia "${ultimoBackupInfo.nombre}". ¿Continuar?`)) return;
  const result = await window.api.restaurarUltimoBackup();
  if (!result.ok) {
    alert('Error al restaurar: ' + (result.msg || 'Error desconocido.'));
    return;
  }
  alert('Backup restaurado correctamente. A continuación puedes subir estos datos a la nube (la restauración no se sube sola).');
  await pushAllToCloud();
  location.reload();
}

async function restaurarBackup() {
  const result = await window.api.restaurarBackup();
  if (!result) return;
  if (!result.ok) {
    const el = document.getElementById('restaurar-err');
    el.textContent = result.msg || 'Error desconocido.';
    el.classList.remove('hidden');
    return;
  }
  alert('Backup restaurado correctamente. La aplicación se recargará ahora.');
  location.reload();
}

// ─── TIMELINE DEL VEHÍCULO ───────────────────────────────────────────────────
async function loadTimelineSelect() {
  const vehiculos = await window.api.getVehiculos();
  const sel = document.getElementById('timeline-vehiculo');
  if (!sel) return;
  sel.innerHTML = vehiculos.length
    ? vehiculos.map(v => `<option value="${v.id}">${esc(v.nombre)}${v.matricula ? ' (' + v.matricula + ')' : ''}</option>`).join('')
    : '<option value="">Sin vehículos</option>';
  loadTimeline();
}

async function loadTimeline() {
  const sel = document.getElementById('timeline-vehiculo');
  const result = document.getElementById('timeline-result');
  const resumen = document.getElementById('timeline-resumen');
  if (!sel || !result) return;
  const vid = parseInt(sel.value);
  if (!vid) { result.innerHTML = ''; resumen.textContent = ''; return; }

  const practicas = await window.api.getTimelineVehiculo(vid);
  if (!practicas.length) {
    result.innerHTML = '<div class="card"><p class="empty">Este vehículo no tiene prácticas registradas.</p></div>';
    resumen.textContent = '';
    return;
  }

  const conKm = practicas.filter(p => !p.sin_km);
  const sinKm = practicas.filter(p => p.sin_km);
  resumen.textContent = `${practicas.length} prácticas · ${conKm.length} con km · ${sinKm.length} sin km`;

  let html = '<div class="table-wrap"><table><thead><tr>'
    + '<th>#</th><th>Alumno</th><th>Fecha</th><th>Km inicial</th><th>Km final</th><th>Recorrido</th><th>Estado</th>'
    + '</tr></thead><tbody>';

  practicas.forEach((p, i) => {
    const diff = p.sin_km ? null : Math.round((p.km_final - p.km_inicial) * 10) / 10;

    // Color de fila según estado
    let rowStyle = '';
    let estadoCell = '<span style="color:#15803d;font-size:12px">✓ OK</span>';

    if (p.sin_km) {
      rowStyle = ' style="background:#fffbeb"';
      estadoCell = '<span style="color:#d97706;font-size:12px;font-weight:600">⏳ Sin km</span>';
    } else if (p.gap !== null && p.gap < 0) {
      rowStyle = ' style="background:#fef2f2"';
      estadoCell = `<span style="color:#dc2626;font-size:12px;font-weight:600">Solapa ${fmt(p.gap)} km</span>`;
    } else if (p.gap !== null && p.gap > 0) {
      rowStyle = ' style="background:#fffbeb"';
      estadoCell = `<span style="color:#d97706;font-size:12px;font-weight:600">Hueco +${fmt(p.gap)} km</span>`;
    }

    const kmI = p.sin_km ? '<span style="color:#d97706;font-style:italic">—</span>' : `<strong>${fmt(p.km_inicial)}</strong>`;
    const kmF = p.sin_km ? '<span style="color:#d97706;font-style:italic">—</span>' : fmt(p.km_final);
    const rec = p.sin_km ? '—' : `<span class="km-badge">+${diff} km</span>`;

    html += `<tr${rowStyle}>
      <td style="color:#94a3b8;font-size:12px">${i + 1}</td>
      <td><strong>${esc(p.alumno_nombre)}</strong></td>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${kmI}</td>
      <td>${kmF}</td>
      <td>${rec}</td>
      <td>${estadoCell}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  result.innerHTML = html;

  // ── GRÁFICO HORIZONTAL DE KM ──────────────────────────────────────────────
  renderTimelineChart(practicas);
}

// Paleta de colores para alumnos
const CHART_PALETTE = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6','#a855f7'
];

function renderTimelineChart(practicas) {
  const wrap = document.getElementById('timeline-chart-wrap');
  const barsEl = document.getElementById('timeline-chart-bars');
  const axisEl = document.getElementById('timeline-chart-axis');
  const legendEl = document.getElementById('timeline-chart-legend');

  // Solo prácticas con km
  const conKm = practicas.filter(p => !p.sin_km);
  if (!conKm.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  const kmMin = Math.min(...conKm.map(p => p.km_inicial));
  const kmMax = Math.max(...conKm.map(p => p.km_final));
  const rango = kmMax - kmMin || 1;

  // Mapa alumno → color
  const alumnos = [...new Set(conKm.map(p => p.alumno_nombre))];
  const colorMap = {};
  alumnos.forEach((a, i) => { colorMap[a] = CHART_PALETTE[i % CHART_PALETTE.length]; });

  // Leyenda
  legendEl.innerHTML = alumnos.map(a =>
    `<span style="display:inline-flex;align-items:center;gap:5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:3px 9px">
      <span style="width:10px;height:10px;border-radius:3px;background:${colorMap[a]};flex-shrink:0"></span>
      ${esc(a)}
    </span>`
  ).join('');

  // Barras — reusar tooltip si ya existe
  let tooltip = document.getElementById('km-chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'km-chart-tooltip';
    tooltip.style.cssText = 'position:fixed;background:#0f172a;color:#fff;font-size:11px;padding:7px 11px;border-radius:8px;pointer-events:none;opacity:0;transition:opacity .15s;z-index:999;max-width:220px;line-height:1.6;white-space:pre-wrap;box-shadow:0 4px 16px rgba(0,0,0,.3)';
    document.body.appendChild(tooltip);
  }

  barsEl.innerHTML = '';
  conKm.forEach(p => {
    const left  = ((p.km_inicial - kmMin) / rango) * 100;
    const width = Math.max(((p.km_final - p.km_inicial) / rango) * 100, 0.3);
    const color = colorMap[p.alumno_nombre];
    const isSolap = p.gap !== null && p.gap < 0;
    const isHueco = p.gap !== null && p.gap > 0;

    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute;
      left:${left}%;
      width:${width}%;
      top:0; bottom:0;
      background:${color};
      border-radius:4px;
      opacity:${isSolap ? 1 : 0.82};
      cursor:pointer;
      transition:opacity .12s, transform .12s;
      border:${isSolap ? '2px solid #dc2626' : '1.5px solid rgba(255,255,255,.3)'};
      box-sizing:border-box;
    `;

    const diff = Math.round((p.km_final - p.km_inicial) * 10) / 10;
    const tooltipText = `${p.alumno_nombre}\n${fmtFecha(p.fecha)}\n${fmt(p.km_inicial)} → ${fmt(p.km_final)}\n+${diff} km${isSolap ? '\nSOLAPA ' + fmt(p.gap) + ' km' : ''}${isHueco ? '\nHueco +' + fmt(p.gap) + ' km' : ''}`;

    bar.addEventListener('mouseenter', e => {
      bar.style.opacity = '1';
      bar.style.transform = 'scaleY(1.1)';
      tooltip.textContent = tooltipText;
      tooltip.style.opacity = '1';
    });
    bar.addEventListener('mousemove', e => {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
    });
    bar.addEventListener('mouseleave', () => {
      bar.style.opacity = isSolap ? '1' : '0.82';
      bar.style.transform = '';
      tooltip.style.opacity = '0';
    });

    barsEl.appendChild(bar);
  });

  // Eje de km (5 marcas)
  axisEl.innerHTML = '';
  for (let i = 0; i <= 4; i++) {
    const val = kmMin + (rango * i / 4);
    const span = document.createElement('span');
    span.textContent = fmt(Math.round(val)) + ' km';
    axisEl.appendChild(span);
  }
}

// ─── SYNC UI ──────────────────────────────────────────────────────────────────
const SYNC_LABELS = {
  ok:      '✓ Sincronizado',
  syncing: '↻ Sincronizando...',
  pending: '● Cambios pendientes',
  offline: 'Sin conexión',
  error:   '✕ Error de sync'
};

const AJUSTES_SYNC_COLORS = { ok: '#10b981', syncing: '#6366f1', pending: '#f59e0b', offline: '#64748b', error: '#ef4444' };

function updateSyncBar(status, reason) {
  const bar   = document.getElementById('sync-bar');
  const label = document.getElementById('sync-label');
  if (bar && label) {
    bar.dataset.status = status;
    label.textContent  = SYNC_LABELS[status] || status;
    // Al pasar el ratón por encima se ve el motivo exacto del error
    bar.title = (status === 'error' && reason) ? 'Motivo: ' + reason : '';
  }

  // Segundo indicador, grande y legible, en Ajustes
  const ajLabel = document.getElementById('ajustes-sync-label');
  const ajDot   = document.getElementById('ajustes-sync-dot');
  if (ajLabel) ajLabel.textContent = SYNC_LABELS[status] || status;
  if (ajDot) ajDot.style.background = AJUSTES_SYNC_COLORS[status] || '#64748b';
}

async function pushAllToCloud() {
  const bar = document.getElementById('push-all-bar');
  if (!confirm('¿Subir TODOS los datos (vehículos, alumnos y prácticas) a Supabase ahora?\n\nHaz esto la primera vez para que la web del móvil tenga acceso a los datos.')) return;
  if (bar) bar.style.color = 'rgba(99,102,241,.7)';
  updateSyncBar('syncing');
  const res = await window.api.syncPushAll();
  if (res && res.ok) {
    updateSyncBar('ok');
    if (bar) { bar.style.color = 'rgba(16,185,129,.6)'; bar.innerHTML = bar.innerHTML.replace('Subir todo a la nube', '✓ Datos subidos'); }
  } else {
    updateSyncBar('error');
    alert('Error al subir: ' + (res?.reason || 'Sin conexión'));
    if (bar) bar.style.color = 'rgba(239,68,68,.6)';
  }
}

async function syncNow() {
  updateSyncBar('syncing');
  const res = await window.api.syncNow();
  if (res && res.ok) {
    updateSyncBar('ok');
    // Si se bajaron prácticas nuevas, recargar vista actual
    if (res.pulled > 0) {
      loadDashboard();
      if (currentAlumnoId) loadPracticas();
    }
  } else {
    updateSyncBar(res && res.reason === 'Sin conexión a internet' ? 'offline' : 'error', res?.reason);
  }
}

// Escuchar cambios de estado desde main.js
window.api.onSyncStatus((status, reason) => {
  updateSyncBar(status, reason);
  // Si llegaron datos nuevos (ok tras sync), refrescar
  if (status === 'ok') {
    loadDashboard();
    if (currentAlumnoId) loadPracticas();
  }
});

// Obtener estado inicial
window.api.getSyncStatus().then(s => updateSyncBar(s || 'offline'));

// Conflictos de sync: dos dispositivos editaron el mismo registro entre syncs.
// La resolución (gana el más reciente) no cambia; esto solo hace visible que
// pasó, y apunta a Historial para ver qué se descartó. Se muestra en el
// indicador del sidebar (visible en cualquier página) y se refuerza en Ajustes;
// visitar Historial lo da por visto.
function mostrarConflictosSync(n) {
  if (!n) return;
  const badge = document.getElementById('sync-conflictos-badge');
  if (badge) {
    badge.textContent = n === 1 ? '1 conflicto' : `${n} conflictos`;
    badge.classList.remove('hidden');
  }
  const ajAlert = document.getElementById('ajustes-sync-conflictos');
  if (ajAlert) {
    ajAlert.textContent = (n === 1
      ? 'Se detectó 1 conflicto de sincronización (dos ediciones a la vez del mismo dato).'
      : `Se detectaron ${n} conflictos de sincronización (dos ediciones a la vez del mismo dato).`)
      + ' Gana la edición más reciente; pulsa aquí para ver el detalle en Historial.';
    ajAlert.classList.remove('hidden');
  }
}

function ocultarConflictosSync() {
  const badge = document.getElementById('sync-conflictos-badge');
  if (badge) badge.classList.add('hidden');
  const ajAlert = document.getElementById('ajustes-sync-conflictos');
  if (ajAlert) ajAlert.classList.add('hidden');
}

window.api.onSyncConflictos((n) => mostrarConflictosSync(n));

// ─── CUENTA DE EMPRESA (antes CREDENCIALES DE SINCRONIZACIÓN) ─────────────────
// getSyncCredsStatus() (fase 1) sigue vigente para el login (abrirCredsSync);
// refrescarEstadoCuenta() es la única fuente de verdad para pintar el estado
// conectado/desconectado en Ajustes, sobre getEstadoCuenta() (fase 2).
async function refrescarEstadoCuenta() {
  const estado = await window.api.getEstadoCuenta();
  const elConectado = document.getElementById('cuenta-empresa-conectado');
  const elDesconectado = document.getElementById('cuenta-empresa-desconectado');
  const elEstado = document.getElementById('cuenta-empresa-estado');
  if (!elEstado || !elConectado || !elDesconectado) return;
  if (estado && estado.conectado) {
    elEstado.textContent = '✓ Conectado como ' + esc(estado.email || '');
    elEstado.style.color = 'var(--success, #10b981)';
    elConectado.classList.remove('hidden');
    elDesconectado.classList.add('hidden');
  } else {
    elEstado.textContent = '';
    elConectado.classList.add('hidden');
    elDesconectado.classList.remove('hidden');
  }
}

async function abrirCredsSync() {
  const res = await window.api.getSyncCredsStatus();
  document.getElementById('sync-creds-email').value = (res && res.email) || '';
  document.getElementById('sync-creds-password').value = '';
  hideToast('sync-creds-alert');
  openModal('modal-sync-creds');
}

async function guardarCredsSync() {
  const email = document.getElementById('sync-creds-email').value.trim();
  const password = document.getElementById('sync-creds-password').value;
  if (!email || !password) {
    showToast('sync-creds-alert', 'Introduce email y contraseña.', 'err');
    return;
  }
  const btn = document.getElementById('sync-creds-guardar');
  btn.disabled = true;
  btn.textContent = 'Probando...';
  const res = await window.api.saveSyncCreds(email, password);
  btn.disabled = false;
  btn.textContent = 'Guardar y probar';
  if (res && res.ok) {
    closeModal('modal-sync-creds');
    closeModal('modal-bienvenida');
    refrescarEstadoCuenta();
    syncNow();
    loadDashboard();
  } else {
    showToast('sync-creds-alert', (res && res.msg) || 'No se pudo conectar con esas credenciales.', 'err');
  }
}

function abrirCrearEmpresa() {
  document.getElementById('crear-empresa-email').value = '';
  document.getElementById('crear-empresa-password').value = '';
  document.getElementById('crear-empresa-password2').value = '';
  hideToast('crear-empresa-alert');
  openModal('modal-crear-empresa');
}

async function crearCuentaEmpresa() {
  const email = document.getElementById('crear-empresa-email').value.trim();
  const password = document.getElementById('crear-empresa-password').value;
  const password2 = document.getElementById('crear-empresa-password2').value;
  if (!email || !password) {
    showToast('crear-empresa-alert', 'Introduce email y contraseña.', 'err');
    return;
  }
  if (password.length < 8) {
    showToast('crear-empresa-alert', 'La contraseña debe tener al menos 8 caracteres.', 'err');
    return;
  }
  if (password !== password2) {
    showToast('crear-empresa-alert', 'Las contraseñas no coinciden.', 'err');
    return;
  }
  const btn = document.getElementById('crear-empresa-btn');
  btn.disabled = true;
  btn.textContent = 'Creando...';
  const res = await window.api.registrarEmpresa(email, password);
  btn.disabled = false;
  btn.textContent = 'Crear cuenta';
  if (res && res.ok && res.estado === 'activa') {
    closeModal('modal-crear-empresa');
    closeModal('modal-bienvenida');
    refrescarEstadoCuenta();
    syncNow();
    loadDashboard();
    showToast('cuenta-empresa-toast', '✓ Cuenta de empresa creada y conectada.', 'ok');
  } else if (res && res.ok && res.estado === 'pendiente_confirmacion') {
    const el = document.getElementById('crear-empresa-alert');
    el.className = 'alert alert-ok';
    el.textContent = (res.msg || 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.') + ' Cuando la confirmes, usa "Iniciar sesión".';
    el.classList.remove('hidden');
  } else {
    showToast('crear-empresa-alert', (res && res.msg) || 'No se pudo crear la cuenta.', 'err');
  }
}

async function cerrarSesionEmpresa() {
  if (!confirm('¿Cerrar sesión de la cuenta de empresa? La app seguirá funcionando en modo local hasta que vuelvas a iniciar sesión.')) return;
  await window.api.clearSyncCreds();
  refrescarEstadoCuenta();
}

refrescarEstadoCuenta();

// ─── AJUSTES ──────────────────────────────────────────────────────────────────
async function loadAjustes() {
  aplicarRangoPref('pref-km-min', 'pref-km-max');
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

// ─── TOASTS (mensajes no bloqueantes) ─────────────────────────────────────────
let toastTimers = {};

function showToast(elementId, msg, type = 'err') {
  const el = document.getElementById(elementId);
  if (!el) return;
  clearTimeout(toastTimers[elementId]);
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  toastTimers[elementId] = setTimeout(() => hideToast(elementId), 4000);
}

function hideToast(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  clearTimeout(toastTimers[elementId]);
  el.classList.add('hidden');
}

// ─── REGISTRO RÁPIDO ──────────────────────────────────────────────────────────
let rrVehiculoActual = null;
let rrFechaActual = null;
// Recuerda la última selección de profesor mientras la app está abierta
// (no se persiste en disco: al reabrir la app vuelve a "Sin profesor").
let rrProfesorActual = null;
// Recuerda el último tipo de práctica seleccionado mientras la app está abierta
// (no se persiste en disco: al reabrir la app vuelve a "Circulación").
let rrTipoActual = 'circulacion';

async function loadRegistroRapidoInit() {
  // Cargar vehículos en el selector
  const vehiculos = await window.api.getVehiculos();
  const sel = document.getElementById('rr-vehiculo');
  sel.innerHTML = vehiculos.length
    ? vehiculos.map(v => `<option value="${v.id}">${esc(v.nombre)}${v.matricula ? ' (' + esc(v.matricula) + ')' : ''}</option>`).join('')
    : '<option value="">— No hay vehículos —</option>';

  // Cargar profesores en el selector, conservando la última selección de la sesión
  await llenarSelectProfesores('rr-profesor', rrProfesorActual);

  // Fecha de hoy por defecto
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('rr-fecha').value = hoy;
  
  // Limpiar estado previo
  document.getElementById('rr-alumnos-wrap').style.display = 'none';
  document.getElementById('rr-empty').style.display = 'none';
  document.getElementById('rr-alert').classList.add('hidden');
  
  // Cargar automáticamente si hay vehículo seleccionado
  if (vehiculos.length) {
    loadRegistroRapido();
  }
}

async function loadRegistroRapido() {
  const vid = document.getElementById('rr-vehiculo').value;
  const fecha = document.getElementById('rr-fecha').value;
  
  if (!vid) {
    showRRAlert('Selecciona un vehículo.', 'warn');
    return;
  }
  if (!fecha) {
    showRRAlert('Selecciona una fecha.', 'warn');
    return;
  }
  
  hideRRAlert();
  rrVehiculoActual = parseInt(vid);
  rrFechaActual = fecha;
  
  const alumnos = await window.api.getAlumnosPorVehiculo(vid, fecha);
  
  if (!alumnos.length) {
    document.getElementById('rr-alumnos-wrap').style.display = 'none';
    document.getElementById('rr-empty').style.display = 'block';
    return;
  }
  
  document.getElementById('rr-empty').style.display = 'none';
  document.getElementById('rr-alumnos-wrap').style.display = 'block';
  
  renderRRAlumnos(alumnos);
  updateRRContador(alumnos);
}

function renderRRAlumnos(alumnos) {
  const lista = document.getElementById('rr-lista');
  lista.innerHTML = alumnos.map(a => `
    <div class="rr-item${a.num_practicas > 0 ? ' has-practicas' : ''}" data-id="${a.id}" onclick="ajustarRR(${a.id}, 1)" oncontextmenu="descontarRR(event, ${a.id})">
      <div class="rr-item-info">
        <div class="rr-item-name">${esc(a.nombre)}</div>
        <div class="rr-item-permiso">Permiso ${a.permiso}</div>
      </div>
      <div class="rr-counter" onclick="event.stopPropagation()" oncontextmenu="event.stopPropagation()">
        <button class="rr-nota-btn${a.nota ? ' has-nota' : ''}" onclick="abrirNotaRR(${a.id})" data-nota="${esc(a.nota || '')}" title="${a.nota ? esc(a.nota) : 'Añadir nota'}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
        <button class="rr-counter-btn minus" onclick="ajustarRR(${a.id}, -1)">−</button>
        <span class="rr-counter-num" data-count="${a.id}">${a.num_practicas}</span>
        <button class="rr-counter-btn plus" onclick="ajustarRR(${a.id}, 1)">+</button>
      </div>
    </div>
  `).join('');
}

let _notaAlumnoId = null;

async function abrirNotaRR(alumnoId) {
  _notaAlumnoId = alumnoId;
  const btn = document.querySelector(`.rr-item[data-id="${alumnoId}"] .rr-nota-btn`);
  const notaActual = btn ? (btn.dataset.nota || '') : '';
  const nombre = document.querySelector(`.rr-item[data-id="${alumnoId}"] .rr-item-name`);
  
  document.getElementById('modal-nota-titulo').textContent = nombre ? nombre.textContent : 'Nota';
  document.getElementById('modal-nota-texto').value = notaActual;
  document.getElementById('modal-nota-rr').classList.add('open');
  document.getElementById('modal-nota-texto').focus();
}

function cerrarNotaRR() {
  document.getElementById('modal-nota-rr').classList.remove('open');
  _notaAlumnoId = null;
}

async function guardarNotaRR() {
  if (_notaAlumnoId === null) return;
  const nota = document.getElementById('modal-nota-texto').value.trim();
  
  const res = await window.api.guardarNotaAlumno(rrVehiculoActual, rrFechaActual, _notaAlumnoId, nota, rrProfesorActual, rrTipoActual);
  
  // Si se creó una práctica nueva, refrescar la lista completa
  if (res && res.created) {
    cerrarNotaRR();
    loadRegistroRapido();
    return;
  }
  
  // Actualizar botón
  const btn = document.querySelector(`.rr-item[data-id="${_notaAlumnoId}"] .rr-nota-btn`);
  if (btn) {
    btn.dataset.nota = nota;
    if (nota) {
      btn.classList.add('has-nota');
      btn.title = nota;
    } else {
      btn.classList.remove('has-nota');
      btn.title = 'Añadir nota';
    }
  }
  cerrarNotaRR();
}

async function ajustarRR(alumnoId, delta) {
  if (!rrVehiculoActual || !rrFechaActual) return;
  
  const res = await window.api.ajustarPracticasAlumno(rrVehiculoActual, rrFechaActual, alumnoId, delta, rrProfesorActual, rrTipoActual);
  
  // Actualizar UI
  const numEl = document.querySelector(`.rr-counter-num[data-count="${alumnoId}"]`);
  const item = document.querySelector(`.rr-item[data-id="${alumnoId}"]`);
  if (numEl) numEl.textContent = res.num_practicas;
  if (item) {
    if (res.num_practicas > 0) {
      item.classList.add('has-practicas');
    } else {
      item.classList.remove('has-practicas');
    }
  }
  
  // Actualizar contador global
  const alumnos = await window.api.getAlumnosPorVehiculo(rrVehiculoActual, rrFechaActual);
  updateRRContador(alumnos);
}

// Click derecho sobre la tarjeta de un alumno: descuenta (borra) la práctica
// más reciente de ese alumno en la fecha seleccionada del Registro Rápido.
async function descontarRR(event, alumnoId) {
  event.preventDefault();
  if (!rrVehiculoActual || !rrFechaActual) return;

  const practicas = await window.api.getPracticas(alumnoId);
  const delDia = practicas.filter(p => p.vehiculo_id === rrVehiculoActual && p.fecha === rrFechaActual);

  if (!delDia.length) {
    showToast('rr-alert', 'Este alumno no tiene prácticas registradas en esa fecha.', 'warn');
    return;
  }

  // getPracticas devuelve ordenado por fecha/id ascendente: la última es la más reciente.
  const masReciente = delDia[delDia.length - 1];
  await window.api.deletePractica(masReciente.id);

  // Refrescar contador/estado visual de la tarjeta igual que hace el click izquierdo
  const nuevoCount = delDia.length - 1;
  const numEl = document.querySelector(`.rr-counter-num[data-count="${alumnoId}"]`);
  const item = document.querySelector(`.rr-item[data-id="${alumnoId}"]`);
  if (numEl) numEl.textContent = nuevoCount;
  if (item) {
    if (nuevoCount > 0) item.classList.add('has-practicas');
    else item.classList.remove('has-practicas');
  }

  const alumnos = await window.api.getAlumnosPorVehiculo(rrVehiculoActual, rrFechaActual);
  updateRRContador(alumnos);
}

function updateRRContador(alumnos) {
  const total = alumnos.length;
  const conPracticas = alumnos.filter(a => a.num_practicas > 0).length;
  const totalPracticas = alumnos.reduce((sum, a) => sum + a.num_practicas, 0);
  const cont = document.getElementById('rr-contador');
  if (cont) {
    cont.innerHTML = `<strong>${totalPracticas}</strong> práctica(s) · ${conPracticas} de ${total} alumnos`;
    cont.style.color = totalPracticas > 0 ? '#15803d' : 'var(--text-muted)';
  }
}

function showRRAlert(msg, type = 'err') {
  const el = document.getElementById('rr-alert');
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideRRAlert() {
  document.getElementById('rr-alert').classList.add('hidden');
}

function cambiarFechaRR(delta) {
  const input = document.getElementById('rr-fecha');
  if (!input.value) return;
  input.value = sumarDiasFecha(input.value, delta);
  loadRegistroRapido();
}

// Botones laterales del ratón (atrás/adelante) cambian la fecha del Registro
// Rápido cuando esa página está activa. button 3 = lateral "atrás" (día -1),
// button 4 = lateral "adelante" (día +1). preventDefault() evita que Electron
// interprete el evento como navegación de historial (ver también 'app-command'
// en main.js, que bloquea la navegación a nivel de ventana).
document.addEventListener('mouseup', (e) => {
  if (e.button !== 3 && e.button !== 4) return;
  const pageRR = document.getElementById('page-registro-rapido');
  if (!pageRR || !pageRR.classList.contains('active')) return;
  e.preventDefault();
  cambiarFechaRR(e.button === 3 ? -1 : 1);
});

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
document.getElementById('relleno-vehiculo')?.addEventListener('change', actualizarContadorSinKm);
document.getElementById('rr-vehiculo')?.addEventListener('change', loadRegistroRapido);
document.getElementById('rr-profesor')?.addEventListener('change', (e) => { rrProfesorActual = e.target.value || null; });
document.getElementById('rr-tipo')?.addEventListener('change', (e) => { rrTipoActual = e.target.value || 'circulacion'; });
loadDashboard();
comprobarBienvenida();
window.api.getVersion().then(v => {
  const el = document.getElementById('app-version');
  if (el) el.textContent = 'v' + v;
});
