// ─── ESTADO ──────────────────────────────────────────────────────────────────
let currentAlumnoId = null;
let currentAlumnoVehiculoId = null;
let selectedCsvPath = null;
let vehiculosCache = [];

// ─── NAVEGACIÓN ──────────────────────────────────────────────────────────────
document.querySelectorAll('#sidebar nav a').forEach(link => {
  link.addEventListener('click', () => {
    const page = link.dataset.page;
    document.querySelectorAll('#sidebar nav a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    if (page === 'dashboard') loadDashboard();
    if (page === 'vehiculos') loadVehiculos();
    if (page === 'alumnos') { loadVehiculosSelect(); loadAlumnos(); }
    if (page === 'solapamientos') loadSolapamientos();
    if (page === 'timeline') loadTimelineSelect();
    if (page === 'logs') loadLogs();
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
      `⚡ <strong>${r.sinKm} práctica(s) sin kilómetros.</strong> Ve a <u>Vehículos → Relleno masivo</u> para generarlos automáticamente.</div>`
    );
  }
  if (r.solapamientos > 0) {
    partes.push(
      `<div class="alert alert-err" style="margin-bottom:8px;cursor:pointer" onclick="navegarA('solapamientos')" title="Ir a Solapamientos">` +
      `⚠️ <strong>${r.solapamientos} solapamiento(s) detectado(s).</strong> Ve a <u>Solapamientos</u> para corregirlos.</div>`
    );
  }
  if (partes.length === 0 && r.practicas > 0) {
    partes.push(
      `<div class="alert alert-ok" style="margin-bottom:8px">✅ Todo en orden. No hay prácticas sin km ni solapamientos.</div>`
    );
  }
  alertas.innerHTML = partes.join('');
}

function navegarA(page) {
  const link = document.querySelector(`#sidebar nav a[data-page="${page}"]`);
  if (link) link.click();
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
      ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700">⚠ ${sinKm}</span>`
      : `<span style="color:#bbb">—</span>`;
    return `<tr>
      <td><strong>${esc(v.nombre)}</strong></td>
      <td>${esc(v.matricula) || '<span style="color:#bbb">—</span>'}</td>
      <td><span class="km-badge">${fmt(v.km_actual)} km</span></td>
      <td>${sinKmBadge}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="openEditVehiculo(${v.id},'${esc(v.nombre)}',${v.km_actual})">✏ Editar km</button>
        <button class="btn btn-danger btn-sm" onclick="deleteVehiculo(${v.id},'${esc(v.nombre)}')">🗑 Borrar</button>
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
  info.textContent = n > 0 ? `${n} práctica(s) sin km` : '✅ Todo relleno';
  info.style.color = n > 0 ? '#d97706' : '#15803d';
}

async function rellenarMasivo() {
  const sel = document.getElementById('relleno-vehiculo');
  const vid = parseInt(sel.value);
  if (!vid) { alert('Selecciona un vehículo.'); return; }
  const min = parseFloat(document.getElementById('relleno-min').value) || 40;
  const max = parseFloat(document.getElementById('relleno-max').value) || 45;
  if (max <= min) { alert('El máximo debe ser mayor que el mínimo.'); return; }

  const n = await window.api.getPracticasSinKm(vid);
  if (n === 0) {
    const el = document.getElementById('relleno-alert');
    el.className = 'alert alert-info'; el.textContent = 'Este vehículo no tiene prácticas con km en blanco.'; el.classList.remove('hidden');
    return;
  }

  if (!confirm(`Se van a generar km para ${n} práctica(s) con km en blanco del vehículo seleccionado.\n\nLos km se calcularán de forma coherente con el odómetro del coche.\n\n¿Continuar?`)) return;

  const result = await window.api.rellenarKmMasivo(vid, min, max);
  const el = document.getElementById('relleno-alert');
  el.className = 'alert alert-ok';
  el.innerHTML = `✅ ${result.rellenadas} práctica(s) rellenadas correctamente. &nbsp;
    <button class="btn btn-warn btn-sm" style="margin-left:8px" onclick="navegarA('solapamientos')">
      🔍 Verificar solapamientos ahora
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

function openEditVehiculo(id, nombre, km) {
  document.getElementById('edit-v-id').value = id;
  document.getElementById('edit-v-nombre').value = nombre;
  document.getElementById('edit-v-km').value = km;
  openModal('modal-vehiculo');
}

async function saveVehiculoKm() {
  const id = parseInt(document.getElementById('edit-v-id').value);
  const km = parseFloat(document.getElementById('edit-v-km').value);
  if (isNaN(km)) { alert('Introduce un km válido.'); return; }
  await window.api.updateVehiculoKm(id, km);
  closeModal('modal-vehiculo');
  loadVehiculos();
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
  const tbody = document.querySelector('#tabla-alumnos tbody');
  if (!alumnos.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No hay alumnos registrados</td></tr>';
    return;
  }
  // Para cada alumno contar prácticas
  const rows = await Promise.all(alumnos.map(async a => {
    const practicas = await window.api.getPracticas(a.id);
    const tag = tagPermiso(a.permiso);
    return `<tr>
      <td><strong>${esc(a.nombre)}</strong></td>
      <td>${tag}</td>
      <td>${a.vehiculo_nombre ? esc(a.vehiculo_nombre) : '<span style="color:#bbb">Sin asignar</span>'}</td>
      <td><span style="font-weight:700">${practicas.length}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="verPracticas(${a.id},${a.vehiculo_id || 'null'},'${esc(a.nombre)}')">📋 Prácticas</button>
        <button class="btn btn-warn btn-sm" onclick="openEditAlumno(${a.id},'${esc(a.nombre)}','${a.permiso}',${a.vehiculo_id || 'null'})">✏ Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAlumno(${a.id},'${esc(a.nombre)}')">🗑 Borrar</button>
      </td>
    </tr>`;
  }));
  tbody.innerHTML = rows.join('');
}

async function addAlumno() {
  const nombre = document.getElementById('a-nombre').value.trim();
  const permiso = document.getElementById('a-permiso').value;
  const vid = document.getElementById('a-vehiculo').value || null;
  if (!nombre) { alert('Introduce el nombre del alumno.'); return; }
  await window.api.addAlumno(nombre, permiso, vid ? parseInt(vid) : null);
  document.getElementById('a-nombre').value = '';
  loadAlumnos();
}

async function deleteAlumno(id, nombre) {
  if (!confirm(`¿Borrar al alumno "${nombre}" y todas sus prácticas?`)) return;
  await window.api.deleteAlumno(id);
  loadAlumnos();
}

function openEditAlumno(id, nombre, permiso, vehiculo_id) {
  document.getElementById('edit-a-id').value = id;
  document.getElementById('edit-a-nombre').value = nombre;
  document.getElementById('edit-a-permiso').value = permiso;
  document.getElementById('edit-a-vehiculo').value = vehiculo_id || '';
  openModal('modal-alumno');
}

async function saveAlumno() {
  const id = parseInt(document.getElementById('edit-a-id').value);
  const nombre = document.getElementById('edit-a-nombre').value.trim();
  const permiso = document.getElementById('edit-a-permiso').value;
  const vid = document.getElementById('edit-a-vehiculo').value || null;
  if (!nombre) { alert('Introduce un nombre.'); return; }
  await window.api.updateAlumno(id, nombre, permiso, vid ? parseInt(vid) : null);
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
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay prácticas registradas para este alumno</td></tr>';
    return;
  }
  tbody.innerHTML = practicas.map((p, i) => {
    const sinKm = p.km_inicial === 0 && p.km_final === 0;
    const diff = Math.round((p.km_final - p.km_inicial) * 10) / 10;
    const kmICell = sinKm ? '<span style="color:#d97706;font-style:italic">Sin km</span>' : fmt(p.km_inicial);
    const kmFCell = sinKm ? '<span style="color:#d97706;font-style:italic">Sin km</span>' : fmt(p.km_final);
    const diffCell = sinKm ? '<span style="color:#d97706;font-style:italic">—</span>' : `<span class="km-badge">+${diff} km</span>`;
    return `<tr${sinKm ? ' style="background:#fffbeb"' : ''}>
      <td>${i + 1}</td>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${kmICell}</td>
      <td>${kmFCell}</td>
      <td>${diffCell}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="openEditPractica(${p.id},'${p.fecha}',${p.km_inicial},${p.km_final})">✏</button>
        <button class="btn btn-danger btn-sm" onclick="deletePractica(${p.id})">🗑</button>
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
  preview.textContent = `⚡ Generado: ${fmt(result.km_inicial)} → ${fmt(result.km_final)}  (+${result.diff} km)`;
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

  await window.api.addPractica(currentAlumnoId, vid, fecha, ki, kf);
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

function openEditPractica(id, fecha, ki, kf) {
  document.getElementById('edit-p-id').value = id;
  document.getElementById('edit-p-fecha').value = fecha;
  document.getElementById('edit-p-ki').value = ki;
  document.getElementById('edit-p-kf').value = kf;
  openModal('modal-practica');
}

async function savePractica() {
  const id = parseInt(document.getElementById('edit-p-id').value);
  const fecha = document.getElementById('edit-p-fecha').value;
  const ki = parseFloat(document.getElementById('edit-p-ki').value);
  const kf = parseFloat(document.getElementById('edit-p-kf').value);
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
        `⚠️ Estos km se solapan con ${conflictos.length} práctica(s) del mismo vehículo:\n\n${detalle}\n\n¿Guardar igualmente?`
      );
      if (!continuar) return;
    }
  }

  await window.api.updatePractica(id, fecha, ki, kf);
  closeModal('modal-practica');
  // Si venimos de solapamientos, recargar esa vista; si no, las prácticas del alumno
  const solapPage = document.getElementById('page-solapamientos');
  if (solapPage && solapPage.classList.contains('active')) {
    loadSolapamientos();
  } else {
    loadPracticas();
  }
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
    showImportAlert('❌ Error: ' + result.msg, 'err');
    return;
  }
  let msg = `✅ Importación completada: ${result.insertados} prácticas insertadas.`;
  if (result.errores > 0) {
    msg += `\n\n⚠️ ${result.errores} filas con error:\n`;
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

// ─── SOLAPAMIENTOS ───────────────────────────────────────────────────────────
async function loadSolapamientos() {
  const conflictos = await window.api.getSolapamientos();
  const el = document.getElementById('solap-result');
  const btnCorregir = document.getElementById('btn-corregir-todo');

  if (!conflictos.length) {
    el.innerHTML = '<div class="card"><p class="empty" style="color:#15803d;font-weight:600">✅ No se detectaron solapamientos de kilómetros.</p></div>';
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
  let html = `<div class="alert alert-err" style="margin-bottom:16px">⚠️ Se encontraron <strong>${conflictos.length}</strong> solapamiento(s) en <strong>${vehiculosAfectados}</strong> vehículo(s). Pulsa <strong>🔧 Corregir todo automáticamente</strong> para que el programa reordene todos los km.</div>`;

  for (const [vehiculo, lista] of Object.entries(porVehiculo)) {
    html += `<div class="card" style="padding:0 0 1px;margin-bottom:16px">
      <div style="padding:12px 16px;background:#fef3c7;border-radius:10px 10px 0 0;font-weight:700;font-size:13px;color:#92400e">
        🚙 ${esc(vehiculo)} — ${lista.length} conflicto(s)
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
        <td style="color:#dc2626;font-weight:700;text-align:center">⚡</td>
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
    el.innerHTML = `<div class="alert alert-ok">✅ Corrección completada. ${totalCorregidas} práctica(s) reordenadas. No quedan solapamientos.</div>`;
  } else {
    el.innerHTML = `<div class="alert alert-err">⚠️ Se corrigieron ${totalCorregidas} prácticas pero aún quedan ${restantes.length} solapamientos. Pulsa Analizar para revisar.</div>`;
  }
}

// ─── LOGS ────────────────────────────────────────────────────────────────────
const LOG_ICONS = { importacion: '📥', relleno: '⚡', correccion: '🔧' };
const LOG_COLORS = { importacion: '#1d4ed8', relleno: '#15803d', correccion: '#92400e' };
const LOG_BG = { importacion: '#eff6ff', relleno: '#f0fdf4', correccion: '#fef3c7' };

async function loadLogs() {
  const logs = await window.api.getLogs();
  const el = document.getElementById('logs-result');
  if (!logs.length) {
    el.innerHTML = '<div class="card"><p class="empty">No hay operaciones registradas todavía.</p></div>';
    return;
  }
  el.innerHTML = logs.map(log => {
    const ico = LOG_ICONS[log.tipo] || '📋';
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
    el.innerHTML = `✅ Copia guardada en: <strong>${esc(result.file)}</strong>`;
    el.className = 'alert alert-ok';
  } else {
    el.innerHTML = `❌ ${esc(result.msg)}`;
    el.className = 'alert alert-err';
  }
  el.classList.remove('hidden');
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
  alert('✅ Backup restaurado correctamente. La aplicación se recargará ahora.');
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
    let estadoCell = '<span style="color:#15803d;font-size:12px">✅ OK</span>';

    if (p.sin_km) {
      rowStyle = ' style="background:#fffbeb"';
      estadoCell = '<span style="color:#d97706;font-size:12px;font-weight:600">⏳ Sin km</span>';
    } else if (p.gap !== null && p.gap < 0) {
      rowStyle = ' style="background:#fef2f2"';
      estadoCell = `<span style="color:#dc2626;font-size:12px;font-weight:600">⚡ Solapa ${fmt(p.gap)} km</span>`;
    } else if (p.gap !== null && p.gap > 0) {
      rowStyle = ' style="background:#fffbeb"';
      estadoCell = `<span style="color:#d97706;font-size:12px;font-weight:600">🔶 Hueco +${fmt(p.gap)} km</span>`;
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
    const tooltipText = `${p.alumno_nombre}\n📅 ${fmtFecha(p.fecha)}\n📍 ${fmt(p.km_inicial)} → ${fmt(p.km_final)}\n🛣 +${diff} km${isSolap ? '\n⚡ SOLAPA ' + fmt(p.gap) + ' km' : ''}${isHueco ? '\n🔶 Hueco +' + fmt(p.gap) + ' km' : ''}`;

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

function updateSyncBar(status) {
  const bar   = document.getElementById('sync-bar');
  const label = document.getElementById('sync-label');
  if (!bar || !label) return;
  bar.dataset.status = status;
  label.textContent  = SYNC_LABELS[status] || status;
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
    updateSyncBar(res && res.reason === 'Sin conexión a internet' ? 'offline' : 'error');
  }
}

// Escuchar cambios de estado desde main.js
window.api.onSyncStatus((status) => {
  updateSyncBar(status);
  // Si llegaron datos nuevos (ok tras sync), refrescar
  if (status === 'ok') {
    loadDashboard();
    if (currentAlumnoId) loadPracticas();
  }
});

// Obtener estado inicial
window.api.getSyncStatus().then(s => updateSyncBar(s || 'offline'));

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
  label.textContent = '✅ Ya tienes la última versión';
  bar.style.color = 'rgba(16,185,129,.7)';
  setTimeout(() => {
    label.textContent = 'Buscar actualizaciones';
    bar.style.color = '';
    bar.style.pointerEvents = '';
  }, 3000);
});

window.api.onUpdateAvailable((version) => {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.textContent = `⬇ Descargando v${version}...`;
  bar.style.color = 'rgba(99,102,241,.8)';
});

window.api.onUpdateDownloadProgress((pct) => {
  const label = document.getElementById('update-label');
  label.textContent = `⬇ Descargando... ${pct}%`;
});

window.api.onUpdateError((msg) => {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.textContent = '❌ Error al actualizar';
  bar.style.color = 'rgba(239,68,68,.7)';
  bar.style.pointerEvents = '';
  setTimeout(() => {
    label.textContent = 'Buscar actualizaciones';
    bar.style.color = '';
  }, 4000);
});

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.getElementById('relleno-vehiculo')?.addEventListener('change', actualizarContadorSinKm);
loadDashboard();
