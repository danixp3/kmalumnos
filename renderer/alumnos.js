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
  // Una sola llamada: nº de prácticas, km, última práctica, próxima clase,
  // próximo examen y bono de cada alumno (db.getAlumnosLista).
  alumnosCache = await window.api.getAlumnosLista(getSucursalActual());
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

// ─── Pestañas de grupo (En prácticas / Con examen / Sin clase / Nuevos / Todos) ───
const ESTADOS_FUERA_DE_PRACTICAS = ['baja', 'aprobado', 'apto', 'no_apto'];
const alumnoActivo = a => !ESTADOS_FUERA_DE_PRACTICAS.includes(a.estado || 'activo');
const DIAS_SIN_CLASE_RIESGO = 30;
const DIAS_ALUMNO_NUEVO = 30;
const PREDICADOS_TAB_ALUMNOS = {
  activos: a => alumnoActivo(a),
  examen: a => !!a.proximo_examen,
  riesgo: a => alumnoActivo(a) && a.num_practicas > 0 && a.ultima_fecha && diasEntre(a.ultima_fecha, hoyISO()) > DIAS_SIN_CLASE_RIESGO,
  nuevos: a => alumnoActivo(a) && (a.num_practicas === 0 || (a.fecha_alta && diasEntre(a.fecha_alta, hoyISO()) <= DIAS_ALUMNO_NUEVO)),
  todos: () => true
};

function cambiarTabAlumnos(tab) {
  alumnosTab = tab;
  renderAlumnosTabla();
}

function pintarTabsAlumnos() {
  const nombres = { activos: 'En prácticas', examen: 'Con examen', riesgo: 'Sin clase', nuevos: 'Nuevos', todos: 'Todos' };
  document.querySelectorAll('#alumnos-tabs button').forEach(btn => {
    const t = btn.dataset.tab;
    const n = alumnosCache.filter(PREDICADOS_TAB_ALUMNOS[t]).length;
    btn.innerHTML = `${nombres[t]} <span class="seg-n">· ${n}</span>`;
    btn.setAttribute('aria-pressed', t === alumnosTab ? 'true' : 'false');
    if (t === 'riesgo') btn.title = `Alumnos en prácticas que llevan más de ${DIAS_SIN_CLASE_RIESGO} días sin dar clase`;
  });
  const resumen = document.getElementById('alumnos-resumen');
  if (resumen) resumen.textContent = `${alumnosCache.filter(PREDICADOS_TAB_ALUMNOS.activos).length} en prácticas · ${alumnosCache.length} en total`;
}

// Pastilla de estado: lo más útil de un vistazo (en clase > final de ciclo > examen > nuevo > estado).
function pillEstadoAlumno(a) {
  const estado = a.estado || 'activo';
  if (a.en_clase_ahora) return '<span class="pill pill-dark"><span class="pill-dot"></span>En clase ahora</span>';
  if (estado === 'baja' || estado === 'no_apto') return `<span class="pill pill-err">${esc(ESTADO_ALUMNO_TEXTO[estado])}</span>`;
  if (estado === 'apto' || estado === 'aprobado') return `<span class="pill pill-ok">${esc(ESTADO_ALUMNO_TEXTO[estado])}</span>`;
  if (a.proximo_examen) return '<span class="pill pill-info"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>Examen programado</span>';
  if (PREDICADOS_TAB_ALUMNOS.nuevos(a) && a.num_practicas === 0) return '<span class="pill pill-line">Nuevo</span>';
  return `<span class="pill">${esc(ESTADO_ALUMNO_TEXTO[estado] || estado)}</span>`;
}

