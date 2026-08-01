// ─── PROFESORES ───────────────────────────────────────────────────────────────
// CRUD de profesores y el helper para poblar selects de profesor en otras páginas.

// ─── PROFESORES ───────────────────────────────────────────────────────────────
async function loadProfesores() {
  profesoresCache = await window.api.getProfesores(getSucursalActual());
  const tbody = document.querySelector('#tabla-profesores tbody');
  if (!profesoresCache.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No hay profesores registrados</td></tr>';
    return;
  }
  tbody.innerHTML = profesoresCache.map(p => `<tr>
      <td><strong>${esc(p.nombre)}</strong></td>
      <td>${esc(p.nota) || '<span style="color:var(--placeholder)">—</span>'}</td>
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
  await window.api.addProfesor(nombre, nota, getSucursalActual());
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

// ─── ESTADÍSTICAS DE PROFESORES ─────────────────────────────────────────────
// Tabla de estadísticas por profesor, con filtro de fechas (desde/hasta) y
// orden clicable en cabeceras, sobre statsProfesoresCache (mismo patrón que
// deudasCache/renderDeudasTabla en pagos.js).
async function loadStatsProfesores() {
  const desde = document.getElementById('stats-prof-desde').value || undefined;
  const hasta = document.getElementById('stats-prof-hasta').value || undefined;
  statsProfesoresCache = await window.api.getStatsProfesores(desde, hasta);
  renderStatsProfesoresTabla();
}

function ordenarStatsProfesores(col) {
  if (statsProfesoresSort.col === col) {
    statsProfesoresSort.dir *= -1;
  } else {
    statsProfesoresSort.col = col;
    statsProfesoresSort.dir = 1;
  }
  renderStatsProfesoresTabla();
}

function actualizarIndicadoresOrdenStatsProfesores() {
  document.querySelectorAll('#tabla-stats-profesores thead th[data-sort]').forEach(th => {
    const ind = th.querySelector('.sort-ind');
    if (!ind) return;
    if (th.dataset.sort === statsProfesoresSort.col) {
      ind.innerHTML = statsProfesoresSort.dir === 1 ? SVG_SORT_ASC : SVG_SORT_DESC;
      th.classList.add('sort-active');
    } else {
      ind.innerHTML = '';
      th.classList.remove('sort-active');
    }
  });
}

function renderStatsProfesoresTabla() {
  const tbody = document.querySelector('#tabla-stats-profesores tbody');
  if (!statsProfesoresCache.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay profesores registrados</td></tr>';
    actualizarIndicadoresOrdenStatsProfesores();
    return;
  }

  const { col, dir } = statsProfesoresSort;
  const filas = [...statsProfesoresCache].sort((a, b) => {
    if (col === 'nombre') return a.nombre.localeCompare(b.nombre, 'es', { numeric: true }) * dir;
    if (col === 'ultima_practica') {
      const va = a.ultima_practica || '';
      const vb = b.ultima_practica || '';
      return va.localeCompare(vb) * dir;
    }
    return ((a[col] || 0) - (b[col] || 0)) * dir;
  });
  actualizarIndicadoresOrdenStatsProfesores();

  tbody.innerHTML = filas.map(s => `<tr>
      <td><strong>${esc(s.nombre)}</strong></td>
      <td>${s.num_practicas}</td>
      <td><span class="km-badge">${fmt(s.km_totales)} km</span></td>
      <td>${s.num_alumnos}</td>
      <td>${s.practicas_pista}</td>
      <td>${s.practicas_circulacion}</td>
      <td>${s.ultima_practica ? fmtFecha(s.ultima_practica) : '<span style="color:var(--placeholder)">—</span>'}</td>
    </tr>`).join('');
}

