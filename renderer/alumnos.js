// ─── ALUMNOS ─────────────────────────────────────────────────────────────────
// Listado, filtros, ordenación, CRUD y anotaciones de alumnos.

// Etiquetas del ciclo de estados ampliado (tarea B1 del PLAN-MAESTRO):
// matriculado → en teórica → apto teórico → en prácticas → presentado →
// apto/no apto, más baja. activo/aprobado se conservan (legacy) para que
// alumnos ya guardados con esos valores sigan mostrando su etiqueta. Usado
// tanto en la tabla (pastilla) como en la ficha imprimible.
const ESTADO_ALUMNO_TEXTO = {
  matriculado: 'Matriculado', en_teorica: 'En teórica', apto_teorico: 'Apto teórico',
  en_practicas: 'En prácticas', presentado: 'Presentado a examen', apto: 'Apto (aprobado)',
  no_apto: 'No apto', baja: 'Baja', activo: 'Activo', aprobado: 'Aprobado'
};

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
  const estado = document.getElementById('f-alumnos-estado');
  if (nombre) nombre.value = '';
  if (vehiculo) vehiculo.value = '';
  if (permiso) permiso.value = '';
  if (profesor) profesor.value = '';
  if (estado) estado.value = '';
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
  const estadoFiltro = document.getElementById('f-alumnos-estado')?.value || '';

  let filtrados = alumnosCache.filter(a => {
    // El texto de búsqueda también encuentra por DNI y teléfono, no solo nombre.
    if (nombreFiltro) {
      const enNombre = a.nombre.toLowerCase().includes(nombreFiltro);
      const enDni = (a.dni || '').toLowerCase().includes(nombreFiltro);
      const enTelefono = (a.telefono || '').toLowerCase().includes(nombreFiltro);
      if (!enNombre && !enDni && !enTelefono) return false;
    }
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
    if (estadoFiltro && (a.estado || 'activo') !== estadoFiltro) return false;
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
      else if (col === 'estado') { va = a.estado || 'activo'; vb = b.estado || 'activo'; }
      return va.localeCompare(vb, 'es', { numeric: true }) * dir;
    });
  }
  actualizarIndicadoresOrdenAlumnos();

  if (!alumnosCache.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">No hay alumnos registrados</td></tr>';
    return;
  }
  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">Ningún alumno coincide con los filtros</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(a => {
    const tag = tagPermiso(a.permiso);
    const sem = semaforoCache.get(a.id);
    const semTexto = { verde: 'Listo', ambar: 'Casi', rojo: 'Lejos' };
    const pillSemaforo = sem
      ? `<span class="semaforo-pill semaforo-${sem.nivel}" title="${esc(sem.motivo)}">${semTexto[sem.nivel] || sem.nivel}</span>`
      : '<span style="color:var(--placeholder)">—</span>';
    const estado = a.estado || 'activo';
    const pillEstado = `<span class="estado-pill estado-${estado}">${ESTADO_ALUMNO_TEXTO[estado] || estado}</span>`;
    const otrosPermisos = (a.permisos || []).map(p => tagPermiso(p)).join(' ');
    return `<tr>
      <td><strong>${esc(a.nombre)}</strong></td>
      <td>${a.telefono ? esc(a.telefono) : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${tag}${otrosPermisos ? ' ' + otrosPermisos : ''}</td>
      <td>${a.vehiculo_nombre ? esc(a.vehiculo_nombre) : '<span style="color:var(--placeholder)">Sin asignar</span>'}</td>
      <td>${a.profesor_nombre ? esc(a.profesor_nombre) : '<span style="color:var(--placeholder)">Sin asignar</span>'}</td>
      <td><span style="font-weight:700">${a.num_practicas}</span></td>
      <td>${pillSemaforo}</td>
      <td>${pillEstado}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="verPracticas(${a.id},${a.vehiculo_id || 'null'},'${esc(a.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> Prácticas</button>
        <button class="btn btn-sm" style="background:var(--warn-bg);color:var(--warn-fg);border:1px solid var(--warn-border)" onclick="verAnotaciones(${a.id},'${esc(a.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Anotaciones</button>
        <button class="btn btn-gray btn-sm" onclick="abrirEconomiaAlumno(${a.id},'${esc(a.nombre)}')" title="Economía del alumno">💶 Economía</button>
        <button class="btn btn-warn btn-sm" onclick="openEditAlumno(${a.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Editar</button>
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

// Permisos múltiples (tarea B1): lee los checkboxes marcados del contenedor
// #a-permisos / #edit-a-permisos y devuelve un array de códigos. Distinto del
// `permiso` principal (select), que NO se toca.
function leerPermisosCheckboxes(contenedorId) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return [];
  return [...cont.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
}

// Inverso de leerPermisosCheckboxes: marca los checkboxes del contenedor
// según el array `permisos` del alumno (se llama al abrir el modal de editar).
function marcarPermisosCheckboxes(contenedorId, permisos) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  const set = new Set(permisos || []);
  cont.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = set.has(cb.value); });
}

async function addAlumno() {
  const nombre = document.getElementById('a-nombre').value.trim();
  const permiso = document.getElementById('a-permiso').value;
  const vid = document.getElementById('a-vehiculo').value || null;
  const profId = document.getElementById('a-profesor')?.value || null;
  const email = document.getElementById('a-email')?.value.trim() || '';
  const datos = {
    telefono: document.getElementById('a-telefono')?.value.trim() || '',
    dni: document.getElementById('a-dni')?.value.trim() || '',
    fecha_nacimiento: document.getElementById('a-fecha-nacimiento')?.value || '',
    direccion: document.getElementById('a-direccion')?.value.trim() || '',
    fecha_alta: document.getElementById('a-fecha-alta')?.value || '',
    observaciones: document.getElementById('a-observaciones')?.value.trim() || '',
    estado: document.getElementById('a-estado')?.value || ''
  };
  // Libro de registro de alumnos (RD 1295/2003 art. 39): permisos que ya
  // posee, fechas de la enseñanza y resultado. El nº de inscripción no se
  // pide aquí, se asigna aparte.
  const libro = {
    permisos_posee: document.getElementById('a-permisos-posee')?.value.trim() || '',
    fecha_inicio: document.getElementById('a-fecha-inicio')?.value || '',
    fecha_fin: document.getElementById('a-fecha-fin')?.value || '',
    resultado: document.getElementById('a-resultado')?.value || ''
  };
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
  const permisos = leerPermisosCheckboxes('a-permisos');
  await window.api.addAlumno(nombre, permiso, vid ? parseInt(vid) : null, profId ? parseInt(profId) : null, getSucursalActual(), email || null, datos, libro, permisos);
  document.getElementById('a-nombre').value = '';
  document.getElementById('a-email').value = '';
  document.getElementById('a-telefono').value = '';
  document.getElementById('a-dni').value = '';
  document.getElementById('a-fecha-nacimiento').value = '';
  document.getElementById('a-direccion').value = '';
  document.getElementById('a-fecha-alta').value = '';
  document.getElementById('a-observaciones').value = '';
  document.getElementById('a-estado').value = 'activo';
  document.getElementById('a-permisos-posee').value = '';
  document.getElementById('a-fecha-inicio').value = '';
  document.getElementById('a-fecha-fin').value = '';
  document.getElementById('a-resultado').value = '';
  marcarPermisosCheckboxes('a-permisos', []);
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

// id: se busca en alumnosCache (ya cargada por loadAlumnos) en vez de pasar
// todos los campos por el onclick — más limpio ahora que la ficha tiene 6
// campos nuevos, y evita problemas de escapado con comas/comillas en ellos.
async function openEditAlumno(id) {
  const a = alumnosCache.find(x => x.id === id);
  if (!a) return;
  document.getElementById('edit-a-id').value = a.id;
  document.getElementById('edit-a-nombre').value = a.nombre;
  document.getElementById('edit-a-permiso').value = a.permiso;
  document.getElementById('edit-a-vehiculo').value = a.vehiculo_id || '';
  document.getElementById('edit-a-email').value = a.email || '';
  document.getElementById('edit-a-telefono').value = a.telefono || '';
  document.getElementById('edit-a-dni').value = a.dni || '';
  document.getElementById('edit-a-fecha-nacimiento').value = a.fecha_nacimiento || '';
  document.getElementById('edit-a-direccion').value = a.direccion || '';
  document.getElementById('edit-a-fecha-alta').value = a.fecha_alta || '';
  document.getElementById('edit-a-observaciones').value = a.observaciones || '';
  document.getElementById('edit-a-estado').value = a.estado || 'activo';
  document.getElementById('edit-a-permisos-posee').value = a.permisos_posee || '';
  document.getElementById('edit-a-fecha-inicio').value = a.fecha_inicio || '';
  document.getElementById('edit-a-fecha-fin').value = a.fecha_fin || '';
  document.getElementById('edit-a-resultado').value = a.resultado || '';
  marcarPermisosCheckboxes('edit-a-permisos', a.permisos || []);
  const nInsc = document.getElementById('edit-a-n-inscripcion');
  nInsc.textContent = a.n_inscripcion != null ? `Nº inscripción libro: ${a.n_inscripcion}` : '';
  await llenarSelectProfesores('edit-a-profesor', a.profesor_id);
  openModal('modal-alumno');
}

async function saveAlumno() {
  const id = parseInt(document.getElementById('edit-a-id').value);
  const nombre = document.getElementById('edit-a-nombre').value.trim();
  const permiso = document.getElementById('edit-a-permiso').value;
  const vid = document.getElementById('edit-a-vehiculo').value || null;
  const profId = document.getElementById('edit-a-profesor')?.value || null;
  const email = document.getElementById('edit-a-email')?.value.trim() || '';
  const datos = {
    telefono: document.getElementById('edit-a-telefono')?.value.trim() || '',
    dni: document.getElementById('edit-a-dni')?.value.trim() || '',
    fecha_nacimiento: document.getElementById('edit-a-fecha-nacimiento')?.value || '',
    direccion: document.getElementById('edit-a-direccion')?.value.trim() || '',
    fecha_alta: document.getElementById('edit-a-fecha-alta')?.value || '',
    observaciones: document.getElementById('edit-a-observaciones')?.value.trim() || '',
    estado: document.getElementById('edit-a-estado')?.value || ''
  };
  const libro = {
    permisos_posee: document.getElementById('edit-a-permisos-posee')?.value.trim() || '',
    fecha_inicio: document.getElementById('edit-a-fecha-inicio')?.value || '',
    fecha_fin: document.getElementById('edit-a-fecha-fin')?.value || '',
    resultado: document.getElementById('edit-a-resultado')?.value || ''
  };
  if (!nombre) { alert('Introduce un nombre.'); return; }
  if (!emailValido(email)) { alert('El email no tiene un formato válido.'); return; }
  const permisos = leerPermisosCheckboxes('edit-a-permisos');
  await window.api.updateAlumno(id, nombre, permiso, vid ? parseInt(vid) : null, profId ? parseInt(profId) : null, email || null, datos, libro, permisos);
  closeModal('modal-alumno');
  loadAlumnos();
}

// ─── ECONOMÍA DEL ALUMNO (modal) ───────────────────────────────────────────
// Trae el resumen ya calculado por el backend (getDesglosePagosAlumno) y la
// lista de pagos (getPagosAlumno); no recalcula nada aquí. Reutiliza el
// mismo estilo (badges de estado, colores saldo-pendiente/saldo-ok) que la
// pantalla de Pagos para que se vea coherente.
async function abrirEconomiaAlumno(alumnoId, alumnoNombre) {
  const modal = document.getElementById('modal-economia-alumno');
  modal.dataset.alumnoId = alumnoId;
  modal.dataset.alumnoNombre = alumnoNombre;
  document.getElementById('economia-pago-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('economia-pago-cantidad').value = '';
  document.getElementById('economia-pago-nota').value = '';
  await renderEconomiaAlumno();
  openModal('modal-economia-alumno');
}

async function renderEconomiaAlumno() {
  const modal = document.getElementById('modal-economia-alumno');
  const alumnoId = parseInt(modal.dataset.alumnoId);
  const [desglose, pagos] = await Promise.all([
    window.api.getDesglosePagosAlumno(alumnoId),
    window.api.getPagosAlumno(alumnoId)
  ]);

  document.getElementById('modal-economia-titulo').textContent = `Economía — ${modal.dataset.alumnoNombre}`;
  document.getElementById('economia-permiso').innerHTML = desglose ? tagPermiso(desglose.permiso) : '';

  const aviso = document.getElementById('economia-aviso-sin-tarifa');
  aviso.classList.toggle('hidden', !desglose || !desglose.practicas.some(p => p.estado === 'sin_tarifa'));

  const resumen = document.getElementById('economia-resumen');
  if (desglose) {
    const saldoClase = desglose.saldo > 0 ? 'saldo-pendiente' : 'saldo-ok';
    const saldoTexto = desglose.saldo > 0 ? 'Pendiente de cobro' : 'Al día';
    const totalCargos = (desglose.cargos || []).reduce((sum, c) => sum + (c.importe || 0), 0);
    resumen.innerHTML = `
      <div class="stat">
        <div class="stat-head"><span class="lbl">Generado</span></div>
        <div class="num">${fmt(desglose.total_generado)} €</div>
      </div>
      <div class="stat">
        <div class="stat-head"><span class="lbl">Cargos/descuentos</span></div>
        <div class="num">${fmt(totalCargos)} €</div>
      </div>
      <div class="stat">
        <div class="stat-head"><span class="lbl">Pagado</span></div>
        <div class="num">${fmt(desglose.total_pagado)} €</div>
      </div>
      <div class="stat">
        <div class="stat-head"><span class="lbl">Saldo</span></div>
        <div class="num"><span class="${saldoClase}">${fmt(desglose.saldo)} €</span></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${saldoTexto}</div>
      </div>`;
  } else {
    resumen.innerHTML = '';
  }

  const ESTADO_BADGE = {
    pagada: () => '<span class="badge-pagada">Pagada</span>',
    parcial: (p) => `<span class="badge-parcial">${fmt(p.cubierto)} € de ${fmt(p.precio)} €</span>`,
    pendiente: () => '<span class="badge-pendiente-pago">Pendiente</span>',
    sin_tarifa: () => '<span class="badge-sin-tarifa">Sin tarifa</span>'
  };
  const TIPO_LABEL = { circulacion: 'Circulación', pista: 'Pista' };
  const tbodyDesglose = document.querySelector('#tabla-economia-desglose tbody');
  if (!desglose || !desglose.practicas.length) {
    tbodyDesglose.innerHTML = '<tr><td colspan="4" class="empty">No hay prácticas registradas</td></tr>';
  } else {
    tbodyDesglose.innerHTML = desglose.practicas.map(p => `<tr>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${esc(TIPO_LABEL[p.tipo] || p.tipo)}</td>
      <td>${p.precio != null ? fmt(p.precio) + ' €' : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${ESTADO_BADGE[p.estado](p)}</td>
    </tr>`).join('');
  }

  const tbodyPagos = document.querySelector('#tabla-economia-pagos tbody');
  if (!pagos.length) {
    tbodyPagos.innerHTML = '<tr><td colspan="4" class="empty">No hay pagos registrados</td></tr>';
  } else {
    tbodyPagos.innerHTML = pagos.map(p => `<tr>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${fmt(p.cantidad)} €</td>
      <td>${p.nota ? esc(p.nota) : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deletePagoEconomia(${p.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
    </tr>`).join('');
  }

  const TIPO_CARGO_LABEL = { matricula: 'Matrícula', tasa: 'Tasa', cargo: 'Cargo', descuento: 'Descuento', promo: 'Promoción' };
  const tbodyCargos = document.querySelector('#tabla-economia-cargos tbody');
  const cargos = (desglose && desglose.cargos) || [];
  if (!cargos.length) {
    tbodyCargos.innerHTML = '<tr><td colspan="5" class="empty">No hay cargos ni descuentos registrados</td></tr>';
  } else {
    tbodyCargos.innerHTML = cargos.map(c => `<tr>
      <td>${fmtFecha(c.fecha)}</td>
      <td>${c.concepto ? esc(c.concepto) : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${esc(TIPO_CARGO_LABEL[c.tipo] || c.tipo)}</td>
      <td><span class="${c.importe < 0 ? 'saldo-ok' : 'saldo-pendiente'}">${fmt(c.importe)} €</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteCargoEconomia(${c.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
    </tr>`).join('');
  }
}

// ─── CARGOS Y DESCUENTOS DEL ALUMNO (modal, tarea D2) ──────────────────────
// Vive dentro del modal de economía: abrirModalCargo()/guardarCargo() lo
// rellenan y lo guardan, addCargoRapido() precarga tipo+importe con la
// preferencia de Ajustes (getMatriculaImporte/getTasaImporte, renderer/
// ajustes.js). Al guardar, refresca renderEconomiaAlumno() para que el
// resumen (total_generado/saldo, ya recalculados en db/pagos.js) se
// actualice al instante.
function abrirModalCargo() {
  document.getElementById('cargo-tipo').value = 'cargo';
  document.getElementById('cargo-concepto').value = '';
  document.getElementById('cargo-importe').value = '';
  document.getElementById('cargo-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('cargo-nota').value = '';
  openModal('modal-cargo');
}

function addCargoRapido(tipo) {
  const importe = tipo === 'matricula' ? getMatriculaImporte() : getTasaImporte();
  document.getElementById('cargo-tipo').value = tipo;
  document.getElementById('cargo-concepto').value = tipo === 'matricula' ? 'Matrícula' : 'Tasa';
  document.getElementById('cargo-importe').value = importe;
  document.getElementById('cargo-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('cargo-nota').value = '';
  openModal('modal-cargo');
}

async function guardarCargo() {
  const modalEco = document.getElementById('modal-economia-alumno');
  const alumnoId = parseInt(modalEco.dataset.alumnoId);
  const tipo = document.getElementById('cargo-tipo').value;
  const concepto = document.getElementById('cargo-concepto').value.trim();
  const importe = parseFloat(document.getElementById('cargo-importe').value);
  const fecha = document.getElementById('cargo-fecha').value;
  const nota = document.getElementById('cargo-nota').value.trim();
  if (isNaN(importe)) { alert('Introduce un importe válido.'); return; }
  if (!fecha) { alert('Selecciona una fecha.'); return; }
  await window.api.addCargo({ alumno_id: alumnoId, concepto, tipo, importe, fecha, sucursal_id: getSucursalActual(), nota });
  closeModal('modal-cargo');
  await renderEconomiaAlumno();
}

async function deleteCargoEconomia(id) {
  if (!confirm('¿Borrar este cargo/descuento?')) return;
  await window.api.deleteCargo(id);
  await renderEconomiaAlumno();
}

async function addPagoEconomia() {
  const modal = document.getElementById('modal-economia-alumno');
  const alumnoId = parseInt(modal.dataset.alumnoId);
  const fecha = document.getElementById('economia-pago-fecha').value;
  const cantidad = parseFloat(document.getElementById('economia-pago-cantidad').value);
  const nota = document.getElementById('economia-pago-nota').value.trim();
  if (!fecha) { alert('Selecciona una fecha.'); return; }
  if (isNaN(cantidad) || cantidad <= 0) { alert('Introduce una cantidad válida.'); return; }
  await window.api.addPago(alumnoId, fecha, cantidad, nota, getSucursalActual());
  document.getElementById('economia-pago-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('economia-pago-cantidad').value = '';
  document.getElementById('economia-pago-nota').value = '';
  await renderEconomiaAlumno();
}

async function deletePagoEconomia(id) {
  if (!confirm('¿Borrar este pago?')) return;
  await window.api.deletePago(id);
  await renderEconomiaAlumno();
}

// ─── FICHA IMPRIMIBLE DEL ALUMNO ────────────────────────────────────────────
// Reutiliza datos ya cargados (alumnosCache) + dos llamadas puntuales
// (desglose de pagos y semáforo). Rellena #ficha-print (oculto en pantalla,
// visible solo dentro de @media print, ver styles.css) y lanza window.print().
function fmtEuros(num) {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
}

// Construye un bloque "Etiqueta: valor" solo si el valor no está vacío
// (omite null/undefined/'' con elegancia en vez de imprimir "null").
function filaFicha(etiqueta, valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return `<div class="ficha-campo"><span class="ficha-etiqueta">${esc(etiqueta)}</span><span class="ficha-valor">${esc(valor)}</span></div>`;
}

async function imprimirFichaAlumno(id) {
  const a = alumnosCache.find(x => x.id === id);
  if (!a) return;

  let desglose = null;
  let semaforo = null;
  try { desglose = await window.api.getDesglosePagosAlumno(id); } catch (e) { /* sin economía disponible */ }
  try { semaforo = await window.api.getSemaforoAlumno(id); } catch (e) { /* sin semáforo disponible */ }

  const SEM_TEXTO = { verde: 'Listo para examen', ambar: 'Casi listo', rojo: 'Aún lejos' };
  const PERMISO_TEXTO = { B: 'B (Coche)', A: 'A (Moto)', A2: 'A2', AM: 'AM', C: 'C (Camión)' };

  const kmTotales = semaforo ? semaforo.kmTotales : null;

  const ficha = document.getElementById('ficha-print');
  ficha.innerHTML = `
    <div class="ficha-cabecera">
      <img src="icon.png" alt="AulaMovil" class="ficha-logo">
      <div>
        <h1>AulaMovil — Ficha del alumno</h1>
        <div class="ficha-fecha">Impresa el ${fmtFecha(new Date().toISOString().split('T')[0])}</div>
      </div>
    </div>

    <h2>Datos personales</h2>
    <div class="ficha-grid">
      ${filaFicha('Nombre', a.nombre)}
      ${filaFicha('DNI/NIE', a.dni)}
      ${filaFicha('Teléfono', a.telefono)}
      ${filaFicha('Email', a.email)}
      ${filaFicha('Fecha de nacimiento', a.fecha_nacimiento ? fmtFecha(a.fecha_nacimiento) : '')}
      ${filaFicha('Dirección', a.direccion)}
      ${filaFicha('Permiso', PERMISO_TEXTO[a.permiso] || a.permiso)}
      ${filaFicha('Otros permisos', (a.permisos || []).join(', '))}
      ${filaFicha('Estado', ESTADO_ALUMNO_TEXTO[a.estado || 'activo'] || a.estado)}
      ${filaFicha('Fecha de alta', a.fecha_alta ? fmtFecha(a.fecha_alta) : '')}
      ${filaFicha('Profesor', a.profesor_nombre)}
      ${filaFicha('Vehículo', a.vehiculo_nombre)}
    </div>
    ${a.observaciones ? `<div class="ficha-observaciones"><span class="ficha-etiqueta">Observaciones</span><p>${esc(a.observaciones)}</p></div>` : ''}

    <h2>Progreso</h2>
    <div class="ficha-grid">
      ${filaFicha('Nº de prácticas', a.num_practicas != null ? String(a.num_practicas) : '')}
      ${filaFicha('Km totales', kmTotales != null ? `${kmTotales} km` : '')}
      ${filaFicha('Semáforo de examen', semaforo ? (SEM_TEXTO[semaforo.nivel] || semaforo.nivel) : 'Sin datos suficientes')}
      ${semaforo && semaforo.motivo ? filaFicha('Motivo', semaforo.motivo) : ''}
    </div>

    <h2>Economía</h2>
    ${desglose ? `
    <div class="ficha-grid">
      ${filaFicha('Generado', `${fmtEuros(desglose.total_generado)} €`)}
      ${filaFicha('Pagado', `${fmtEuros(desglose.total_pagado)} €`)}
      ${filaFicha('Saldo', `${fmtEuros(desglose.saldo)} €`)}
    </div>` : '<p class="ficha-sin-datos">No hay datos de economía disponibles.</p>'}
  `;

  window.print();
}

// ─── FICHA DE CLASES PRÁCTICAS FIRMABLE (RD 1295/2003 art. 40) ─────────────
// Mismo mecanismo de impresión que imprimirFichaAlumno/imprimirLibroRegistro
// (#ficha-print oculto en pantalla, visible solo en @media print).
const TIPO_PRACTICA_TEXTO = { circulacion: 'Circulación', pista: 'Pista' };

async function imprimirFichaPracticas(alumnoId) {
  const datos = await window.api.getFichaPracticasAlumno(alumnoId);
  if (!datos) return;

  const { alumno, practicas, totales } = datos;
  const PERMISO_TEXTO = { B: 'B (Coche)', A: 'A (Moto)', A2: 'A2', AM: 'AM', C: 'C (Camión)' };

  const filas = practicas.map((p, i) => `<tr>
      <td>${i + 1}</td>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${esc(p.vehiculo_nombre || '—')}${p.matricula ? ` (${esc(p.matricula)})` : ''}</td>
      <td>${esc(p.profesor_nombre || '—')}</td>
      <td>${esc(TIPO_PRACTICA_TEXTO[p.tipo] || p.tipo)}</td>
      <td>${p.km_inicial}</td>
      <td>${p.km_final}</td>
      <td>${p.km_recorridos}</td>
      <td class="ficha-firma-celda"></td>
      <td class="ficha-firma-celda"></td>
    </tr>`).join('');

  const ficha = document.getElementById('ficha-print');
  ficha.innerHTML = `
    <div class="ficha-cabecera">
      <img src="icon.png" alt="AulaMovil" class="ficha-logo">
      <div>
        <h1>AulaMovil — Ficha de clases prácticas</h1>
        <div class="ficha-fecha">Impresa el ${fmtFecha(new Date().toISOString().split('T')[0])}</div>
      </div>
    </div>

    <div class="ficha-grid">
      ${filaFicha('Alumno', alumno.nombre)}
      ${filaFicha('DNI/NIE', alumno.dni)}
      ${filaFicha('Permiso', PERMISO_TEXTO[alumno.permiso] || alumno.permiso)}
    </div>

    <table class="ficha-tabla">
      <thead><tr>
        <th>Nº</th><th>Fecha</th><th>Vehículo</th><th>Profesor</th><th>Tipo</th>
        <th>Km inicial</th><th>Km final</th><th>Km recorridos</th><th>Firma alumno</th><th>Firma profesor</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="10" style="text-align:center">No hay clases prácticas registradas</td></tr>'}</tbody>
      <tfoot><tr>
        <td colspan="7" style="text-align:right"><strong>Totales</strong></td>
        <td><strong>${totales.nClases} clase${totales.nClases === 1 ? '' : 's'}</strong></td>
        <td colspan="2"><strong>${totales.kmTotales} km</strong></td>
      </tr></tfoot>
    </table>

    <div class="ficha-firmas-final">
      <div class="ficha-firma-bloque">
        <div class="ficha-firma-linea"></div>
        <span>Firma y sello del centro</span>
      </div>
      <div class="ficha-firma-bloque">
        <div class="ficha-firma-linea"></div>
        <span>Firma del alumno</span>
      </div>
      <div class="ficha-firma-bloque">
        <div class="ficha-firma-linea"></div>
        <span>Fecha</span>
      </div>
    </div>
  `;

  window.print();
}

// ─── LIBRO DE REGISTRO DE ALUMNOS (RD 1295/2003 art. 39) ──────────────────
// Reutiliza EXACTAMENTE el mismo elemento/patrón de impresión que
// imprimirFichaAlumno (#ficha-print oculto en pantalla, visible solo en
// @media print, ver styles.css) en vez de reinventar el CSS de impresión.
async function imprimirLibroRegistro() {
  // Asegura que todos los alumnos tienen nº de inscripción antes de listar.
  await window.api.backfillNumInscripcion();
  const libro = await window.api.getLibroRegistro(getSucursalActual());

  const RESULTADO_TEXTO = { apto: 'Apto', no_apto: 'No apto', baja: 'Baja' };
  const PERMISO_TEXTO = { B: 'B (Coche)', A: 'A (Moto)', A2: 'A2', AM: 'AM', C: 'C (Camión)' };

  const filas = libro.map(a => {
    const fechaInscripcion = a.fecha_inicio || a.fecha_alta || '';
    return `<tr>
      <td>${a.n_inscripcion != null ? a.n_inscripcion : '—'}</td>
      <td>${fechaInscripcion ? fmtFecha(fechaInscripcion) : '—'}</td>
      <td>${esc(a.nombre)}</td>
      <td>${a.dni ? esc(a.dni) : '—'}</td>
      <td>${a.fecha_nacimiento ? fmtFecha(a.fecha_nacimiento) : '—'}</td>
      <td>${a.permisos_posee ? esc(a.permisos_posee) : '—'}</td>
      <td>${esc(PERMISO_TEXTO[a.permiso] || a.permiso)}</td>
      <td>${a.fecha_inicio ? fmtFecha(a.fecha_inicio) : '—'}</td>
      <td>${a.fecha_fin ? fmtFecha(a.fecha_fin) : '—'}</td>
      <td>${RESULTADO_TEXTO[a.resultado] || '—'}</td>
    </tr>`;
  }).join('');

  const ficha = document.getElementById('ficha-print');
  ficha.innerHTML = `
    <div class="ficha-cabecera">
      <img src="icon.png" alt="AulaMovil" class="ficha-logo">
      <div>
        <h1>AulaMovil — Libro de registro de alumnos (art. 39)</h1>
        <div class="ficha-fecha">Generado el ${fmtFecha(new Date().toISOString().split('T')[0])}</div>
      </div>
    </div>
    <table class="ficha-tabla">
      <thead><tr>
        <th>Nº</th><th>F. inscripción</th><th>Nombre</th><th>DNI/NIE</th><th>F. nacimiento</th>
        <th>Permisos que posee</th><th>Permiso al que aspira</th><th>Inicio enseñanza</th><th>Fin enseñanza</th><th>Resultado</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="10" style="text-align:center">No hay alumnos registrados</td></tr>'}</tbody>
    </table>
  `;

  window.print();
}

