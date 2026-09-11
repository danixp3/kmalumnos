// ─── GENERAR KM (sección unificada de generación de kilómetros) ──────────────
// Reúne los tres métodos de generación de km para las prácticas en blanco de un
// vehículo: encadenado (hacia delante desde el odómetro actual), hasta un máximo
// (hacia atrás desde un km final) y por rango (repartido entre dos km con media
// + variación). Los modos "máximo" y "rango" previsualizan antes de aplicar y,
// como usan aleatoriedad, guardan EXACTAMENTE lo previsualizado (aplicarPlanKm).

let gkPlanActual = null; // { vid, asignaciones:[{practica_id,km_inicial,km_final}] }

async function loadGenerarKm() {
  const vehiculos = await window.api.getVehiculos(getSucursalActual());
  const sel = document.getElementById('gk-vehiculo');
  if (!sel) return;
  const previo = sel.value;
  sel.innerHTML = vehiculos.length
    ? vehiculos.map(v => `<option value="${v.id}">${esc(v.nombre)}${v.matricula ? ' (' + v.matricula + ')' : ''}</option>`).join('')
    : '<option value="">Sin vehículos</option>';
  // Conservar el vehículo seleccionado si sigue existiendo
  if (previo && vehiculos.some(v => String(v.id) === previo)) sel.value = previo;

  // Rango por defecto desde la preferencia global (mismo que relleno/conflictos)
  aplicarRangoPref('gk-enc-min', 'gk-enc-max');
  aplicarRangoPref('gk-max-min', 'gk-max-max');

  gkLimpiarPreview();
  gkActualizarContador();
}

function gkCambioVehiculo() {
  gkLimpiarPreview();
  gkActualizarContador();
}

async function gkActualizarContador() {
  const info = document.getElementById('gk-sinKm');
  const vid = parseInt(document.getElementById('gk-vehiculo').value);
  if (!info) return;
  if (!vid) { info.textContent = ''; return; }
  const n = await window.api.getPracticasSinKm(vid);
  info.textContent = n > 0 ? `${n} práctica(s) sin km en este vehículo` : '✓ No hay prácticas sin km';
}

function cambiarTabGenerarKm(modo) {
  document.querySelectorAll('#page-generar-km .page-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === modo));
  document.querySelectorAll('#page-generar-km .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-generar-km-' + modo));
  // Al cambiar de método, la previsualización pendiente deja de tener sentido
  gkLimpiarPreview();
  const alert = document.getElementById('gk-enc-alert');
  if (alert) alert.classList.add('hidden');
}

function gkLimpiarPreview() {
  gkPlanActual = null;
  const el = document.getElementById('gk-preview');
  if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
}

// ─── MODO ENCADENADO (aplica directamente, como el relleno masivo clásico) ────
async function gkGenerarEncadenado() {
  const vid = parseInt(document.getElementById('gk-vehiculo').value);
  const alert = document.getElementById('gk-enc-alert');
  if (!vid) { alert.className = 'alert alert-err'; alert.textContent = 'Selecciona un vehículo.'; alert.classList.remove('hidden'); return; }

  const min = parseFloat(document.getElementById('gk-enc-min').value) || 40;
  const max = parseFloat(document.getElementById('gk-enc-max').value) || 45;
  if (max <= min) { alert.className = 'alert alert-err'; alert.textContent = 'El máximo por práctica debe ser mayor que el mínimo.'; alert.classList.remove('hidden'); return; }

  const inicioVal = document.getElementById('gk-enc-inicio').value;
  const finalVal = document.getElementById('gk-enc-final').value;
  const inicio = inicioVal ? parseFloat(inicioVal) : null;
  const final = finalVal ? parseFloat(finalVal) : null;
  if (inicio !== null && final !== null && final <= inicio) {
    alert.className = 'alert alert-err'; alert.textContent = 'El tope final debe ser mayor que el tope inicial.'; alert.classList.remove('hidden'); return;
  }

  const n = await window.api.getPracticasSinKm(vid);
  if (n === 0) {
    alert.className = 'alert alert-info'; alert.textContent = 'Este vehículo no tiene prácticas con km en blanco.'; alert.classList.remove('hidden'); return;
  }

  const topeInfo = (inicio || final) ? `\n\nTope odómetro: ${inicio || '(auto)'} → ${final || '(sin límite)'}` : '';
  if (!await confirmar(`Se van a generar km para ${n} práctica(s) en blanco.\n\nRango por práctica: ${min}-${max} km${topeInfo}\n\n¿Continuar?`)) return;

  const result = await window.api.rellenarKmMasivo(vid, min, max, inicio, final);
  const saltadasMsg = result.saltadas ? ` (${result.saltadas} saltadas por tope)` : '';
  alert.className = 'alert alert-ok';
  alert.innerHTML = `${result.rellenadas} práctica(s) rellenadas${saltadasMsg}. &nbsp;
    <button class="btn btn-warn btn-sm" style="margin-left:8px" onclick="navegarA('kilometros','conflictos')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Verificar solapamientos
    </button>`;
  alert.classList.remove('hidden');
  gkActualizarContador();
}

