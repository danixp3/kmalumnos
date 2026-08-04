// ─── ALUMNOS ─────────────────────────────────────────────────────────────────
// Listado, filtros, ordenación, CRUD y anotaciones de alumnos.

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
  const alumnos = await window.api.getAlumnos(getSucursalActual());
  // Para cada alumno contar prácticas (una sola vez; el resto de filtrado/orden es en memoria)
  alumnosCache = await Promise.all(alumnos.map(async a => {
    const practicas = await window.api.getPracticas(a.id);
    return { ...a, num_practicas: practicas.length };
  }));
  // Semáforo de examen: una sola llamada para todos los alumnos (evita N+1),
  // cruzado por alumno_id en un Map para pintar la pastilla de cada fila.
  try {
    const semaforo = await window.api.getSemaforoExamen();
    semaforoCache = new Map(semaforo.map(s => [s.alumno_id, s]));
  } catch (e) {
    semaforoCache = new Map();
  }
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
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay alumnos registrados</td></tr>';
    return;
  }
  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Ningún alumno coincide con los filtros</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(a => {
    const tag = tagPermiso(a.permiso);
    const sem = semaforoCache.get(a.id);
    const semTexto = { verde: 'Listo', ambar: 'Casi', rojo: 'Lejos' };
    const pillSemaforo = sem
      ? `<span class="semaforo-pill semaforo-${sem.nivel}" title="${esc(sem.motivo)}">${semTexto[sem.nivel] || sem.nivel}</span>`
      : '<span style="color:var(--placeholder)">—</span>';
    return `<tr>
      <td><strong>${esc(a.nombre)}</strong></td>
      <td>${tag}</td>
      <td>${a.vehiculo_nombre ? esc(a.vehiculo_nombre) : '<span style="color:var(--placeholder)">Sin asignar</span>'}</td>
      <td>${a.profesor_nombre ? esc(a.profesor_nombre) : '<span style="color:var(--placeholder)">Sin asignar</span>'}</td>
      <td><span style="font-weight:700">${a.num_practicas}</span></td>
      <td>${pillSemaforo}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="verPracticas(${a.id},${a.vehiculo_id || 'null'},'${esc(a.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> Prácticas</button>
        <button class="btn btn-sm" style="background:var(--warn-bg);color:var(--warn-fg);border:1px solid var(--warn-border)" onclick="verAnotaciones(${a.id},'${esc(a.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Anotaciones</button>
        <button class="btn btn-warn btn-sm" onclick="openEditAlumno(${a.id},'${esc(a.nombre)}','${a.permiso}',${a.vehiculo_id || 'null'},${a.profesor_id || 'null'},'${esc(a.email || '')}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAlumno(${a.id},'${esc(a.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> Borrar</button>
      </td>
    </tr>`;
  }).join('');
}

// Validación básica de email: vacío se admite (el email es opcional, se pide
// más adelante para el portal del alumno); si no está vacío exige un "@" y un
// "." tras él, sin pretender validar el formato completo.
function emailValido(email) {
  if (!email) return true;
  const arroba = email.indexOf('@');
  return arroba > 0 && email.indexOf('.', arroba) > arroba;
}

async function addAlumno() {
  const nombre = document.getElementById('a-nombre').value.trim();
  const permiso = document.getElementById('a-permiso').value;
  const vid = document.getElementById('a-vehiculo').value || null;
  const profId = document.getElementById('a-profesor')?.value || null;
  const email = document.getElementById('a-email')?.value.trim() || '';
  if (!nombre) {
    showToast('alumno-alert', 'Introduce el nombre del alumno.', 'err');
    document.getElementById('a-nombre').focus();
    return;
  }
  if (!emailValido(email)) {
    showToast('alumno-alert', 'El email no tiene un formato válido.', 'err');
    document.getElementById('a-email').focus();
    return;
  }
  hideToast('alumno-alert');
  await window.api.addAlumno(nombre, permiso, vid ? parseInt(vid) : null, profId ? parseInt(profId) : null, getSucursalActual(), email || null);
  document.getElementById('a-nombre').value = '';
  document.getElementById('a-email').value = '';
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

async function openEditAlumno(id, nombre, permiso, vehiculo_id, profesor_id, email) {
  document.getElementById('edit-a-id').value = id;
  document.getElementById('edit-a-nombre').value = nombre;
  document.getElementById('edit-a-permiso').value = permiso;
  document.getElementById('edit-a-vehiculo').value = vehiculo_id || '';
  document.getElementById('edit-a-email').value = email || '';
  await llenarSelectProfesores('edit-a-profesor', profesor_id);
  openModal('modal-alumno');
}

async function saveAlumno() {
  const id = parseInt(document.getElementById('edit-a-id').value);
  const nombre = document.getElementById('edit-a-nombre').value.trim();
  const permiso = document.getElementById('edit-a-permiso').value;
  const vid = document.getElementById('edit-a-vehiculo').value || null;
  const profId = document.getElementById('edit-a-profesor')?.value || null;
  const email = document.getElementById('edit-a-email')?.value.trim() || '';
  if (!nombre) { alert('Introduce un nombre.'); return; }
  if (!emailValido(email)) { alert('El email no tiene un formato válido.'); return; }
  await window.api.updateAlumno(id, nombre, permiso, vid ? parseInt(vid) : null, profId ? parseInt(profId) : null, email || null);
  closeModal('modal-alumno');
  loadAlumnos();
}