function celdaClasesAlumno(a) {
  if (a.bono && a.bono.total > 0) {
    const pct = Math.min(100, Math.round((a.bono.usadas / a.bono.total) * 100));
    const pocas = a.bono.saldo <= 2;
    const resto = pocas ? ` · <span class="bono-aviso">${a.bono.saldo === 0 ? 'agotado' : (a.bono.saldo === 1 ? 'queda 1' : 'quedan ' + a.bono.saldo)}</span>` : '';
    return `<div class="bono" title="${esc(a.bono.nombre || 'Bono')}: ${a.bono.usadas} usadas de ${a.bono.total}"><div><b>${a.bono.usadas}</b> de ${a.bono.total}${resto}</div><div class="bono-barra${pocas ? ' bono-poco' : ''}"><span style="width:${pct}%"></span></div></div>`;
  }
  return `<div class="bono"><div><b>${fmtClases(a.num_practicas)}</b> ${a.num_practicas > 0 && a.num_practicas <= 1 ? 'clase' : 'clases'}</div>${a.minutos_sobrantes > 0 ? `<small title="Minutos de clases por minutos del móvil; se anotan al llegar a ¼ de clase">+${fmtDec(a.minutos_sobrantes)} min</small>` : ''}</div>`;
}

const SVG_MINI = {
  nota: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  euro: '<path d="M18 7.5A6.5 6.5 0 0 0 7 9.5v5A6.5 6.5 0 0 0 18 16.5"/><path d="M4 10.5h10M4 13.5h10"/>',
  editar: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  borrar: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  ficha: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>'
};
const svgMini = k => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG_MINI[k]}</svg>`;

function renderAlumnosTabla() {
  const tbody = document.querySelector('#tabla-alumnos tbody');
  const nombreFiltro = (document.getElementById('f-alumnos-nombre')?.value || '').trim().toLowerCase();
  const vehiculoFiltro = document.getElementById('f-alumnos-vehiculo')?.value || '';
  const permisoFiltro = document.getElementById('f-alumnos-permiso')?.value || '';
  const profesorFiltro = document.getElementById('f-alumnos-profesor')?.value || '';
  const estadoFiltro = document.getElementById('f-alumnos-estado')?.value || '';
  pintarTabsAlumnos();

  let filtrados = alumnosCache.filter(a => {
    if (!PREDICADOS_TAB_ALUMNOS[alumnosTab](a)) return false;
    // El texto de búsqueda también encuentra por DNI y teléfono, no solo nombre.
    if (nombreFiltro) {
      const nombreCompleto = [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ').toLowerCase();
      const enNombre = nombreCompleto.includes(nombreFiltro);
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
      if (col === 'km') return ((a.km_total || 0) - (b.km_total || 0)) * dir;
      if (col === 'ultima') return ((a.ultima_fecha || '') < (b.ultima_fecha || '') ? -1 : (a.ultima_fecha || '') > (b.ultima_fecha || '') ? 1 : 0) * dir;
      if (col === 'examen') {
        // Con examen primero (el más cercano arriba); sin examen al final, por nombre.
        const ea = a.proximo_examen ? a.proximo_examen.fecha : '9999-12-31';
        const eb = b.proximo_examen ? b.proximo_examen.fecha : '9999-12-31';
        return (ea.localeCompare(eb) || (a.nombre || '').localeCompare(b.nombre || '', 'es')) * dir;
      }
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

  const pie = document.getElementById('alumnos-pie');
  const NOMBRE_ORDEN = { examen: 'próximo examen', nombre: 'nombre', practicas: 'clases', km: 'km', ultima: 'última práctica', profesor: 'profesor', estado: 'estado', permiso: 'permiso', vehiculo: 'vehículo' };
  if (pie) pie.innerHTML = `<span>Mostrando ${filtrados.length} de ${alumnosCache.length} alumnos</span><span>${col ? 'Ordenado por ' + (NOMBRE_ORDEN[col] || col) : ''}</span>`;

  if (!alumnosCache.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">No hay alumnos registrados</td></tr>';
    return;
  }
  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">Ningún alumno coincide con los filtros</td></tr>';
    return;
  }

  const semTexto = { verde: 'Listo', ambar: 'Casi', rojo: 'Lejos' };
  const guion = '<span style="color:var(--text-faint)">—</span>';
  tbody.innerHTML = filtrados.map(a => {
    const sem = semaforoCache.get(a.id);
    const pillSemaforo = sem
      ? `<span class="semaforo-pill semaforo-${sem.nivel}" title="${esc(sem.motivo)}">${semTexto[sem.nivel] || sem.nivel}</span>`
      : '';
    const otrosPermisos = (a.permisos || []).map(p => tagPermiso(p)).join(' ');
    const apellidos = [a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ');
    const nombreCompleto = apellidos ? `${a.nombre} ${apellidos}` : a.nombre;
    const sub = [a.telefono ? esc(a.telefono) : '', a.fecha_alta ? 'Alta el ' + diaMes(a.fecha_alta) : ''].filter(Boolean).join(' · ');
    const nombreArg = esc(a.nombre);
    const examen = a.proximo_examen
      ? `<div class="examen-fecha">${diaMes(a.proximo_examen.fecha)}</div>${pillSemaforo}`
      : (pillSemaforo || guion);
    const proxima = a.proxima_clase
      ? `${esc(fechaRelativa(a.proxima_clase.fecha, a.proxima_clase.hora_inicio))}`
      : guion;
    return `<tr>
      <td>
        <div class="al-cell">
          <span class="avatar-ini">${esc(iniciales(nombreCompleto))}</span>
          <div class="al-datos">
            <a class="al-nombre lnk" onclick="verPracticas(${a.id},${a.vehiculo_id || 'null'},'${nombreArg}')" title="Abrir la ficha del alumno">${esc(nombreCompleto)}</a>
            <div class="al-sub">${tagPermiso(a.permiso)}${otrosPermisos ? ' ' + otrosPermisos : ''}${sub ? ' <span>' + sub + '</span>' : ''}</div>
          </div>
        </div>
      </td>
      <td>${a.profesor_nombre ? esc(a.profesor_nombre) : '<span style="color:var(--text-faint)">Sin asignar</span>'}${a.vehiculo_matricula ? '<div class="al-sub">' + placaHTML(a.vehiculo_matricula) + '</div>' : (a.vehiculo_nombre ? '<div class="al-sub">' + esc(a.vehiculo_nombre) + '</div>' : '')}</td>
      <td>${celdaClasesAlumno(a)}</td>
      <td class="col-num num-mono">${a.km_total ? '<b>' + fmtMiles(a.km_total) + '</b>' : guion}</td>
      <td>${a.ultima_fecha ? esc(fechaRelativa(a.ultima_fecha, a.ultima_hora)) : guion}</td>
      <td>${proxima}</td>
      <td>${examen}</td>
      <td>${pillEstadoAlumno(a)}</td>
      <td class="acciones-fila">
        <button class="btn btn-primary btn-sm" onclick="verPracticas(${a.id},${a.vehiculo_id || 'null'},'${nombreArg}')" title="Ficha del alumno: historial de prácticas y km">${svgMini('ficha')} Ficha</button>
        <details class="menu-fila">
          <summary class="btn btn-gray btn-sm btn-icon" title="Más acciones" aria-label="Más acciones"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary>
          <div class="menu-fila-lista">
            <button type="button" onclick="verAnotaciones(${a.id},'${nombreArg}')">${svgMini('nota')} Anotaciones</button>
            <button type="button" onclick="abrirEconomiaAlumno(${a.id},'${nombreArg}')">${svgMini('euro')} Economía</button>
            <button type="button" onclick="openEditAlumno(${a.id})">${svgMini('editar')} Editar</button>
            <button type="button" class="menu-fila-borrar" onclick="deleteAlumno(${a.id},'${nombreArg}')">${svgMini('borrar')} Borrar</button>
          </div>
        </details>
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
    estado: document.getElementById('a-estado')?.value || '',
    // Ficha DGT (tarea "Ficha alumno – formación práctica"): mismo grupo
    // datos que el resto de arriba (ver CAMPOS_DATOS_ALUMNO en db/alumnos.js).
    primer_apellido: document.getElementById('a-primer-apellido')?.value.trim() || '',
    segundo_apellido: document.getElementById('a-segundo-apellido')?.value.trim() || '',
    codigo_postal: document.getElementById('a-cp')?.value.trim() || '',
    poblacion: document.getElementById('a-poblacion')?.value.trim() || ''
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
  const cobros = leerCobrosAlta();
  const nuevoId = await window.api.addAlumno(nombre, permiso, vid ? parseInt(vid) : null, profId ? parseInt(profId) : null, getSucursalActual(), email || null, datos, libro, permisos);
  let cargados = [];
  if (nuevoId && cobros.length) {
    try { cargados = await window.api.addCargosAlta(nuevoId, cobros, datos.fecha_alta || hoyISO(), getSucursalActual()); }
    catch (e) { await avisar('El alumno se ha creado, pero no se pudieron anotar los cobros de alta: ' + (e.message || e) + '. Añádelos desde su ficha económica.'); }
  }
  document.getElementById('a-nombre').value = '';
  document.getElementById('a-primer-apellido').value = '';
  document.getElementById('a-segundo-apellido').value = '';
  document.getElementById('a-email').value = '';
  document.getElementById('a-telefono').value = '';
  document.getElementById('a-dni').value = '';
  document.getElementById('a-fecha-nacimiento').value = '';
  document.getElementById('a-direccion').value = '';
  document.getElementById('a-cp').value = '';
  document.getElementById('a-poblacion').value = '';
  document.getElementById('a-fecha-alta').value = '';
  document.getElementById('a-observaciones').value = '';
  document.getElementById('a-estado').value = 'activo';
  document.getElementById('a-permisos-posee').value = '';
  document.getElementById('a-fecha-inicio').value = '';
  document.getElementById('a-fecha-fin').value = '';
  document.getElementById('a-resultado').value = '';
  marcarPermisosCheckboxes('a-permisos', []);
  closeModal('modal-alumno-nuevo');
  loadAlumnos();
  if (cargados.length) showToast('alumnos-alta-toast', `${nombre} dado de alta. Anotado en su cuenta: ${cargados.map(c => `${c.concepto} ${fmtEur(c.importe)}`).join(' · ')}`, 'ok');
}

