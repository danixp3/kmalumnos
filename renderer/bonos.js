// ─── BONOS / PACKS DE PRÁCTICAS ─────────────────────────────────────────────
// UI de la página "Bonos" (packs de clases prepagadas por alumno). Registro
// LOCAL — igual que vencimientos/jornadas, no sincroniza con la nube (ver
// db/bonos.js). Todo pasa por los IPC homónimos.

let bonosCache = [];
let bonoAlumnosCache = [];

async function loadBonos() {
  const [bonos, alumnos] = await Promise.all([
    window.api.getBonos(getSucursalActual()),
    window.api.getAlumnos()
  ]);
  bonosCache = bonos;
  bonoAlumnosCache = alumnos;
  renderBonosLista();
}

function _nombreAlumnoBono(b) {
  const al = bonoAlumnosCache.find(x => x.id === b.alumno_id);
  return al ? al.nombre : '—';
}

function renderBonosLista() {
  const cont = document.getElementById('bonos-lista');
  if (!cont) return;

  if (!bonosCache.length) {
    cont.innerHTML = '<div class="card"><div class="empty">No hay bonos registrados</div></div>';
    return;
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const filas = bonosCache.map(b => {
    const caducado = !!(b.fecha_caducidad && b.fecha_caducidad < hoy);
    let estadoHtml;
    if (b.estado === 'anulado') {
      estadoHtml = '<span class="badge-parcial">Anulado</span>';
    } else if (b.estado === 'agotado') {
      estadoHtml = '<span class="badge-parcial">Agotado</span>';
    } else if (caducado) {
      estadoHtml = '<span class="badge-pendiente-pago">Caducado</span>';
    } else {
      estadoHtml = '<span class="badge-pagada">Activo</span>';
    }
    return `<tr>
      <td>${esc(_nombreAlumnoBono(b))}</td>
      <td>${esc(b.nombre || '')}</td>
      <td>${b.n_usadas}/${b.n_clases}</td>
      <td>${b.precio != null ? fmt(b.precio) + ' €' : '—'}</td>
      <td>${fmtFecha(b.fecha_compra)}</td>
      <td>${b.fecha_caducidad ? fmtFecha(b.fecha_caducidad) : '—'}</td>
      <td>${estadoHtml}</td>
      <td>
        <button class="btn btn-gray btn-sm" onclick="consumirBonoUI(${b.id})">+1</button>
        <button class="btn btn-gray btn-sm" onclick="reponerBonoUI(${b.id})">-1</button>
        <button class="btn btn-warn btn-sm" onclick="abrirEditarBono(${b.id})">Editar</button>
        <button class="btn btn-gray btn-sm" onclick="anularBonoUI(${b.id})">Anular</button>
        <button class="btn btn-danger btn-sm" onclick="borrarBonoUI(${b.id})">Borrar</button>
      </td>
    </tr>`;
  }).join('');

  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Alumno</th><th>Bono</th><th>Saldo</th><th>Precio</th><th>Compra</th><th>Caduca</th><th>Estado</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}

function _rellenarSelectorAlumnoBono(alumnoIdSeleccionado) {
  const select = document.getElementById('bono-alumno-id');
  if (!select) return;
  select.innerHTML = bonoAlumnosCache.map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('');
  if (alumnoIdSeleccionado != null) select.value = alumnoIdSeleccionado;
}

function abrirNuevoBono() {
  document.getElementById('bono-modal-titulo').textContent = 'Añadir bono';
  document.getElementById('bono-edit-id').value = '';
  document.getElementById('bono-nombre').value = '';
  document.getElementById('bono-n-clases').value = '';
  document.getElementById('bono-precio').value = '';
  document.getElementById('bono-fecha-compra').value = new Date().toISOString().slice(0, 10);
  document.getElementById('bono-fecha-caducidad').value = '';
  document.getElementById('bono-nota').value = '';
  document.getElementById('bono-alert').classList.add('hidden');
  _rellenarSelectorAlumnoBono();
  openModal('modal-bono');
}

function abrirEditarBono(id) {
  const b = bonosCache.find(x => x.id === id);
  if (!b) return;
  document.getElementById('bono-modal-titulo').textContent = 'Editar bono';
  document.getElementById('bono-edit-id').value = b.id;
  document.getElementById('bono-nombre').value = b.nombre || '';
  document.getElementById('bono-n-clases').value = b.n_clases;
  document.getElementById('bono-precio').value = b.precio != null ? b.precio : '';
  document.getElementById('bono-fecha-compra').value = b.fecha_compra || '';
  document.getElementById('bono-fecha-caducidad').value = b.fecha_caducidad || '';
  document.getElementById('bono-nota').value = b.nota || '';
  document.getElementById('bono-alert').classList.add('hidden');
  _rellenarSelectorAlumnoBono(b.alumno_id);
  openModal('modal-bono');
}

async function guardarBono() {
  const idStr = document.getElementById('bono-edit-id').value;
  const alumno_id = document.getElementById('bono-alumno-id').value;
  const nombre = document.getElementById('bono-nombre').value.trim();
  const n_clases = document.getElementById('bono-n-clases').value;
  const precio = document.getElementById('bono-precio').value;
  const fecha_compra = document.getElementById('bono-fecha-compra').value;
  const fecha_caducidad = document.getElementById('bono-fecha-caducidad').value;
  const nota = document.getElementById('bono-nota').value.trim();
  const alert = document.getElementById('bono-alert');

  if (!alumno_id) {
    alert.textContent = 'Elige un alumno.';
    alert.className = 'alert alert-err';
    return;
  }

  const datos = { alumno_id, nombre, n_clases, precio, fecha_compra, fecha_caducidad: fecha_caducidad || null, nota, sucursal_id: getSucursalActual() };

  try {
    if (idStr) {
      await window.api.updateBono(parseInt(idStr), datos);
    } else {
      await window.api.addBono(datos);
    }
  } catch (e) {
    alert.textContent = e.message || 'No se pudo guardar el bono.';
    alert.className = 'alert alert-err';
    return;
  }

  closeModal('modal-bono');
  loadBonos();
}

async function consumirBonoUI(id) {
  const res = await window.api.consumirBono(id, 1);
  if (!res || !res.ok) {
    showToast('bonos-toast', 'No se pudo consumir el bono (agotado o anulado).', 'err');
    loadBonos();
    return;
  }
  showToast('bonos-toast', `Clase consumida. Saldo restante: ${res.saldo}.`, 'ok');
  loadBonos();
}

async function reponerBonoUI(id) {
  const res = await window.api.reponerBono(id, 1);
  if (res && res.ok) {
    showToast('bonos-toast', `Clase repuesta. Saldo: ${res.saldo}.`, 'ok');
  }
  loadBonos();
}

async function anularBonoUI(id) {
  if (!confirm('¿Anular este bono?')) return;
  await window.api.anularBono(id);
  loadBonos();
}

async function borrarBonoUI(id) {
  if (!confirm('¿Borrar este bono?')) return;
  await window.api.deleteBono(id);
  loadBonos();
}
