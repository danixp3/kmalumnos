// ─── REGISTRO RÁPIDO ─────────────────────────────────────────────────────────
// Registro de prácticas de todos los alumnos de un vehículo en una fecha, con
// notas por alumno y navegación de fecha con botones laterales del ratón.

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
    cont.style.color = totalPracticas > 0 ? 'var(--success-fg)' : 'var(--text-muted)';
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