// Cobros de alta: los conceptos de Ajustes → Cobros marcados «Al dar de alta»
// salen marcados en el modal; se pueden desmarcar para un alumno concreto
// (p. ej. matrícula gratis por promoción). addAlumno() los carga con
// addCargosAlta en cuanto el alumno existe.
let cobrosAltaCache = [];
async function pintarCobrosAlta() {
  const cont = document.getElementById('a-cobros-alta');
  if (!cont) return;
  try { cobrosAltaCache = (await getConceptosCobroUI()).filter(c => c.alta && c.importe > 0); } catch (e) { cobrosAltaCache = []; }
  cont.innerHTML = cobrosAltaCache.length
    ? cobrosAltaCache.map((c, i) => `<label class="cobro-alta"><input type="checkbox" data-cobro-alta="${i}" checked> ${esc(c.nombre)} <b>${fmtEur(c.importe)}</b></label>`).join('')
    : `<span class="cobro-alta-vacio">No hay nada que cobrar al dar de alta. <a href="#" onclick="closeModal('modal-alumno-nuevo');irAjustesCobros();return false">Configurar la matrícula</a></span>`;
}

function leerCobrosAlta() {
  return [...document.querySelectorAll('#a-cobros-alta input[data-cobro-alta]:checked')]
    .map(cb => cobrosAltaCache[parseInt(cb.dataset.cobroAlta)]).filter(Boolean);
}

