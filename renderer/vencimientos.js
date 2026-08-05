// ─── VENCIMIENTOS / ALERTAS DE CADUCIDADES ─────────────────────────────────
// UI de la página "Caducidades" (ITV, seguros, psicotécnicos, DNI, certificados,
// convocatorias...). Registro LOCAL — igual que jornada, no sincroniza con la
// nube (ver db/vencimientos.js). Todo pasa por los IPC homónimos.

let vencimientosCache = [];
let vencVehiculosCache = [];
let vencProfesoresCache = [];
let vencAlumnosCache = [];

async function loadVencimientos() {
  const [venc, vehiculos, profesores, alumnos] = await Promise.all([
    window.api.getVencimientos(getSucursalActual()),
    window.api.getVehiculos(),
    window.api.getProfesores(),
    window.api.getAlumnos()
  ]);
  vencimientosCache = venc;
  vencVehiculosCache = vehiculos;
  vencProfesoresCache = profesores;
  vencAlumnosCache = alumnos;
  renderVencimientosLista();
}

function _nombreEntidadVenc(v) {
  if (v.entidad_tipo === 'general' || v.entidad_id == null) return '—';
  if (v.entidad_tipo === 'vehiculo') {
    const veh = vencVehiculosCache.find(x => x.id === v.entidad_id);
    return veh ? (veh.matricula || veh.nombre || '—') : '—';
  }
  if (v.entidad_tipo === 'profesor') {
    const prof = vencProfesoresCache.find(x => x.id === v.entidad_id);
    return prof ? prof.nombre : '—';
  }
  if (v.entidad_tipo === 'alumno') {
    const al = vencAlumnosCache.find(x => x.id === v.entidad_id);
    return al ? al.nombre : '—';
  }
  return '—';
}

function renderVencimientosLista() {
  const cont = document.getElementById('vencimientos-lista');
  if (!cont) return;

  if (!vencimientosCache.length) {
    cont.innerHTML = '<div class="card"><div class="empty">No hay vencimientos registrados</div></div>';
    return;
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const filas = vencimientosCache.map(v => {
    const vencido = !v.completado && v.fecha_vencimiento < hoy;
    let estadoHtml;
    if (v.completado) {
      estadoHtml = '<span class="badge-pagada">Completado</span>';
    } else if (vencido) {
      estadoHtml = '<span class="badge-pendiente-pago">Vencido</span>';
    } else {
      estadoHtml = '<span class="badge-parcial">Próximo</span>';
    }
    return `<tr>
      <td>${esc(v.tipo || '—')}</td>
      <td>${esc(_nombreEntidadVenc(v))}</td>
      <td>${esc(v.descripcion || '')}</td>
      <td>${fmtFecha(v.fecha_vencimiento)}</td>
      <td>${estadoHtml}</td>
      <td>
        <button class="btn btn-gray btn-sm" onclick="toggleCompletadoVencimientoUI(${v.id})">${v.completado ? 'Reactivar' : 'Completar'}</button>
        <button class="btn btn-warn btn-sm" onclick="abrirEditarVencimiento(${v.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="borrarVencimientoUI(${v.id})">Borrar</button>
      </td>
    </tr>`;
  }).join('');

  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Tipo</th><th>Entidad</th><th>Descripción</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}

// Rellena el selector de entidad según el tipo elegido (vehiculo/profesor/alumno);
// para 'general' lo oculta, no hay nada que elegir.
function actualizarSelectorEntidadVencimiento(entidadIdSeleccionada) {
  const tipo = document.getElementById('venc-entidad-tipo').value;
  const wrap = document.getElementById('venc-entidad-id-wrap');
  const select = document.getElementById('venc-entidad-id');

  if (tipo === 'general') {
    wrap.classList.add('hidden');
    select.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');

  let opciones = [];
  if (tipo === 'vehiculo') opciones = vencVehiculosCache.map(x => ({ id: x.id, label: x.matricula || x.nombre }));
  if (tipo === 'profesor') opciones = vencProfesoresCache.map(x => ({ id: x.id, label: x.nombre }));
  if (tipo === 'alumno') opciones = vencAlumnosCache.map(x => ({ id: x.id, label: x.nombre }));

  select.innerHTML = opciones.map(o => `<option value="${o.id}">${esc(o.label)}</option>`).join('');
  if (entidadIdSeleccionada != null) select.value = entidadIdSeleccionada;
}

function abrirNuevoVencimiento() {
  document.getElementById('venc-modal-titulo').textContent = 'Añadir vencimiento';
  document.getElementById('venc-edit-id').value = '';
  document.getElementById('venc-entidad-tipo').value = 'vehiculo';
  document.getElementById('venc-tipo').value = '';
  document.getElementById('venc-descripcion').value = '';
  document.getElementById('venc-fecha').value = '';
  document.getElementById('venc-nota').value = '';
  document.getElementById('vencimiento-alert').classList.add('hidden');
  actualizarSelectorEntidadVencimiento();
  openModal('modal-vencimiento');
}

function abrirEditarVencimiento(id) {
  const v = vencimientosCache.find(x => x.id === id);
  if (!v) return;
  document.getElementById('venc-modal-titulo').textContent = 'Editar vencimiento';
  document.getElementById('venc-edit-id').value = v.id;
  document.getElementById('venc-entidad-tipo').value = v.entidad_tipo;
  document.getElementById('venc-tipo').value = v.tipo || '';
  document.getElementById('venc-descripcion').value = v.descripcion || '';
  document.getElementById('venc-fecha').value = v.fecha_vencimiento || '';
  document.getElementById('venc-nota').value = v.nota || '';
  document.getElementById('vencimiento-alert').classList.add('hidden');
  actualizarSelectorEntidadVencimiento(v.entidad_id);
  openModal('modal-vencimiento');
}

async function guardarVencimiento() {
  const idStr = document.getElementById('venc-edit-id').value;
  const entidad_tipo = document.getElementById('venc-entidad-tipo').value;
  const entidad_id = entidad_tipo === 'general' ? null : (document.getElementById('venc-entidad-id').value || null);
  const tipo = document.getElementById('venc-tipo').value.trim();
  const descripcion = document.getElementById('venc-descripcion').value.trim();
  const fecha_vencimiento = document.getElementById('venc-fecha').value;
  const nota = document.getElementById('venc-nota').value.trim();
  const alert = document.getElementById('vencimiento-alert');

  if (!fecha_vencimiento) {
    alert.textContent = 'Indica la fecha de vencimiento.';
    alert.className = 'alert alert-err';
    return;
  }

  const datos = { entidad_tipo, entidad_id, tipo, descripcion, fecha_vencimiento, nota, sucursal_id: getSucursalActual() };

  try {
    if (idStr) {
      await window.api.updateVencimiento(parseInt(idStr), datos);
    } else {
      await window.api.addVencimiento(datos);
    }
  } catch (e) {
    alert.textContent = e.message || 'No se pudo guardar el vencimiento.';
    alert.className = 'alert alert-err';
    return;
  }

  closeModal('modal-vencimiento');
  loadVencimientos();
}

async function toggleCompletadoVencimientoUI(id) {
  const v = vencimientosCache.find(x => x.id === id);
  if (!v) return;
  await window.api.setCompletadoVencimiento(id, !v.completado);
  loadVencimientos();
}

async function borrarVencimientoUI(id) {
  if (!confirm('¿Borrar este vencimiento?')) return;
  await window.api.deleteVencimiento(id);
  loadVencimientos();
}
