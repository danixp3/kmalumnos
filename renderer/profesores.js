// ─── PROFESORES ───────────────────────────────────────────────────────────────
// CRUD de profesores y el helper para poblar selects de profesor en otras páginas.

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

