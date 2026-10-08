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
    return al ? nombreCortoAlumno(al) : '—';
  }
  return '—';
}

// Tipos conocidos, en el orden en que se enseñan (el resto, por orden alfabético y «Otros» al final)
const VENC_ORDEN = ['itv', 'seguro', 'dni', 'psicotecnico', 'permiso de conducir', 'certificado'];
const VENC_ICONOS = {
  itv: '<path d="M3 13l2-5.5A2 2 0 0 1 6.9 6h10.2A2 2 0 0 1 19 7.5L21 13M3 13v4h2m16-4v4h-2M3 13h18M7.5 17h9"/><circle cx="7.5" cy="14.5" r=".6"/><circle cx="16.5" cy="14.5" r=".6"/>',
  seguro: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  dni: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.6-2.3 3-2.3s2.5.8 3 2.3M15 10h3M15 13h3"/>',
  otros: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'
};
let vencFiltro = 'todas';        // tabla que se enseña: 'todas' o la clave de un tipo
let vencVerTerminados = false;   // enseñar también las de alumnos que ya no vienen

const _claveTipoVenc = t => (typeof sinTildes === 'function' ? sinTildes(t || '') : String(t || '').toLowerCase()).trim().toLowerCase() || 'otros';

// Escribe «ITV» o «Psicotécnico» como lo escribió más veces quien las anotó
function _nombreTipoVenc(items) {
  const cuenta = new Map();
  for (const v of items) { const n = (v.tipo || '').trim(); if (n) cuenta.set(n, (cuenta.get(n) || 0) + 1); }
  const mejor = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
  return mejor ? mejor[0] : 'Otros';
}