// El alta vive en un modal (botón "Nuevo alumno" de la cabecera).
async function abrirNuevoAlumno() {
  hideToast('alumno-alert');
  await loadVehiculosSelect();
  try { await llenarSelectProfesores('a-profesor'); } catch (e) {}
  const alta = document.getElementById('a-fecha-alta');
  if (alta && !alta.value) alta.value = hoyISO();
  document.getElementById('a-estado').value = 'matriculado';
  await pintarCobrosAlta();
  openModal('modal-alumno-nuevo');
  setTimeout(() => document.getElementById('a-nombre')?.focus(), 60);
}

async function deleteAlumno(id, nombre) {
  if (!await confirmar(`¿Borrar al alumno "${nombre}" y todas sus prácticas?`, { peligro: true, textoAceptar: 'Borrar' })) return;
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
  document.getElementById('edit-a-primer-apellido').value = a.primer_apellido || '';
  document.getElementById('edit-a-segundo-apellido').value = a.segundo_apellido || '';
  document.getElementById('edit-a-permiso').value = a.permiso;
  document.getElementById('edit-a-vehiculo').value = a.vehiculo_id || '';
  document.getElementById('edit-a-email').value = a.email || '';
  document.getElementById('edit-a-telefono').value = a.telefono || '';
  document.getElementById('edit-a-dni').value = a.dni || '';
  document.getElementById('edit-a-fecha-nacimiento').value = a.fecha_nacimiento || '';
  document.getElementById('edit-a-direccion').value = a.direccion || '';
  document.getElementById('edit-a-cp').value = a.codigo_postal || '';
  document.getElementById('edit-a-poblacion').value = a.poblacion || '';
  document.getElementById('edit-a-fecha-alta').value = a.fecha_alta || '';
  document.getElementById('edit-a-observaciones').value = a.observaciones || '';
  document.getElementById('edit-a-clases-previas').value = a.clases_previas || '';
  document.getElementById('edit-a-km-previos').value = a.km_previos || '';
  document.getElementById('edit-a-estado').value = a.estado || 'activo';
  document.getElementById('edit-a-permisos-posee').value = a.permisos_posee || '';
  document.getElementById('edit-a-fecha-inicio').value = a.fecha_inicio || '';
  document.getElementById('edit-a-fecha-fin').value = a.fecha_fin || '';
  document.getElementById('edit-a-resultado').value = a.resultado || '';
  marcarPermisosCheckboxes('edit-a-permisos', a.permisos || []);
  const nInsc = document.getElementById('edit-a-n-inscripcion');
  nInsc.textContent = a.n_inscripcion != null ? `Nº inscripción libro: ${a.n_inscripcion}` : '';
  await llenarSelectProfesores('edit-a-profesor', a.profesor_id);
  await cargarFotoDocsAlumno(id);
  openModal('modal-alumno');
}

