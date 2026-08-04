// ─── RESERVAS (AGENDA) ─────────────────────────────────────────────────────
// UI de la agenda de reservas (modelo v1 "solicitudes de práctica" del Bloque 2
// SaaS): lista filtrable por estado, alta/edición con un único modal y cambios
// de estado (confirmar/cancelar/marcar realizada) por botones en cada fila.
// Todo pasa por los IPC ya existentes (window.api.get/add/update/setEstado/
// deleteReserva) — la capa de datos y la sincronización ya están hechas.

// ─── RESERVAS ────────────────────────────────────────────────────────────────
async function loadReservas() {
  reservasCache = await window.api.getReservas(getSucursalActual());
  renderReservasLista();
}

function llenarSelectAlumnosReserva(selectedId) {
  const sel = document.getElementById('res-alumno');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecciona un alumno —</option>' +
    alumnosCache.map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('');
  sel.value = (selectedId !== undefined && selectedId !== null) ? String(selectedId) : '';
}

function llenarSelectVehiculosReserva(selectedId) {
  const sel = document.getElementById('res-vehiculo');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin asignar —</option>' +
    vehiculosCache.map(v => `<option value="${v.id}">${esc(v.nombre)}</option>`).join('');
  sel.value = (selectedId !== undefined && selectedId !== null) ? String(selectedId) : '';
}

// Pastilla de color por estado: solicitada=ámbar (espera acción), confirmada=verde,
// realizada=azul/gris (ya pasó), cancelada=rojo. Mismo patrón que tagPermiso/badges.
const RESERVA_ESTADO_LABEL = { solicitada: 'Solicitada', confirmada: 'Confirmada', realizada: 'Realizada', cancelada: 'Cancelada' };

function tagEstadoReserva(estado) {
  const cls = `badge-reserva-${estado}`;
  const label = RESERVA_ESTADO_LABEL[estado] || estado;
  return `<span class="${cls}">${esc(label)}</span>`;
}

function renderReservasLista() {
  const tbody = document.querySelector('#tabla-reservas tbody');
  if (!tbody) return;
  const filtro = document.getElementById('f-reservas-estado')?.value || '';
  const filtradas = filtro ? reservasCache.filter(r => r.estado === filtro) : reservasCache;

  if (!reservasCache.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay reservas registradas</td></tr>';
    return;
  }
  if (!filtradas.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Ninguna reserva coincide con el filtro</td></tr>';
    return;
  }

  tbody.innerHTML = filtradas.map(r => {
    const fechaHora = `${fmtFecha(r.fecha)}${r.hora_inicio ? ' · ' + r.hora_inicio : ''}`;
    const filaClase = r.estado === 'solicitada' ? ' style="background:var(--warn-light)"' : '';
    let acciones = '';
    if (r.estado === 'solicitada') {
      acciones += `<button class="btn btn-sm" style="background:var(--success-light);color:var(--success-fg)" onclick="confirmarReserva(${r.id})">Confirmar</button>
        <button class="btn btn-sm" style="background:var(--danger-light);color:var(--danger-fg)" onclick="cancelarReserva(${r.id})">Cancelar</button>`;
    } else if (r.estado === 'confirmada') {
      acciones += `<button class="btn btn-sm" style="background:var(--info-bg);color:var(--info-fg)" onclick="marcarRealizadaReserva(${r.id})">Marcar realizada</button>
        <button class="btn btn-sm" style="background:var(--danger-light);color:var(--danger-fg)" onclick="cancelarReserva(${r.id})">Cancelar</button>`;
    }
    acciones += `<button class="btn btn-warn btn-sm" onclick="abrirEditarReserva(${r.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Editar</button>
      <button class="btn btn-danger btn-sm" onclick="borrarReserva(${r.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> Borrar</button>`;

    return `<tr${filaClase}>
      <td>${esc(fechaHora)}</td>
      <td>${r.alumno_nombre ? esc(r.alumno_nombre) : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${r.profesor_nombre ? esc(r.profesor_nombre) : '<span style="color:var(--placeholder)">Sin asignar</span>'}</td>
      <td>${r.vehiculo_nombre ? esc(r.vehiculo_nombre) : '<span style="color:var(--placeholder)">Sin asignar</span>'}</td>
      <td>${r.duracion_min ? r.duracion_min + ' min' : ''}</td>
      <td>${tagEstadoReserva(r.estado)}</td>
      <td>${acciones}</td>
    </tr>`;
  }).join('');
}