// ─── MODOS MÁXIMO Y RANGO (previsualizar → aplicar) ───────────────────────────
async function gkPreview(modo) {
  const vid = parseInt(document.getElementById('gk-vehiculo').value);
  const el = document.getElementById('gk-preview');
  if (!vid) { el.className = 'alert alert-err'; el.textContent = 'Selecciona un vehículo.'; el.classList.remove('hidden'); return; }

  let res, titulo;
  if (modo === 'maximo') {
    const maximo = parseFloat(document.getElementById('gk-max-maximo').value);
    const min = parseFloat(document.getElementById('gk-max-min').value) || 40;
    const max = parseFloat(document.getElementById('gk-max-max').value) || 45;
    if (isNaN(maximo) || maximo <= 0) { el.className = 'alert alert-err'; el.textContent = 'Indica un kilometraje máximo válido.'; el.classList.remove('hidden'); return; }
    if (max <= min) { el.className = 'alert alert-err'; el.textContent = 'El máximo por práctica debe ser mayor que el mínimo.'; el.classList.remove('hidden'); return; }
    res = await window.api.generarKmHastaMaximo(vid, min, max, maximo, false);
    titulo = `Hasta un máximo de ${fmt(Math.round(maximo))} km`;
  } else { // rango
    const desde = parseFloat(document.getElementById('gk-rango-desde').value);
    const hasta = parseFloat(document.getElementById('gk-rango-hasta').value);
    const variacion = parseFloat(document.getElementById('gk-rango-variacion').value) || 0;
    if (isNaN(desde) || desde < 0) { el.className = 'alert alert-err'; el.textContent = 'Indica el km inicial del rango.'; el.classList.remove('hidden'); return; }
    if (isNaN(hasta) || hasta <= desde) { el.className = 'alert alert-err'; el.textContent = 'El km final del rango debe ser mayor que el inicial.'; el.classList.remove('hidden'); return; }
    res = await window.api.generarKmPorRango(vid, desde, hasta, variacion, false);
    titulo = `Por rango ${fmt(Math.round(desde))} → ${fmt(Math.round(hasta))} km (variación ±${Math.round(variacion)})`;
  }

  if (res.errores && res.errores.length) {
    el.className = 'alert alert-err';
    el.textContent = res.errores.join(' ');
    el.classList.remove('hidden');
    gkPlanActual = null;
    return;
  }

  gkPlanActual = { vid, asignaciones: res.asignaciones.map(a => ({ practica_id: a.practica_id, km_inicial: a.km_inicial, km_final: a.km_final })) };
  gkRenderPreview(res, titulo);
}

function gkRenderPreview(res, titulo) {
  const el = document.getElementById('gk-preview');
  el.className = ''; // contenedor normal, no alert
  const filas = res.asignaciones.map(a => {
    const diff = a.km_final - a.km_inicial;
    return `<tr>
      <td>${fmtFecha(a.fecha)}</td>
      <td>${esc(a.alumno)}</td>
      <td>${fmt(a.km_inicial)} → ${fmt(a.km_final)}</td>
      <td><span class="km-badge">+${fmt(diff)} km</span></td>
    </tr>`;
  }).join('');

  const avisoSolap = res.solapamientos > 0
    ? `<div class="alert alert-warn" style="margin:12px 0">Atención: estos km se solaparían con ${res.solapamientos} práctica(s) que ya tienen km reales. Puedes aplicar igualmente y luego usar <strong>Kilómetros → Conflictos → Corregir todo</strong>.</div>`
    : '';

  el.innerHTML = `
    <div class="card">
      <div class="card-title">
        <div class="card-title-icon" style="background:#eef2ff;color:#4f46e5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div>
        Previsualización — ${esc(titulo)}
      </div>
      <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px">Se van a rellenar <strong>${res.rellenadas}</strong> práctica(s). Revisa los km y pulsa <strong>Aplicar</strong> para guardarlos tal cual se muestran.</p>
      ${avisoSolap}
      <div style="max-height:340px;overflow:auto;border:1px solid var(--border);border-radius:8px">
        <table>
          <thead><tr><th>Fecha</th><th>Alumno</th><th>Km</th><th>Recorrido</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-success" onclick="gkAplicarPlan()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Aplicar ${res.rellenadas} práctica(s)
        </button>
        <button class="btn btn-gray" onclick="gkLimpiarPreview()">Cancelar</button>
      </div>
    </div>`;
  el.classList.remove('hidden');
}

async function gkAplicarPlan() {
  if (!gkPlanActual || !gkPlanActual.asignaciones.length) return;
  if (!await confirmar(`Se van a guardar los km de ${gkPlanActual.asignaciones.length} práctica(s) tal como se muestran.\n\n¿Aplicar?`)) return;

  const res = await window.api.aplicarPlanKm(gkPlanActual.vid, gkPlanActual.asignaciones);
  const el = document.getElementById('gk-preview');
  if (res.errores && res.errores.length) {
    el.className = 'alert alert-err';
    el.textContent = res.errores.join(' ');
    el.classList.remove('hidden');
  } else {
    el.className = 'alert alert-ok';
    el.innerHTML = `${res.aplicadas} práctica(s) rellenadas. &nbsp;
      <button class="btn btn-warn btn-sm" style="margin-left:8px" onclick="navegarA('kilometros','conflictos')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Verificar solapamientos
      </button>`;
    el.classList.remove('hidden');
  }
  gkPlanActual = null;
  gkActualizarContador();
}