// ─── FOTO Y DOCUMENTOS DEL ALUMNO (D7, almacenamiento local sin sync) ──────
let docsAlumnoCache = [];

function leerFicheroComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function cargarFotoDocsAlumno(id) {
  const preview = document.getElementById('edit-a-foto-preview');
  const placeholder = document.getElementById('edit-a-foto-placeholder');
  try {
    const dataUrl = await window.api.getFotoAlumno(id);
    if (dataUrl) {
      preview.src = dataUrl;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      preview.src = '';
      preview.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  } catch (e) {
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
  }

  const lista = document.getElementById('edit-a-documentos-lista');
  try {
    docsAlumnoCache = await window.api.getDocumentosAlumno(id) || [];
  } catch (e) {
    docsAlumnoCache = [];
  }
  if (!docsAlumnoCache.length) {
    lista.innerHTML = '<span class="text-muted">Sin documentos</span>';
    return;
  }
  lista.innerHTML = docsAlumnoCache.map((d, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span>${esc(d.nombre)}</span>
      <span class="text-muted">(${Math.round(d.tamano / 1024)} KB)</span>
      <button type="button" class="btn btn-gray btn-sm doc-abrir" data-idx="${i}">Abrir</button>
      <button type="button" class="btn btn-gray btn-sm doc-borrar" data-idx="${i}">Borrar</button>
    </div>
  `).join('');
  lista.querySelectorAll('.doc-abrir').forEach(btn => {
    btn.addEventListener('click', () => abrirDocAlumno(docsAlumnoCache[parseInt(btn.dataset.idx)].ruta));
  });
  lista.querySelectorAll('.doc-borrar').forEach(btn => {
    btn.addEventListener('click', () => borrarDocAlumno(id, docsAlumnoCache[parseInt(btn.dataset.idx)].ruta));
  });
}

async function cambiarFotoAlumno(id, file) {
  if (!id || !file) return;
  try {
    const dataUrl = await leerFicheroComoDataUrl(file);
    const res = await window.api.guardarFotoAlumno(id, dataUrl);
    if (res && res.ok) {
      await cargarFotoDocsAlumno(id);
      showToast('edit-a-foto-alert', 'Foto actualizada.', 'ok');
    } else {
      showToast('edit-a-foto-alert', (res && res.msg) || 'No se pudo guardar la foto.', 'err');
    }
  } catch (e) {
    showToast('edit-a-foto-alert', 'No se pudo guardar la foto.', 'err');
  }
}

async function quitarFotoAlumno(id) {
  if (!id) return;
  if (!await confirmar('¿Quitar la foto de este alumno?', { peligro: true, textoAceptar: 'Quitar' })) return;
  try {
    await window.api.borrarFotoAlumno(id);
    await cargarFotoDocsAlumno(id);
  } catch (e) {
    showToast('edit-a-foto-alert', 'No se pudo quitar la foto.', 'err');
  }
}

async function adjuntarDocAlumno(id, file) {
  if (!id || !file) return;
  try {
    const dataUrl = await leerFicheroComoDataUrl(file);
    const res = await window.api.adjuntarDocumentoAlumno(id, file.name, dataUrl);
    if (res && res.ok) {
      await cargarFotoDocsAlumno(id);
      showToast('edit-a-foto-alert', 'Documento adjuntado.', 'ok');
    } else {
      showToast('edit-a-foto-alert', (res && res.msg) || 'No se pudo adjuntar el documento.', 'err');
    }
  } catch (e) {
    showToast('edit-a-foto-alert', 'No se pudo adjuntar el documento.', 'err');
  }
}

async function abrirDocAlumno(ruta) {
  try { await window.api.abrirDocumentoAlumno(ruta); } catch (e) {}
}

async function borrarDocAlumno(id, ruta) {
  if (!await confirmar('¿Borrar este documento?', { peligro: true, textoAceptar: 'Borrar' })) return;
  try {
    await window.api.borrarDocumentoAlumno(ruta);
    await cargarFotoDocsAlumno(id);
  } catch (e) {
    showToast('edit-a-foto-alert', 'No se pudo borrar el documento.', 'err');
  }
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
    estado: document.getElementById('edit-a-estado')?.value || '',
    primer_apellido: document.getElementById('edit-a-primer-apellido')?.value.trim() || '',
    segundo_apellido: document.getElementById('edit-a-segundo-apellido')?.value.trim() || '',
    codigo_postal: document.getElementById('edit-a-cp')?.value.trim() || '',
    poblacion: document.getElementById('edit-a-poblacion')?.value.trim() || ''
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
  const previo = alumnosCache.find(x => x.id === id) || {};
  const clasesPrevias = parseInt(document.getElementById('edit-a-clases-previas')?.value) || 0;
  const kmPrevios = parseInt(document.getElementById('edit-a-km-previos')?.value) || 0;
  if (clasesPrevias !== (previo.clases_previas || 0) || kmPrevios !== (previo.km_previos || 0)) {
    await window.api.setPuntoDePartidaAlumno(id, clasesPrevias, kmPrevios);
  }
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
      <td>${p.precio != null ? fmt(p.precio) + ' €' + (p.clases && p.clases < 1 ? ` <small style="color:var(--text-muted)">(${fmtClases(p.clases)} de clase)</small>` : '') : '<span style="color:var(--placeholder)">—</span>'}</td>
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

  const contConceptos = document.getElementById('economia-conceptos');
  if (contConceptos) {
    conceptosCobroCache = await getConceptosCobroUI();
    contConceptos.innerHTML = conceptosCobroCache.map((c, i) =>
      `<button class="btn btn-gray btn-sm" onclick="addCargoConcepto(${i})" title="${c.importe > 0 ? fmtEur(c.importe) : 'Sin importe fijo'}">+ ${esc(c.nombre)}</button>`).join('');
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
// rellenan y lo guardan, addCargoConcepto() lo precarga con un concepto de
// Ajustes → Cobros (conceptosCobroCache, renderer/ajustes.js). Al guardar,
// refresca renderEconomiaAlumno() para que el
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

function addCargoConcepto(i) {
  const c = conceptosCobroCache[i];
  if (!c) return;
  document.getElementById('cargo-tipo').value = c.tipo || 'cargo';
  document.getElementById('cargo-concepto').value = c.nombre;
  document.getElementById('cargo-importe').value = c.importe > 0 ? c.importe : '';
  document.getElementById('cargo-fecha').value = hoyISO();
  document.getElementById('cargo-nota').value = '';
  openModal('modal-cargo');
  if (!(c.importe > 0)) setTimeout(() => document.getElementById('cargo-importe')?.focus(), 60);
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
  if (!await confirmar('¿Borrar este cargo/descuento?', { peligro: true, textoAceptar: 'Borrar' })) return;
  await window.api.deleteCargo(id);
  await renderEconomiaAlumno();
}

// Mismo modal que Pagos → «Anotar pago» (por clases o importe); al guardar,
// savePago() refresca esta ficha si sigue abierta.
function abrirPagoEconomia() {
  const modal = document.getElementById('modal-economia-alumno');
  abrirModalPago(parseInt(modal.dataset.alumnoId), modal.dataset.alumnoNombre);
}

async function deletePagoEconomia(id) {
  if (!await confirmar('¿Borrar este pago?', { peligro: true, textoAceptar: 'Borrar' })) return;
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
  let fotoAlumno = null;
  try { desglose = await window.api.getDesglosePagosAlumno(id); } catch (e) { /* sin economía disponible */ }
  try { semaforo = await window.api.getSemaforoAlumno(id); } catch (e) { /* sin semáforo disponible */ }
  try { fotoAlumno = await window.api.getFotoAlumno(id); } catch (e) { /* sin foto disponible */ }

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
      ${fotoAlumno ? `<img src="${fotoAlumno}" alt="Foto del alumno" style="width:60px;height:60px;object-fit:cover;border-radius:6px;margin-left:auto">` : ''}
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
      ${filaFicha('Nº de prácticas', a.num_practicas != null ? fmtClases(a.num_practicas) + (a.minutos_sobrantes > 0 ? ` (+ ${fmtDec(a.minutos_sobrantes)} min acumulados)` : '') : '')}
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
      <td>${p.n || i + 1}${p.clases_txt ? ` <small>(${p.clases_txt})</small>` : ''}</td>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${esc(p.vehiculo_nombre || '—')}${p.matricula ? ` (${esc(p.matricula)})` : ''}</td>
      <td>${esc(p.profesor_nombre || '—')}</td>
      <td>${esc(TIPO_PRACTICA_TEXTO[p.tipo] || p.tipo)}</td>
      <td>${p.km_inicial}</td>
      <td>${p.km_final}</td>
      <td>${p.km_recorridos}</td>
      <td class="ficha-firma-celda">${p.firma ? `<img class="ficha-firma-img" src="${p.firma}" alt="Firma del alumno">` : ''}</td>
      <td class="ficha-firma-celda">${p.firma_profesor ? `<img class="ficha-firma-img" src="${p.firma_profesor}" alt="Firma del profesor">` : ''}</td>
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
      ${totales.clasesPrevias ? filaFicha('Clases anteriores', `${totales.clasesPrevias} clases${totales.kmPrevios ? ' · ' + totales.kmPrevios + ' km' : ''} (antes de usar la app; la numeración continúa)`) : ''}
    </div>

    <table class="ficha-tabla">
      <thead><tr>
        <th>Nº</th><th>Fecha</th><th>Vehículo</th><th>Profesor</th><th>Tipo</th>
        <th>Km inicial</th><th>Km final</th><th>Km recorridos</th><th>Firma alumno</th><th>Firma profesor</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="10" style="text-align:center">No hay clases prácticas registradas</td></tr>'}</tbody>
      <tfoot><tr>
        <td colspan="7" style="text-align:right"><strong>Totales</strong></td>
        <td><strong>${fmtClases(totales.nClases)} clase${totales.nClases === 1 ? '' : 's'}</strong></td>
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

// ─── FICHA DGT (impreso oficial de formación práctica) ─────────────────────
// Modal pequeño para elegir destreza/circulación (#modal-ficha-dgt) y llamar
// a window.api.generarFichaDGT (IPC 'generar-ficha-dgt' → fichas-dgt.js). Los
// datos del centro se leen de Ajustes (getCentroDatos, renderer/ajustes.js);
// si están vacíos se avisa pero se deja continuar igualmente.
const FICHA_FIRMAR_PIE_KEY = 'km_ficha_firmar_pie';

async function abrirFichaDGT(alumnoId) {
  document.getElementById('ficha-dgt-alumno-id').value = alumnoId;
  const rDestreza = document.querySelector('input[name="ficha-dgt-tipo"][value="destreza"]');
  if (rDestreza) rDestreza.checked = true;
  // Firmar el pie (certificado): se recuerda lo último elegido en este PC
  let firmarPie = true;
  try { firmarPie = localStorage.getItem(FICHA_FIRMAR_PIE_KEY) !== '0'; } catch (e) {}
  document.getElementById('ficha-dgt-firmar-pie').checked = firmarPie;
  const aviso = document.getElementById('ficha-dgt-aviso');
  const centro = (typeof getCentroDatos === 'function') ? getCentroDatos() : {};
  if (!centro.denominacion) {
    aviso.textContent = 'No has rellenado "Datos del centro (DGT)" en Ajustes. Puedes generar la ficha igualmente, pero saldrá sin esos datos.';
    aviso.classList.remove('hidden');
  } else {
    aviso.classList.add('hidden');
  }
  openModal('modal-ficha-dgt');
}

async function generarFichaDGTUI(firmasYaPedidas = false) {
  const alumnoId = parseInt(document.getElementById('ficha-dgt-alumno-id').value);
  const tipo = document.querySelector('input[name="ficha-dgt-tipo"]:checked')?.value || 'destreza';
  const centro = (typeof getCentroDatos === 'function') ? getCentroDatos() : {};
  // Preferencia de Ajustes: rellenar o no la fecha del documento (pie de la
  // ficha; por defecto true, solo se omite si el usuario la desmarcó).
  const rellenarFecha = centro.rellenar_fecha !== false;
  const firmarPie = document.getElementById('ficha-dgt-firmar-pie').checked;
  try { localStorage.setItem(FICHA_FIRMAR_PIE_KEY, firmarPie ? '1' : '0'); } catch (e) {}
  const r = await window.api.generarFichaDGT({ alumnoId, tipo, centro, rellenarFecha, firmarPie, comprobarFirmas: !firmasYaPedidas });
  // El profesor de estas clases (o el del pie) o el director aún no han
  // guardado su firma: se les pide ahora (una vez; sirve para todas las
  // fichas) o se saca sin ella.
  if (r && (r.faltanFirmas || r.faltaDirector)) {
    for (const pf of r.faltanFirmas || []) {
      const firmar = await confirmar(`${pf.nombre} todavía no ha guardado su firma, así que la casilla «Firma del profesor» saldría en blanco.

Si firma ahora, se guarda y sale en todas sus clases (también en las fichas de los demás alumnos).`,
        { titulo: 'Falta la firma del profesor', textoAceptar: 'Firmar ahora', textoCancelar: 'Sacar sin su firma' });
      if (firmar) await abrirFirmaProfesor(pf.id, { textoGuardar: 'Guardar firma y seguir', textoCerrar: 'Seguir sin firma' });
    }
    if (r.faltaDirector) {
      const firmar = await confirmar(r.director
        ? `${r.director}, el director del centro, todavía no ha guardado su firma, así que «Firma del Director» (pie de la ficha) saldría en blanco.

Si firma ahora, se guarda y sale en todas las fichas.`
        : `Todavía no has indicado quién es el director del centro, así que «Firma del Director» (pie de la ficha) saldría en blanco.

Crea su perfil y su firma una vez y saldrá en todas las fichas. Si no quieres firmar el pie, desmarca «Firmar el certificado del pie».`,
        { titulo: 'Falta la firma del director', textoAceptar: r.director ? 'Firmar ahora' : 'Crear perfil y firmar', textoCancelar: 'Sacar sin su firma' });
      if (firmar) await abrirPerfilDirector({ textoGuardar: 'Guardar y seguir', textoCerrar: 'Seguir sin firma' });
    }
    return generarFichaDGTUI(true);
  }
  if (r && r.ok) {
    closeModal('modal-ficha-dgt');
    const sinFirma = r.sinFirmaAlumno ? `

${r.sinFirmaAlumno} de ${r.dias} ${r.dias === 1 ? 'día no tiene' : 'días no tienen'} firma del alumno (se registraron sin firmar en el móvil): esas casillas quedan en blanco para firmarlas a mano.` : '';
    await avisar(`Ficha generada (${fmtClases(r.nClases)} ${r.nClases === 1 ? 'clase' : 'clases'}).${sinFirma}`);
  } else if (!r || !r.canceled) {
    await avisar((r && r.msg) || 'No se pudo generar la ficha.');
  }
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