function _estadoVenc(v, hoy) {
  if (v.completado) return { clase: 'badge-pagada', txt: 'Completado', cuando: '' };
  const dias = diasEntre(hoy, v.fecha_vencimiento);
  if (dias < 0) return { clase: 'badge-pendiente-pago', txt: 'Vencido', cuando: `hace ${-dias} ${dias === -1 ? 'día' : 'días'}` };
  const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`;
  return { clase: dias <= 30 ? 'badge-parcial' : 'badge-pagada', txt: dias <= 30 ? 'Próximo' : 'Al día', cuando };
}

function _filaVenc(v, hoy) {
  const e = _estadoVenc(v, hoy);
  return `<tr${v.completado ? ' class="venc-hecha"' : ''}>
      <td class="venc-entidad">${esc(_nombreEntidadVenc(v))}</td>
      <td>${esc(v.descripcion || '')}</td>
      <td class="venc-fecha"><span class="num-mono">${fmtFecha(v.fecha_vencimiento)}</span>${e.cuando ? `<small>${e.cuando}</small>` : ''}</td>
      <td><span class="${e.clase}">${e.txt}</span></td>
      <td class="venc-acciones">
        <button class="btn btn-gray btn-sm" onclick="toggleCompletadoVencimientoUI(${v.id})">${v.completado ? 'Reactivar' : 'Completar'}</button>
        <button class="btn btn-warn btn-sm" onclick="abrirEditarVencimiento(${v.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="borrarVencimientoUI(${v.id})">Borrar</button>
      </td>
    </tr>`;
}

// Una tabla por tipo de caducidad (ITV, seguros, DNI…): así cada una se lee y se
// revisa por separado, con sus vencidas arriba.
function renderVencimientosLista() {
  const cont = document.getElementById('vencimientos-lista');
  if (!cont) return;

  if (!vencimientosCache.length) {
    cont.innerHTML = '<div class="card"><div class="empty">No hay vencimientos registrados</div></div>';
    return;
  }

  const hoy = hoyISO();
  const ocultas = vencimientosCache.filter(v => v.entidad_terminada);
  const visibles = vencVerTerminados ? vencimientosCache : vencimientosCache.filter(v => !v.entidad_terminada);

  const grupos = new Map();
  for (const v of visibles) {
    const k = _claveTipoVenc(v.tipo);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(v);
  }
  const claves = [...grupos.keys()].sort((a, b) => {
    const ia = VENC_ORDEN.indexOf(a), ib = VENC_ORDEN.indexOf(b);
    if (a === 'otros' || b === 'otros') return a === 'otros' ? 1 : -1;
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b, 'es');
  });
  if (vencFiltro !== 'todas' && !grupos.has(vencFiltro)) vencFiltro = 'todas';

  // Pendientes (sin completar) de cada tipo, para el resumen
  const resumenDe = items => {
    const pend = items.filter(v => !v.completado);
    const vencidas = pend.filter(v => v.fecha_vencimiento < hoy).length;
    const proximas = pend.filter(v => v.fecha_vencimiento >= hoy && diasEntre(hoy, v.fecha_vencimiento) <= 30).length;
    return { vencidas, proximas };
  };

  const chips = [['todas', 'Todas', visibles.length, resumenDe(visibles)], ...claves.map(k => [k, _nombreTipoVenc(grupos.get(k)), grupos.get(k).length, resumenDe(grupos.get(k))])]
    .map(([k, nombre, n, r]) => `<button type="button" aria-pressed="${vencFiltro === k}" onclick="filtrarVencimientos('${esc(k)}')">${esc(nombre)} <span class="seg-n">· ${fmtMiles(n)}</span>${r.vencidas ? `<i class="venc-punto venc-punto-mal" title="${r.vencidas} vencida${r.vencidas === 1 ? '' : 's'}"></i>` : (r.proximas ? '<i class="venc-punto" title="Hay próximas a vencer"></i>' : '')}</button>`).join('');

  const tablas = claves.filter(k => vencFiltro === 'todas' || vencFiltro === k).map(k => {
    const items = grupos.get(k);
    const nombre = _nombreTipoVenc(items);
    const r = resumenDe(items);
    const tipos = new Set(items.map(v => v.entidad_tipo));
    const quien = tipos.size === 1 ? ({ vehiculo: 'Vehículo', profesor: 'Profesor', alumno: 'Alumno', general: 'Referido a' }[[...tipos][0]] || 'Referido a') : 'Referido a';
    // Primero lo pendiente (por fecha: las vencidas arriba) y al final lo ya completado
    const ordenadas = items.slice().sort((a, b) => (a.completado - b.completado) || a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
    const partes = [`${fmtMiles(items.length)} ${items.length === 1 ? 'caducidad' : 'caducidades'}`];
    if (r.vencidas) partes.push(`<b class="venc-mal">${r.vencidas} ${r.vencidas === 1 ? 'vencida' : 'vencidas'}</b>`);
    if (r.proximas) partes.push(`<b class="venc-pronto">${r.proximas} ${r.proximas === 1 ? 'próxima' : 'próximas'}</b> (30 días)`);
    return `<section class="card venc-card" aria-labelledby="venc-h-${esc(k)}">
      <div class="card-title"><div class="card-title-icon venc-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${VENC_ICONOS[k] || VENC_ICONOS.otros}</svg></div><span id="venc-h-${esc(k)}">${esc(nombre)}</span><span class="venc-cuenta">${partes.join(' · ')}</span></div>
      <div class="table-wrap"><table class="tabla-venc">
        <thead><tr><th>${quien}</th><th>Descripción</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
        <tbody>${ordenadas.map(v => _filaVenc(v, hoy)).join('')}</tbody>
      </table></div>
    </section>`;
  }).join('');

  const nota = ocultas.length
    ? `<label class="venc-terminados"><input type="checkbox" ${vencVerTerminados ? 'checked' : ''} onchange="vencVerTerminadosCambiar(this.checked)"> <span>Ver también ${vencVerTerminados ? '' : 'las '}${fmtMiles(ocultas.length)} de alumnos que ya no vienen o de coches retirados</span></label>` : '';

  cont.innerHTML = `<div class="venc-barra"><div class="seg seg-tabs venc-chips" role="group" aria-label="Tipo de caducidad">${chips}</div>${nota}</div>${tablas || '<div class="card"><div class="empty">No hay caducidades de este tipo.</div></div>'}`;
}

function filtrarVencimientos(clave) {
  vencFiltro = clave;
  renderVencimientosLista();
}
function vencVerTerminadosCambiar(ver) {
  vencVerTerminados = !!ver;
  renderVencimientosLista();
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
  if (!await confirmar('¿Borrar este vencimiento?', { peligro: true, textoAceptar: 'Borrar' })) return;
  await window.api.deleteVencimiento(id);
  loadVencimientos();
}