async function abrirNuevaReserva() {
  document.getElementById('modal-reserva-titulo').textContent = 'Nueva reserva';
  document.getElementById('res-id').value = '';
  document.getElementById('res-fecha').value = '';
  document.getElementById('res-hora').value = '';
  document.getElementById('res-duracion').value = 45;
  document.getElementById('res-nota').value = '';
  alumnosCache = await window.api.getAlumnos(getSucursalActual());
  vehiculosCache = await window.api.getVehiculos(getSucursalActual());
  llenarSelectAlumnosReserva(null);
  llenarSelectVehiculosReserva(null);
  await llenarSelectProfesores('res-profesor', null);
  hideToast('reserva-alert');
  openModal('modal-reserva');
}

async function abrirEditarReserva(id) {
  const r = reservasCache.find(x => x.id === id);
  if (!r) return;
  document.getElementById('modal-reserva-titulo').textContent = 'Editar reserva';
  document.getElementById('res-id').value = r.id;
  document.getElementById('res-fecha').value = r.fecha || '';
  document.getElementById('res-hora').value = r.hora_inicio || '';
  document.getElementById('res-duracion').value = r.duracion_min || 45;
  document.getElementById('res-nota').value = r.nota || '';
  alumnosCache = await window.api.getAlumnos(getSucursalActual());
  vehiculosCache = await window.api.getVehiculos(getSucursalActual());
  llenarSelectAlumnosReserva(r.alumno_id);
  llenarSelectVehiculosReserva(r.vehiculo_id);
  await llenarSelectProfesores('res-profesor', r.profesor_id);
  hideToast('reserva-alert');
  openModal('modal-reserva');
}

async function guardarReserva() {
  const id = document.getElementById('res-id').value;
  const alumno_id = document.getElementById('res-alumno').value || null;
  const profesor_id = document.getElementById('res-profesor').value || null;
  const vehiculo_id = document.getElementById('res-vehiculo').value || null;
  const fecha = document.getElementById('res-fecha').value;
  const hora_inicio = document.getElementById('res-hora').value || null;
  const duracion_min = parseInt(document.getElementById('res-duracion').value) || 45;
  const nota = document.getElementById('res-nota').value.trim();

  if (!alumno_id || !fecha) {
    showToast('reserva-alert', 'Selecciona un alumno e introduce la fecha.', 'err');
    return;
  }

  if (id) {
    await window.api.updateReserva(parseInt(id), { alumno_id, profesor_id, vehiculo_id, fecha, hora_inicio, duracion_min, nota });
  } else {
    // Reserva creada directamente desde la app: la autoescuela ya la está
    // concertando ella misma, así que arranca 'confirmada' (no 'solicitada',
    // que es el estado de las peticiones que llegan desde fuera, p. ej. la
    // futura web del alumno). origen='desktop' identifica su procedencia.
    await window.api.addReserva({ alumno_id, profesor_id, vehiculo_id, fecha, hora_inicio, duracion_min, estado: 'confirmada', origen: 'desktop', nota, sucursal_id: getSucursalActual() });
  }
  closeModal('modal-reserva');
  loadReservas();
}

async function confirmarReserva(id) {
  await window.api.setEstadoReserva(id, 'confirmada');
  loadReservas();
}

async function cancelarReserva(id) {
  if (!confirm('¿Cancelar esta reserva?')) return;
  await window.api.setEstadoReserva(id, 'cancelada');
  loadReservas();
}

async function marcarRealizadaReserva(id) {
  await window.api.setEstadoReserva(id, 'realizada');
  loadReservas();
}

async function borrarReserva(id) {
  if (!confirm('¿Borrar esta reserva?')) return;
  await window.api.deleteReserva(id);
  loadReservas();
}
