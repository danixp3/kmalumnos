// ─── PRÁCTICAS (VISTA GLOBAL) ─────────────────────────────────────────────────
// Listado de TODAS las prácticas de todos los alumnos juntas, con filtros por
// fecha/alumno/vehículo/profesor/tipo (resueltos en backend vía
// getTodasPracticas) y buscador de texto + orden de columnas en cliente sobre
// practicasGlobalCache (mismo patrón que deudasCache/renderDeudasTabla en pagos.js).
// No toca la vista de prácticas por alumno (renderer/practicas.js).

async function loadPracticasGlobal() {
  await poblarSelectsPracticasGlobal();
  await fetchPracticasGlobal();
}

// Rellena los <select> de alumno/vehículo/profesor conservando la selección actual.
async function poblarSelectsPracticasGlobal() {
  const [alumnos, vehiculos, profesores] = await Promise.all([
    window.api.getAlumnos(), window.api.getVehiculos(), window.api.getProfesores()
  ]);

  const selAlumno = document.getElementById('pg-alumno');
  const selVehiculo = document.getElementById('pg-vehiculo');
  const selProfesor = document.getElementById('pg-profesor');
  if (selAlumno) {
    const actual = selAlumno.value;
    selAlumno.innerHTML = '<option value="">Todos los alumnos</option>' +
      [...alumnos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('');
    if ([...selAlumno.options].some(o => o.value === actual)) selAlumno.value = actual;
  }
  if (selVehiculo) {
    const actual = selVehiculo.value;
    selVehiculo.innerHTML = '<option value="">Todos los vehículos</option>' +
      [...vehiculos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(v => `<option value="${v.id}">${esc(v.nombre)}</option>`).join('');
    if ([...selVehiculo.options].some(o => o.value === actual)) selVehiculo.value = actual;
  }
  if (selProfesor) {
    const actual = selProfesor.value;
    selProfesor.innerHTML = '<option value="">Todos los profesores</option>' +
      [...profesores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    if ([...selProfesor.options].some(o => o.value === actual)) selProfesor.value = actual;
  }
}

// Pide al backend las prácticas ya filtradas por fecha/alumno/vehículo/profesor/tipo
// (el buscador de texto y el orden de columnas se aplican después, en cliente).
async function fetchPracticasGlobal() {
  const filtros = {
    desde: document.getElementById('pg-desde')?.value || undefined,
    hasta: document.getElementById('pg-hasta')?.value || undefined,
    alumno_id: document.getElementById('pg-alumno')?.value || undefined,
    vehiculo_id: document.getElementById('pg-vehiculo')?.value || undefined,
    profesor_id: document.getElementById('pg-profesor')?.value || undefined,
    tipo: document.getElementById('pg-tipo')?.value || undefined,
  };
  practicasGlobalCache = await window.api.getTodasPracticas(filtros);
  renderPracticasGlobalTabla();
}

function limpiarFiltrosPracticasGlobal() {
  const desde = document.getElementById('pg-desde');
  const hasta = document.getElementById('pg-hasta');
  const alumno = document.getElementById('pg-alumno');
  const vehiculo = document.getElementById('pg-vehiculo');
  const profesor = document.getElementById('pg-profesor');
  const tipo = document.getElementById('pg-tipo');
  const buscar = document.getElementById('pg-buscar');
  if (desde) desde.value = '';
  if (hasta) hasta.value = '';
  if (alumno) alumno.value = '';
  if (vehiculo) vehiculo.value = '';
  if (profesor) profesor.value = '';
  if (tipo) tipo.value = '';
  if (buscar) buscar.value = '';
  fetchPracticasGlobal();
}

function ordenarPracticasGlobal(col) {
  if (practicasGlobalSort.col === col) {
    practicasGlobalSort.dir *= -1;
  } else {
    practicasGlobalSort.col = col;
    practicasGlobalSort.dir = 1;
  }
  renderPracticasGlobalTabla();
}

function actualizarIndicadoresOrdenPracticasGlobal() {
  document.querySelectorAll('#tabla-practicas-global thead th[data-sort]').forEach(th => {
    const ind = th.querySelector('.sort-ind');
    if (!ind) return;
    if (th.dataset.sort === practicasGlobalSort.col) {
      ind.innerHTML = practicasGlobalSort.dir === 1 ? SVG_SORT_ASC : SVG_SORT_DESC;
      th.classList.add('sort-active');
    } else {
      ind.innerHTML = '';
      th.classList.remove('sort-active');
    }
  });
}

function renderPracticasGlobalTabla() {
  const tbody = document.querySelector('#tabla-practicas-global tbody');
  const buscarFiltro = (document.getElementById('pg-buscar')?.value || '').trim().toLowerCase();

  let filtradas = practicasGlobalCache.filter(p =>
    !buscarFiltro || p.alumno_nombre.toLowerCase().includes(buscarFiltro)
  );

  const { col, dir } = practicasGlobalSort;
  filtradas = [...filtradas].sort((a, b) => {
    if (col === 'km') return (a.km_recorridos - b.km_recorridos) * dir;
    if (col === 'fecha') return (a.fecha.localeCompare(b.fecha) || a.id - b.id) * dir;
    let va = '', vb = '';
    if (col === 'alumno') { va = a.alumno_nombre || ''; vb = b.alumno_nombre || ''; }
    else if (col === 'vehiculo') { va = a.vehiculo_nombre || ''; vb = b.vehiculo_nombre || ''; }
    else if (col === 'profesor') { va = a.profesor_nombre || ''; vb = b.profesor_nombre || ''; }
    else if (col === 'tipo') { va = a.tipo || ''; vb = b.tipo || ''; }
    return va.localeCompare(vb, 'es', { numeric: true }) * dir;
  });
  actualizarIndicadoresOrdenPracticasGlobal();

  // Resumen: nº de prácticas mostradas + suma de km recorridos, sobre lo filtrado
  document.getElementById('practicas-global-resumen-num').textContent = filtradas.length;
  const kmTotales = filtradas.reduce((sum, p) => sum + p.km_recorridos, 0);
  document.getElementById('practicas-global-resumen-km').textContent = fmt(Math.round(kmTotales * 10) / 10) + ' km';

  if (!filtradas.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay prácticas que coincidan con los filtros</td></tr>';
    return;
  }

  tbody.innerHTML = filtradas.map(p => {
    const tipoCell = p.tipo === 'pista' ? 'Pista' : 'Circulación';
    const kmCell = p.sin_km
      ? '<span style="color:var(--warn-fg-soft);font-style:italic">Sin km</span>'
      : `<span class="km-badge">+${fmt(p.km_recorridos)} km</span>`;
    return `<tr${p.sin_km ? ' style="background:var(--warn-bg-soft)"' : ''}>
      <td>${fmtFecha(p.fecha)}</td>
      <td>${esc(p.alumno_nombre)}</td>
      <td>${esc(p.vehiculo_nombre)}</td>
      <td>${esc(p.profesor_nombre)}</td>
      <td>${tipoCell}</td>
      <td>${kmCell}</td>
    </tr>`;
  }).join('');
}
