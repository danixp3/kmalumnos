// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
// CRUD de vehículos, relleno masivo de km y contador de prácticas sin km.

// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
async function loadVehiculos() {
  vehiculosCache = await window.api.getVehiculos(getSucursalActual());
  const tbody = document.querySelector('#tabla-vehiculos tbody');

  // Actualizar select de relleno masivo
  const sel = document.getElementById('relleno-vehiculo');
  if (sel) {
    sel.innerHTML = vehiculosCache.map(v => `<option value="${v.id}">${esc(v.nombre)}</option>`).join('');
    actualizarContadorSinKm();
  }

  if (!vehiculosCache.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No hay vehículos registrados</td></tr>';
    return;
  }

  const rows = await Promise.all(vehiculosCache.map(async v => {
    const sinKm = await window.api.getPracticasSinKm(v.id);
    const sinKmBadge = sinKm > 0
      ? `<span style="background:var(--warn-bg);color:var(--warn-fg);padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700">${sinKm}</span>`
      : `<span style="color:var(--placeholder)">—</span>`;
    return `<tr>
      <td><strong>${esc(v.nombre)}</strong></td>
      <td>${esc(v.matricula) || '<span style="color:var(--placeholder)">—</span>'}</td>
      <td><span class="km-badge">${fmt(v.km_actual)} km</span></td>
      <td>${sinKmBadge}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="openEditVehiculo(${v.id},'${esc(v.nombre)}','${esc(v.matricula || '')}',${v.km_actual})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteVehiculo(${v.id},'${esc(v.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> Borrar</button>
      </td>
    </tr>`;
  }));
  tbody.innerHTML = rows.join('');
}

async function actualizarContadorSinKm() {
  const sel = document.getElementById('relleno-vehiculo');
  const info = document.getElementById('relleno-sinKm');
  if (!sel || !info) return;
  const vid = parseInt(sel.value);
  if (!vid) { info.textContent = ''; return; }
  const n = await window.api.getPracticasSinKm(vid);
  info.textContent = n > 0 ? `${n} práctica(s) sin km` : '✓ Todo relleno';
  info.style.color = n > 0 ? 'var(--warn-fg-soft)' : 'var(--success-fg)';
}

async function rellenarMasivo() {
  const sel = document.getElementById('relleno-vehiculo');
  const vid = parseInt(sel.value);
  if (!vid) { alert('Selecciona un vehículo.'); return; }
  const min = parseFloat(document.getElementById('relleno-min').value) || 40;
  const max = parseFloat(document.getElementById('relleno-max').value) || 45;
  if (max <= min) { alert('El máximo debe ser mayor que el mínimo.'); return; }
  
  // Topes opcionales del odómetro
  const inicioVal = document.getElementById('relleno-inicio').value;
  const finalVal = document.getElementById('relleno-final').value;
  const inicio = inicioVal ? parseFloat(inicioVal) : null;
  const final = finalVal ? parseFloat(finalVal) : null;
  
  if (inicio !== null && final !== null && final <= inicio) {
    alert('El tope final debe ser mayor que el tope inicial.'); return;
  }

  const n = await window.api.getPracticasSinKm(vid);
  if (n === 0) {
    const el = document.getElementById('relleno-alert');
    el.className = 'alert alert-info'; el.textContent = 'Este vehículo no tiene prácticas con km en blanco.'; el.classList.remove('hidden');
    return;
  }

  const topeInfo = (inicio || final) ? `\n\nTope odómetro: ${inicio || '(auto)'} → ${final || '(sin límite)'}` : '';
  if (!confirm(`Se van a generar km para ${n} práctica(s) con km en blanco del vehículo seleccionado.\n\nRango por práctica: ${min}-${max} km${topeInfo}\n\n¿Continuar?`)) return;

  const result = await window.api.rellenarKmMasivo(vid, min, max, inicio, final);
  const el = document.getElementById('relleno-alert');
  el.className = 'alert alert-ok';
  const saltadasMsg = result.saltadas ? ` (${result.saltadas} saltadas por tope)` : '';
  el.innerHTML = `${result.rellenadas} práctica(s) rellenadas${saltadasMsg}. &nbsp;
    <button class="btn btn-warn btn-sm" style="margin-left:8px" onclick="navegarA('kilometros','conflictos')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Verificar solapamientos ahora
    </button>`;
  el.classList.remove('hidden');
  loadVehiculos();
}

async function addVehiculo() {
  const nombre = document.getElementById('v-nombre').value.trim();
  const matricula = document.getElementById('v-matricula').value.trim();
  const km = parseFloat(document.getElementById('v-km').value) || 0;
  if (!nombre) { alert('Introduce un nombre para el vehículo.'); return; }
  await window.api.addVehiculo(nombre, matricula, km, getSucursalActual());
  document.getElementById('v-nombre').value = '';
  document.getElementById('v-matricula').value = '';
  document.getElementById('v-km').value = '';
  loadVehiculos();
}

async function deleteVehiculo(id, nombre) {
  if (!confirm(`¿Borrar el vehículo "${nombre}"? Se eliminará de todos los alumnos asignados.`)) return;
  await window.api.deleteVehiculo(id);
  loadVehiculos();
}

function openEditVehiculo(id, nombre, matricula, km) {
  document.getElementById('edit-v-id').value = id;
  document.getElementById('edit-v-nombre').value = nombre;
  document.getElementById('edit-v-matricula').value = matricula || '';
  document.getElementById('edit-v-km').value = km;
  openModal('modal-vehiculo');
}

async function saveVehiculo() {
  const id = parseInt(document.getElementById('edit-v-id').value);
  const nombre = document.getElementById('edit-v-nombre').value.trim();
  const matricula = document.getElementById('edit-v-matricula').value.trim();
  const km = parseFloat(document.getElementById('edit-v-km').value);
  if (!nombre) { alert('Introduce un nombre para el vehículo.'); return; }
  if (isNaN(km)) { alert('Introduce un km válido.'); return; }
  await window.api.updateVehiculo(id, nombre, matricula);
  await window.api.updateVehiculoKm(id, km);
  closeModal('modal-vehiculo');
  loadVehiculos();
}

