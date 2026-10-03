// ─── ALUMNOS ─────────────────────────────────────────────────────────────────
// Listado, filtros, ordenación, CRUD y anotaciones de alumnos.

// Etiquetas del ciclo de estados ampliado (tarea B1 del PLAN-MAESTRO):
// matriculado → en teórica → apto teórico → en prácticas → presentado →
// apto/no apto, más baja e inactivo (dejó de venir sin darse de baja: los
// archivados de Ariauto). activo/aprobado se conservan (legacy) para que
// alumnos ya guardados con esos valores sigan mostrando su etiqueta.
const ESTADO_ALUMNO_TEXTO = {
  matriculado: 'Matriculado', en_teorica: 'En teórica', apto_teorico: 'Apto teórico',
  en_practicas: 'En prácticas', presentado: 'Presentado a examen', apto: 'Apto (aprobado)',
  no_apto: 'No apto', baja: 'Baja', inactivo: 'Inactivo', activo: 'Activo', aprobado: 'Aprobado'
};

// ─── ALUMNOS ─────────────────────────────────────────────────────────────────
async function loadVehiculosSelect() {
  vehiculosCache = await window.api.getVehiculos();
  ['a-vehiculo'].forEach(selId => {
    const sel = document.getElementById(selId);
    sel.innerHTML = '<option value="">-- Sin asignar --</option>';
    vehiculosCache.filter(v => v.activo !== false).forEach(v => {
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
  const [lista, semaforo] = await Promise.all([
    window.api.getAlumnosLista(getSucursalActual()),
    // Semáforo de examen: una sola llamada para todos los alumnos (evita N+1),
    // cruzado por alumno_id en un Map para pintar la pastilla de cada fila.
    window.api.getSemaforoExamen().catch(() => [])
  ]);
  semaforoCache = new Map((semaforo || []).map(s => [s.alumno_id, s]));
  // Con miles de alumnos, lo que cuesta se calcula una vez aquí y no en cada
  // tecla: el texto en el que busca el buscador y en qué pestañas sale.
  const hoy = hoyISO();
  for (const a of lista) {
    a._busca = sinTildes([a.nombre, a.primer_apellido, a.segundo_apellido, a.dni, a.n_registro, a.telefono, a.telefono2, a.email, a.poblacion].filter(Boolean).join(' '));
    a._telDigitos = [a.telefono, a.telefono2].filter(Boolean).join(' ').replace(/\D/g, '');
    a._tabs = {};
    for (const [t, pred] of Object.entries(PREDICADOS_TAB_ALUMNOS)) a._tabs[t] = pred(a, hoy);
  }
  alumnosCache = lista;
  alumnosConteoTabs = Object.fromEntries(Object.keys(PREDICADOS_TAB_ALUMNOS).map(t => [t, lista.filter(a => a._tabs[t]).length]));
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
    .sort((x, y) => COLLATOR_ES.compare(x[1], y[1]));

  selVehiculo.innerHTML = '<option value="">Todos los vehículos</option>' +
    vehiculosOpts.map(([id, nombre]) => `<option value="${id}">${esc(nombre)}</option>`).join('') +
    (haySinAsignar ? '<option value="none">Sin asignar</option>' : '');

  const permisosOpts = [...new Set(alumnosCache.map(a => a.permiso).filter(Boolean))]
    .sort((a, b) => COLLATOR_ES.compare(a, b));
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
      .sort((x, y) => COLLATOR_ES.compare(x[1], y[1]));
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
// 'inactivo': alumno antiguo que dejó de venir (los archivados de Ariauto).
const ESTADOS_FUERA_DE_PRACTICAS = ['baja', 'aprobado', 'apto', 'no_apto', 'inactivo'];
const alumnoActivo = a => !ESTADOS_FUERA_DE_PRACTICAS.includes(a.estado || 'activo');
const DIAS_SIN_CLASE_RIESGO = 30;
const DIAS_ALUMNO_NUEVO = 30;
const PREDICADOS_TAB_ALUMNOS = {
  activos: a => alumnoActivo(a),
  examen: a => !!a.proximo_examen,
  riesgo: (a, hoy = hoyISO()) => alumnoActivo(a) && a.num_practicas > 0 && a.ultima_fecha && diasEntre(a.ultima_fecha, hoy) > DIAS_SIN_CLASE_RIESGO,
  nuevos: (a, hoy = hoyISO()) => alumnoActivo(a) && (a.num_practicas === 0 || (a.fecha_alta && diasEntre(a.fecha_alta, hoy) <= DIAS_ALUMNO_NUEVO)),
  todos: () => true
};
let alumnosConteoTabs = {};
const enTabAlumnos = (a, tab) => (a._tabs ? a._tabs[tab] : PREDICADOS_TAB_ALUMNOS[tab](a));

function cambiarTabAlumnos(tab) {
  alumnosTab = tab;
  renderAlumnosTabla();
}

function pintarTabsAlumnos() {
  const nombres = { activos: 'En prácticas', examen: 'Con examen', riesgo: 'Sin clase', nuevos: 'Nuevos', todos: 'Todos' };
  document.querySelectorAll('#alumnos-tabs button').forEach(btn => {
    const t = btn.dataset.tab;
    const n = alumnosConteoTabs[t] ?? alumnosCache.filter(a => enTabAlumnos(a, t)).length;
    btn.innerHTML = `${nombres[t]} <span class="seg-n">· ${fmtMiles(n)}</span>`;
    btn.setAttribute('aria-pressed', t === alumnosTab ? 'true' : 'false');
    if (t === 'riesgo') btn.title = `Alumnos en prácticas que llevan más de ${DIAS_SIN_CLASE_RIESGO} días sin dar clase`;
  });
  const resumen = document.getElementById('alumnos-resumen');
  if (resumen) resumen.textContent = `${fmtMiles(alumnosConteoTabs.activos ?? 0)} en prácticas · ${fmtMiles(alumnosCache.length)} en total`;
}

// Pastilla de estado: lo más útil de un vistazo (en clase > final de ciclo > examen > nuevo > estado).
function pillEstadoAlumno(a) {
  const estado = a.estado || 'activo';
  if (a.en_clase_ahora) return '<span class="pill pill-dark"><span class="pill-dot"></span>En clase ahora</span>';
  if (estado === 'baja' || estado === 'no_apto') return `<span class="pill pill-err">${esc(ESTADO_ALUMNO_TEXTO[estado])}</span>`;
  if (estado === 'apto' || estado === 'aprobado') return `<span class="pill pill-ok">${esc(ESTADO_ALUMNO_TEXTO[estado])}</span>`;
  if (estado === 'inactivo') return `<span class="pill pill-line" title="Dejó de venir sin darse de baja">${esc(ESTADO_ALUMNO_TEXTO[estado])}</span>`;
  if (a.proximo_examen) return '<span class="pill pill-info"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>Examen programado</span>';
  if (enTabAlumnos(a, 'nuevos') && a.num_practicas === 0) return '<span class="pill pill-line">Nuevo</span>';
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
  ficha: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  retirar: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>'
};
const svgMini = k => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG_MINI[k]}</svg>`;

// El buscador espera a que se deje de teclear (con miles de alumnos, repintar
// en cada letra se notaba).
const filtrarAlumnosPronto = retrasar(() => renderAlumnosTabla(), 120);

// Alumnos que se ven con los filtros, pestaña y orden actuales
function alumnosFiltrados() {
  const texto = sinTildes((document.getElementById('f-alumnos-nombre')?.value || '').trim());
  const palabras = texto ? texto.split(/\s+/) : [];
  const digitos = texto.replace(/\D/g, '');
  const vehiculoFiltro = document.getElementById('f-alumnos-vehiculo')?.value || '';
  const permisoFiltro = document.getElementById('f-alumnos-permiso')?.value || '';
  const profesorFiltro = document.getElementById('f-alumnos-profesor')?.value || '';
  const estadoFiltro = document.getElementById('f-alumnos-estado')?.value || '';

  let filtrados = alumnosCache.filter(a => {
    if (!enTabAlumnos(a, alumnosTab)) return false;
    // El texto busca en nombre y apellidos, DNI, nº de registro, teléfonos,
    // email y población (todas las palabras, sin importar tildes); un número
    // de teléfono escrito con espacios también se encuentra.
    if (palabras.length) {
      const busca = a._busca || sinTildes([a.nombre, a.primer_apellido, a.segundo_apellido, a.dni, a.n_registro, a.telefono].join(' '));
      if (!palabras.every(w => busca.includes(w)) && !(digitos.length >= 6 && (a._telDigitos || '').includes(digitos))) return false;
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
    filtrados = filtrados.slice().sort((a, b) => {
      if (col === 'practicas') return (a.num_practicas - b.num_practicas) * dir;
      if (col === 'km') return ((a.km_total || 0) - (b.km_total || 0)) * dir;
      if (col === 'ultima') return ((a.ultima_fecha || '') < (b.ultima_fecha || '') ? -1 : (a.ultima_fecha || '') > (b.ultima_fecha || '') ? 1 : 0) * dir;
      if (col === 'examen') {
        // Con examen primero (el más cercano arriba); sin examen al final, por nombre.
        const ea = a.proximo_examen ? a.proximo_examen.fecha : '9999-12-31';
        const eb = b.proximo_examen ? b.proximo_examen.fecha : '9999-12-31';
        return (ea.localeCompare(eb) || COLLATOR_ES.compare(a.nombre || '', b.nombre || '')) * dir;
      }
      let va = '', vb = '';
      if (col === 'nombre') { va = a.nombre || ''; vb = b.nombre || ''; }
      else if (col === 'permiso') { va = a.permiso || ''; vb = b.permiso || ''; }
      else if (col === 'vehiculo') { va = a.vehiculo_nombre || ''; vb = b.vehiculo_nombre || ''; }
      else if (col === 'profesor') { va = a.profesor_nombre || ''; vb = b.profesor_nombre || ''; }
      else if (col === 'estado') { va = a.estado || 'activo'; vb = b.estado || 'activo'; }
      else if (col === 'registro') { va = a.n_registro || ''; vb = b.n_registro || ''; }
      return COLLATOR_ES.compare(va, vb) * dir;
    });
  }
  return filtrados;
}

function filaAlumnoHTML(a) {
  const semTexto = { verde: 'Listo', ambar: 'Casi', rojo: 'Lejos' };
  const guion = '<span style="color:var(--text-faint)">—</span>';
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
      <td class="col-num col-reg">${a.n_registro ? esc(a.n_registro) : guion}</td>
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
        <button class="btn btn-primary btn-sm" onclick="verPracticas(${a.id},${a.vehiculo_id || 'null'},'${nombreArg}')" title="Ficha del alumno: datos, historial de prácticas y km">${svgMini('ficha')} Ficha</button>
        <details class="menu-fila">
          <summary class="btn btn-gray btn-sm btn-icon" title="Más acciones" aria-label="Más acciones"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary>
          <div class="menu-fila-lista">
            <button type="button" onclick="verAnotaciones(${a.id},'${nombreArg}')">${svgMini('nota')} Anotaciones</button>
            <button type="button" onclick="abrirEconomiaAlumno(${a.id},'${nombreArg}')">${svgMini('euro')} Economía</button>
            <button type="button" onclick="openEditAlumno(${a.id})">${svgMini('editar')} Editar datos</button>
            <button type="button" class="menu-fila-borrar" onclick="deleteAlumno(${a.id},'${nombreArg}')">${svgMini('borrar')} Borrar</button>
          </div>
        </details>
      </td>
    </tr>`;
}

function renderAlumnosTabla() {
  const tbody = document.querySelector('#tabla-alumnos tbody');
  pintarTabsAlumnos();
  const filtrados = alumnosFiltrados();
  actualizarIndicadoresOrdenAlumnos();

  const pie = document.getElementById('alumnos-pie');
  const NOMBRE_ORDEN = { examen: 'próximo examen', nombre: 'nombre', practicas: 'clases', km: 'km', ultima: 'última práctica', profesor: 'profesor', estado: 'estado', permiso: 'permiso', vehiculo: 'vehículo', registro: 'nº de registro' };
  const { col } = alumnosSort;
  if (pie) pie.innerHTML = `<span>Mostrando ${fmtMiles(filtrados.length)} de ${fmtMiles(alumnosCache.length)} alumnos</span><span>${col ? 'Ordenado por ' + (NOMBRE_ORDEN[col] || col) : ''}</span>`;

  if (!alumnosCache.length) {
    pintarPorTandas(tbody, [], () => '');
    tbody.innerHTML = '<tr><td colspan="10" class="empty">No hay alumnos registrados</td></tr>';
    return;
  }
  if (!filtrados.length) {
    pintarPorTandas(tbody, [], () => '');
    tbody.innerHTML = '<tr><td colspan="10" class="empty">Ningún alumno coincide con los filtros</td></tr>';
    return;
  }
  // Las primeras filas al momento; el resto según se baja (miles de alumnos)
  pintarPorTandas(tbody, filtrados, filaAlumnoHTML, { tanda: 60, columnas: 9 });
}

// Exportar la lista (lo que se ve con los filtros) con todos los datos de cada alumno
async function exportarAlumnosUI() {
  const ids = alumnosFiltrados().map(a => a.id);
  if (!ids.length) { avisar('No hay alumnos que exportar con estos filtros.'); return; }
  const r = await window.api.exportarTabla('alumnos', { ids });
  if (r && r.ok) showToast('alumnos-alta-toast', `Exportados ${fmtMiles(r.total)} alumnos con todos sus datos: ${r.path}`, 'ok');
  else if (r && !r.canceled) avisar('No se pudo exportar: ' + (r.msg || 'error desconocido'));
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
  const nRegistro = document.getElementById('a-n-registro')?.value.trim() || '';
  const datos = {
    // Vacío a propósito = sin número (no se pone el siguiente solo)
    n_registro: nRegistro,
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
  if (nRegistro) {
    const otro = await window.api.getAlumnoConNRegistro(nRegistro);
    if (otro && !await confirmar(`El nº de registro ${nRegistro} ya lo tiene ${otro.nombre}. ¿Darlo de alta con el mismo número?`, { textoAceptar: 'Sí, repetirlo' })) {
      document.getElementById('a-n-registro').focus();
      return;
    }
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
  document.getElementById('a-n-registro').value = '';
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

// Al elegir el profesor, el coche asignado pasa a ser su coche habitual (si
// aún no se había elegido otro).
async function altaProfesorCambiado() {
  const pid = document.getElementById('a-profesor')?.value;
  const sel = document.getElementById('a-vehiculo');
  if (!pid || !sel || sel.value) return;
  const vid = await window.api.getVehiculoDeProfesor(parseInt(pid)).catch(() => null);
  if (vid && [...sel.options].some(o => o.value === String(vid))) sel.value = String(vid);
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
  // El siguiente nº de registro (si ya hay numeración: tras traer los alumnos
  // del programa anterior o con el primero escrito a mano)
  const nReg = document.getElementById('a-n-registro');
  if (nReg && !nReg.value) {
    const sig = await window.api.getSiguienteNRegistro().catch(() => null);
    nReg.value = sig || '';
    nReg.placeholder = sig ? 'Nº' : 'Ej. 1';
  }
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

// ─── DATOS DEL ALUMNO EN SU FICHA (ver y editar en el sitio) ────────────────
// Todos los datos del alumno en una tarjeta de su ficha, agrupados. «Editar»
// convierte la tarjeta en un formulario ahí mismo (sin modal, sin salir de la
// ficha) y «Guardar» manda solo lo que ha cambiado (db.updateAlumnoCampos).
// La foto y los documentos adjuntos viven en la misma tarjeta.
const PERMISOS_FICHA = ['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE', 'CAP', 'ADR'];
const PERMISOS_OTROS = ['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C1', 'C', 'D1', 'D', 'CAP', 'ADR'];
const RESULTADO_ALUMNO_TEXTO = { apto: 'Apto', no_apto: 'No apto', baja: 'Baja' };
const FD_GRUPOS = [
  { titulo: 'Identidad', campos: [
    { c: 'nombre', l: 'Nombre', req: true }, { c: 'primer_apellido', l: 'Primer apellido' }, { c: 'segundo_apellido', l: 'Segundo apellido' },
    { c: 'n_registro', l: 'Nº de registro' }, { c: 'dni', l: 'DNI / NIE' }, { c: 'dni_caducidad', l: 'Caduca el DNI', t: 'fecha' },
    { c: 'sexo', l: 'Sexo', t: 'select', op: [['', '—'], ['H', 'Hombre'], ['M', 'Mujer']] },
    { c: 'fecha_nacimiento', l: 'Nacimiento', t: 'fecha' }, { c: 'lugar_nacimiento', l: 'Lugar de nacimiento' }, { c: 'nacionalidad', l: 'Nacionalidad' }] },
  { titulo: 'Contacto y domicilio', campos: [
    { c: 'telefono', l: 'Teléfono', t: 'tel' }, { c: 'telefono2', l: 'Otro teléfono', t: 'tel' }, { c: 'email', l: 'Email', t: 'email' },
    { c: 'direccion', l: 'Dirección', ancho: true }, { c: 'codigo_postal', l: 'Código postal' }, { c: 'poblacion', l: 'Población' },
    { c: 'municipio', l: 'Municipio' }, { c: 'provincia', l: 'Provincia' }] },
  { titulo: 'Formación', campos: [
    { c: 'permiso', l: 'Permiso', t: 'select', op: () => PERMISOS_FICHA.map(p => [p, p]) },
    { c: 'permisos', l: 'Otros permisos', t: 'permisos', ancho: true }, { c: 'permisos_posee', l: 'Permisos que ya tiene' },
    { c: 'estado', l: 'Estado', t: 'select', op: () => Object.entries(ESTADO_ALUMNO_TEXTO) },
    { c: 'profesor_id', l: 'Profesor', t: 'profesor' }, { c: 'vehiculo_id', l: 'Coche', t: 'vehiculo' },
    { c: 'fecha_alta', l: 'Alta', t: 'fecha' }, { c: 'fecha_teorico', l: 'Teórico aprobado', t: 'fecha' }, { c: 'fecha_fin', l: 'Fin de la enseñanza', t: 'fecha' },
    { c: 'resultado', l: 'Resultado final', t: 'select', op: [['', '—'], ['apto', 'Apto'], ['no_apto', 'No apto'], ['baja', 'Baja']] },
    { c: 'n_solicitud', l: 'Nº de solicitud', t: 'num', ayuda: 'Solicitud del expediente en Tráfico' }, { c: 'convocatoria', l: 'Convocatoria', t: 'num' },
    { c: 'clases_previas', l: 'Clases antes de la app', t: 'num', ayuda: 'Punto de partida: la numeración de clases y los totales continúan desde aquí' },
    { c: 'km_previos', l: 'Km antes de la app', t: 'num' }] },
  { titulo: 'Salud, tutor y facturación', campos: [
    { c: 'centro_medico', l: 'Centro médico' }, { c: 'restricciones', l: 'Restricciones', ayuda: 'Lentes, condiciones restrictivas, validez limitada…' },
    { c: 'tutor_nombre', l: 'Tutor' }, { c: 'tutor_dni', l: 'DNI del tutor' },
    { c: 'factura_nombre', l: 'Facturar a' }, { c: 'factura_nif', l: 'NIF factura' }, { c: 'factura_direccion', l: 'Dirección factura', ancho: true }] },
  { titulo: 'Observaciones', ancho: true, campos: [{ c: 'observaciones', l: 'Observaciones', t: 'texto', ancho: true }] }
];
const FD_PUNTO_PARTIDA = ['clases_previas', 'km_previos'];
let fdEditando = false;
let fdAbrirEditando = false; // «Editar datos» desde la lista: la ficha se abre ya editando
let fdListas = { profesores: [], vehiculos: [] };

// Valor tal y como se lee en la ficha
function fdValorTexto(a, campo) {
  const v = a[campo.c];
  const vacio = v == null || v === '' || (Array.isArray(v) && !v.length);
  if (campo.c === 'profesor_id') return a.profesor_nombre ? esc(a.profesor_nombre) : null;
  if (campo.c === 'vehiculo_id') return a.vehiculo_nombre ? `${esc(a.vehiculo_nombre)}${a.vehiculo_matricula ? ' · ' + esc(a.vehiculo_matricula) : ''}` : null;
  if (FD_PUNTO_PARTIDA.includes(campo.c)) return v > 0 ? fmtMiles(v) : null;
  if (vacio) return null;
  if (campo.c === 'dni_caducidad') {
    const dias = diasEntre(hoyISO(), v);
    if (dias < 0) return `<span class="fd-mal">${fmtFecha(v)} · caducado</span>`;
    if (dias <= 60) return `<span class="fd-aviso">${fmtFecha(v)} · caduca pronto</span>`;
    return fmtFecha(v);
  }
  if (campo.t === 'fecha') return fmtFecha(v);
  if (campo.c === 'sexo') return v === 'H' ? 'Hombre' : v === 'M' ? 'Mujer' : esc(v);
  if (campo.c === 'estado') return esc(ESTADO_ALUMNO_TEXTO[v] || v);
  if (campo.c === 'resultado') return esc(RESULTADO_ALUMNO_TEXTO[v] || v);
  if (campo.c === 'convocatoria') return `${v}ª`;
  if (campo.c === 'permisos') return v.map(p => tagPermiso(p)).join(' ');
  if (campo.c === 'permiso') return tagPermiso(v);
  if (campo.c === 'observaciones') return `<span class="fd-obs">${esc(v).replace(/\n/g, '<br>')}</span>`;
  return esc(v);
}

function fdEntrada(a, campo) {
  const id = `fd-${campo.c}`;
  const v = a[campo.c];
  const val = v == null ? '' : String(v);
  const attr = `id="${id}" data-campo="${campo.c}"`;
  const opciones = (lista, actual) => lista.map(([k, t]) => `<option value="${esc(k)}"${String(k) === String(actual ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('');
  switch (campo.t) {
    case 'fecha': return `<input type="date" ${attr} value="${esc(val)}">`;
    case 'num': return `<input type="number" min="0" ${attr} value="${v > 0 ? v : ''}" placeholder="0">`;
    case 'tel': return `<input type="tel" ${attr} value="${esc(val)}">`;
    case 'email': return `<input type="email" ${attr} value="${esc(val)}" placeholder="alumno@email.com">`;
    case 'texto': return `<textarea ${attr} rows="3" placeholder="Notas sobre el alumno…">${esc(val)}</textarea>`;
    case 'select': {
      let lista = typeof campo.op === 'function' ? campo.op() : campo.op;
      if (val && !lista.some(([k]) => String(k) === val)) lista = [...lista, [val, val]];
      return `<select ${attr}>${opciones(lista, val)}</select>`;
    }
    case 'profesor': {
      const lista = [['', '— Sin profesor —'], ...fdListas.profesores.map(p => [String(p.id), p.nombre])];
      return `<select ${attr}>${opciones(lista, a.profesor_id || '')}</select>`;
    }
    case 'vehiculo': {
      // Los retirados no se ofrecen (salvo el que ya tenga asignado)
      const coches = fdListas.vehiculos.filter(x => x.activo !== false || x.id === a.vehiculo_id);
      const lista = [['', '— Sin asignar —'], ...coches.map(x => [String(x.id), `${x.nombre}${x.matricula ? ' (' + x.matricula + ')' : ''}${x.activo === false ? ' · retirado' : ''}`])];
      return `<select ${attr}>${opciones(lista, a.vehiculo_id || '')}</select>`;
    }
    case 'permisos': {
      const set = new Set(v || []);
      return `<div class="permisos-checks" ${attr}>${PERMISOS_OTROS.map(p => `<label><input type="checkbox" value="${p}"${set.has(p) ? ' checked' : ''}> ${p}</label>`).join('')}</div>`;
    }
    default: return `<input type="text" ${attr} value="${esc(val)}"${campo.req ? ' required' : ''}>`;
  }
}

function pintarDatosFicha(f) {
  const cont = document.getElementById('ficha-datos');
  if (!cont) return;
  const a = f.alumno;
  const lapiz = '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>';
  if (!fdEditando) {
    const plegada = fdPlegada();
    const botones = `<div class="fd-acciones"><button type="button" class="btn btn-outline btn-sm" onclick="editarDatosFicha()">${fichaSvg(lapiz, 14)}Editar</button>
      <button type="button" class="btn btn-gray btn-sm" onclick="plegarDatosFicha(${!plegada})" aria-expanded="${!plegada}">${plegada ? 'Ver todos' : 'Ocultar'}</button></div>`;
    if (plegada) {
      const resumen = [a.n_registro && `Nº ${esc(a.n_registro)}`, a.dni && `DNI ${esc(a.dni)}`, a.telefono && esc(a.telefono), a.email && esc(a.email),
        [a.poblacion, a.provincia].filter(Boolean).map(esc).join(', '), a.nacionalidad && esc(a.nacionalidad)].filter(Boolean).join(' · ');
      cont.innerHTML = `<div class="card-head" style="margin:0"><h2 id="h-ficha-datos">Datos del alumno</h2>${botones}</div>
        <div class="fd-resumen">${resumen || '<span class="fd-vacio">Sin datos personales</span>'}</div><div id="fd-alerta" class="hidden" style="margin-top:10px"></div>`;
      return;
    }
    const grupos = FD_GRUPOS.map(g => {
      if (g.campos[0].c === 'observaciones') {
        const t = fdValorTexto(a, g.campos[0]);
        return `<div class="fd-grupo fd-ancho"><h3>${g.titulo}</h3>${t || '<span class="fd-vacio">Sin observaciones</span>'}</div>`;
      }
      const filas = g.campos.map(c => {
        const t = fdValorTexto(a, c);
        return `<dt>${c.l}</dt><dd${t ? '' : ' class="fd-vacio"'}>${t || '—'}</dd>`;
      }).join('');
      return `<div class="fd-grupo"><h3>${g.titulo}</h3><dl class="fd-lista">${filas}</dl></div>`;
    }).join('');
    cont.innerHTML = `<div class="card-head"><h2 id="h-ficha-datos">Datos del alumno</h2>${botones}</div>
      <div class="fd-grupos">${grupos}
        <div class="fd-grupo"><h3>Foto y documentos</h3><div id="fd-foto-docs" class="fd-foto-docs"><span class="fd-vacio">Cargando…</span></div></div>
      </div>
      <div id="fd-alerta" class="hidden" style="margin-top:10px"></div>`;
    cargarFotoDocsAlumno(a.id);
    return;
  }
  const grupos = FD_GRUPOS.map(g => `<fieldset class="fd-grupo${g.ancho ? ' fd-ancho' : ''}"><legend>${g.titulo}</legend><div class="fd-form">${g.campos.map(c =>
    `<div class="form-group${c.ancho ? ' fd-campo-ancho' : ''}"><label for="fd-${c.c}"${c.ayuda ? ` title="${esc(c.ayuda)}"` : ''}>${c.l}${c.req ? ' *' : ''}</label>${fdEntrada(a, c)}</div>`).join('')}</div></fieldset>`).join('');
  cont.innerHTML = `<div class="card-head"><h2 id="h-ficha-datos">Editar datos del alumno</h2>
      <div class="fd-acciones"><button type="button" class="btn btn-gray btn-sm" onclick="cancelarDatosFicha()">Cancelar</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="guardarDatosFicha()">Guardar cambios</button></div></div>
    <form class="fd-grupos fd-editando" onsubmit="event.preventDefault(); guardarDatosFicha()">${grupos}<button type="submit" hidden></button></form>
    <div id="fd-alerta" class="hidden" style="margin-top:10px"></div>
    <div class="fd-pie"><span>Intro guarda · Esc cancela</span><div class="fd-acciones"><button type="button" class="btn btn-gray btn-sm" onclick="cancelarDatosFicha()">Cancelar</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="guardarDatosFicha()">Guardar cambios</button></div></div>`;
  cont.querySelector('form').addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); cancelarDatosFicha(); } });
}

// Plegar la tarjeta de datos (se recuerda en este PC)
const FD_PLEGADA_KEY = 'km_ficha_datos_plegada';
function fdPlegada() { try { return localStorage.getItem(FD_PLEGADA_KEY) === '1'; } catch (e) { return false; } }
function plegarDatosFicha(plegar) {
  try { localStorage.setItem(FD_PLEGADA_KEY, plegar ? '1' : '0'); } catch (e) { /* sin almacenamiento: solo esta vez */ }
  if (fichaCache) pintarDatosFicha(fichaCache);
}

async function editarDatosFicha() {
  if (!fichaCache) return;
  try {
    const [profesores, vehiculos] = await Promise.all([window.api.getProfesores(), window.api.getVehiculos()]);
    fdListas = { profesores, vehiculos };
  } catch (e) { /* sin listas: los desplegables salen vacíos */ }
  fdEditando = true;
  pintarDatosFicha(fichaCache);
  const card = document.getElementById('ficha-datos');
  card.scrollIntoView({ block: 'start', behavior: 'smooth' });
  setTimeout(() => document.getElementById('fd-nombre')?.focus(), 250);
}

function cancelarDatosFicha() {
  fdEditando = false;
  if (fichaCache) pintarDatosFicha(fichaCache);
}

function fdLeerValor(el) {
  if (el.classList.contains('permisos-checks')) return [...el.querySelectorAll('input:checked')].map(x => x.value);
  return el.value.trim();
}

async function guardarDatosFicha() {
  if (!fichaCache) return;
  const a = fichaCache.alumno;
  const cambios = {};
  let previasCambiadas = false;
  document.querySelectorAll('#ficha-datos [data-campo]').forEach(el => {
    const c = el.dataset.campo;
    const nuevo = fdLeerValor(el);
    const viejo = a[c];
    if (Array.isArray(nuevo)) {
      if (JSON.stringify([...nuevo].sort()) !== JSON.stringify([...(viejo || [])].sort())) cambios[c] = nuevo;
      return;
    }
    if (FD_PUNTO_PARTIDA.includes(c)) {
      if ((parseInt(nuevo) || 0) !== (viejo || 0)) previasCambiadas = true;
      return;
    }
    if (String(nuevo) !== String(viejo ?? '')) cambios[c] = nuevo;
  });
  if ('nombre' in cambios && !cambios.nombre) { showToast('fd-alerta', 'El nombre no puede quedar vacío.', 'err'); document.getElementById('fd-nombre')?.focus(); return; }
  if ('email' in cambios && !emailValido(cambios.email)) { showToast('fd-alerta', 'El email no tiene un formato válido.', 'err'); document.getElementById('fd-email')?.focus(); return; }
  if (!Object.keys(cambios).length && !previasCambiadas) { cancelarDatosFicha(); return; }
  if (cambios.n_registro) {
    const otro = await window.api.getAlumnoConNRegistro(cambios.n_registro, a.id);
    if (otro && !await confirmar(`El nº de registro ${cambios.n_registro} ya lo tiene ${otro.nombre}. ¿Guardarlo igualmente?`, { textoAceptar: 'Sí, repetirlo' })) {
      document.getElementById('fd-n_registro')?.focus();
      return;
    }
  }
  if (Object.keys(cambios).length) {
    const r = await window.api.updateAlumnoCampos(a.id, cambios);
    if (!r || !r.ok) { showToast('fd-alerta', (r && r.error) || 'No se pudieron guardar los cambios.', 'err'); return; }
  }
  if (previasCambiadas) {
    const clases = parseInt(document.getElementById('fd-clases_previas')?.value) || 0;
    const km = parseInt(document.getElementById('fd-km_previos')?.value) || 0;
    await window.api.setPuntoDePartidaAlumno(a.id, clases, km);
  }
  fdEditando = false;
  await loadPracticas();
  showToast('fd-alerta', 'Datos guardados.', 'ok');
}

// «Editar datos» de la lista de alumnos: abre su ficha ya editando
async function openEditAlumno(id) {
  const a = alumnosCache.find(x => x.id === id);
  fdAbrirEditando = true;
  verPracticas(id, a ? a.vehiculo_id : null, a ? a.nombre : '');
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
  const cont = document.getElementById('fd-foto-docs');
  if (!cont) return;
  let foto = null;
  try { foto = await window.api.getFotoAlumno(id); } catch (e) { foto = null; }
  try { docsAlumnoCache = await window.api.getDocumentosAlumno(id) || []; } catch (e) { docsAlumnoCache = []; }
  // La foto también en el avatar de la cabecera
  const avatar = document.querySelector('#ficha-cab .avatar-ini-lg');
  if (avatar) avatar.innerHTML = foto ? `<img src="${foto}" alt="" class="avatar-foto">` : esc(avatar.dataset.ini || avatar.textContent);
  if (!document.getElementById('fd-foto-docs') || currentAlumnoId !== id) return;
  const docs = docsAlumnoCache.length
    ? docsAlumnoCache.map((d, i) => `<div class="fd-doc"><span title="${esc(d.nombre)}">${esc(d.nombre)}</span><small>${Math.max(1, Math.round(d.tamano / 1024))} KB</small>
        <button type="button" class="btn btn-gray btn-sm" onclick="abrirDocAlumno(docsAlumnoCache[${i}].ruta)">Abrir</button>
        <button type="button" class="btn btn-gray btn-sm" onclick="borrarDocAlumno(${id}, docsAlumnoCache[${i}].ruta)">Borrar</button></div>`).join('')
    : '<span class="fd-vacio">Sin documentos</span>';
  cont.innerHTML = `<div class="fd-foto-fila">${foto ? `<img src="${foto}" alt="Foto" class="fd-foto">` : '<div class="fd-foto fd-foto-vacia">Sin foto</div>'}
      <div class="fd-foto-btns"><input type="file" id="fd-foto-input" accept="image/*" hidden onchange="cambiarFotoAlumno(${id}, this.files[0])">
        <button type="button" class="btn btn-gray btn-sm" onclick="document.getElementById('fd-foto-input').click()">${foto ? 'Cambiar foto' : 'Poner foto'}</button>
        ${foto ? `<button type="button" class="btn btn-gray btn-sm" onclick="quitarFotoAlumno(${id})">Quitar</button>` : ''}</div></div>
    <div class="fd-docs">${docs}</div>
    <input type="file" id="fd-doc-input" hidden onchange="adjuntarDocAlumno(${id}, this.files[0])">
    <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('fd-doc-input').click()">Adjuntar documento</button>`;
}

async function cambiarFotoAlumno(id, file) {
  if (!id || !file) return;
  try {
    const dataUrl = await leerFicheroComoDataUrl(file);
    const res = await window.api.guardarFotoAlumno(id, dataUrl);
    if (res && res.ok) {
      await cargarFotoDocsAlumno(id);
      showToast('fd-alerta', 'Foto actualizada.', 'ok');
    } else {
      showToast('fd-alerta', (res && res.msg) || 'No se pudo guardar la foto.', 'err');
    }
  } catch (e) {
    showToast('fd-alerta', 'No se pudo guardar la foto.', 'err');
  }
}

async function quitarFotoAlumno(id) {
  if (!id) return;
  if (!await confirmar('¿Quitar la foto de este alumno?', { peligro: true, textoAceptar: 'Quitar' })) return;
  try {
    await window.api.borrarFotoAlumno(id);
    await cargarFotoDocsAlumno(id);
  } catch (e) {
    showToast('fd-alerta', 'No se pudo quitar la foto.', 'err');
  }
}

async function adjuntarDocAlumno(id, file) {
  if (!id || !file) return;
  try {
    const dataUrl = await leerFicheroComoDataUrl(file);
    const res = await window.api.adjuntarDocumentoAlumno(id, file.name, dataUrl);
    if (res && res.ok) {
      await cargarFotoDocsAlumno(id);
      showToast('fd-alerta', 'Documento adjuntado.', 'ok');
    } else {
      showToast('fd-alerta', (res && res.msg) || 'No se pudo adjuntar el documento.', 'err');
    }
  } catch (e) {
    showToast('fd-alerta', 'No se pudo adjuntar el documento.', 'err');
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
    showToast('fd-alerta', 'No se pudo borrar el documento.', 'err');
  }
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
// #ficha-print oculto en pantalla, visible solo en @media print (ver
// styles.css), el mismo que usan los informes.
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
      <td>${a.n_registro ? esc(a.n_registro) : '—'}</td>
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
        <th>Nº</th><th>Nº registro</th><th>F. inscripción</th><th>Nombre</th><th>DNI/NIE</th><th>F. nacimiento</th>
        <th>Permisos que posee</th><th>Permiso al que aspira</th><th>Inicio enseñanza</th><th>Fin enseñanza</th><th>Resultado</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="10" style="text-align:center">No hay alumnos registrados</td></tr>'}</tbody>
    </table>
  `;

  window.print();
}

