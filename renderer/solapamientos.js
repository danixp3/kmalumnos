// ─── SOLAPAMIENTOS ───────────────────────────────────────────────────────────
// Detección y corrección automática de solapamientos de km entre prácticas.

// ─── SOLAPAMIENTOS ───────────────────────────────────────────────────────────
async function loadSolapamientos() {
  const conflictos = await window.api.getSolapamientos();
  const el = document.getElementById('solap-result');
  const btnCorregir = document.getElementById('btn-corregir-todo');

  if (!conflictos.length) {
    el.innerHTML = '<div class="card"><p class="empty" style="color:var(--success-fg);font-weight:600">✓ No se detectaron solapamientos de kilómetros.</p></div>';
    if (btnCorregir) btnCorregir.style.display = 'none';
    return;
  }

  if (btnCorregir) btnCorregir.style.display = 'inline-block';

  // Agrupar por vehículo
  const porVehiculo = {};
  conflictos.forEach(c => {
    if (!porVehiculo[c.vehiculo]) porVehiculo[c.vehiculo] = [];
    porVehiculo[c.vehiculo].push(c);
  });

  const vehiculosAfectados = Object.keys(porVehiculo).length;
  let html = `<div class="alert alert-err" style="margin-bottom:16px">Se encontraron <strong>${conflictos.length}</strong> solapamiento(s) en <strong>${vehiculosAfectados}</strong> vehículo(s). Pulsa <strong>Corregir todo automáticamente</strong> para que el programa reordene todos los km.</div>`;

  for (const [vehiculo, lista] of Object.entries(porVehiculo)) {
    html += `<div class="card" style="padding:0 0 1px;margin-bottom:16px">
      <div style="padding:12px 16px;background:var(--warn-bg);border-radius:10px 10px 0 0;font-weight:700;font-size:13px;color:var(--warn-fg)">
        ${esc(vehiculo)} — ${lista.length} conflicto(s)
      </div>
      <table>
        <thead><tr><th>Alumno A</th><th>Fecha A</th><th>Km A</th><th></th><th>Alumno B</th><th>Fecha B</th><th>Km B</th></tr></thead>
        <tbody>`;
    lista.forEach(c => {
      const a = c.practica_a;
      const b = c.practica_b;
      html += `<tr>
        <td><strong>${esc(a.alumno)}</strong></td>
        <td>${fmtFecha(a.fecha)}</td>
        <td><span class="km-badge">${fmt(a.km_inicial)} → ${fmt(a.km_final)}</span></td>
        <td style="color:#dc2626;font-weight:700;text-align:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></td>
        <td><strong>${esc(b.alumno)}</strong></td>
        <td>${fmtFecha(b.fecha)}</td>
        <td><span class="km-badge">${fmt(b.km_inicial)} → ${fmt(b.km_final)}</span></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  el.innerHTML = html;
}

async function corregirTodosSolapamientos() {
  const min = parseFloat(document.getElementById('solap-min').value) || 40;
  const max = parseFloat(document.getElementById('solap-max').value) || 45;

  // Obtener todos los vehículos con solapamientos
  const conflictos = await window.api.getSolapamientos();
  if (!conflictos.length) return;

  const vehiculosAfectados = [...new Set(conflictos.map(c => c.vehiculo_id))];

  if (!confirm(`Se van a reordenar los kilómetros de ${vehiculosAfectados.length} vehículo(s) para eliminar todos los solapamientos.\n\nEl programa respetará la duración real de cada práctica y las reencadenará en orden cronológico.\n\n¿Continuar?`)) return;

  let totalCorregidas = 0;
  for (const vid of vehiculosAfectados) {
    const res = await window.api.corregirSolapamientos(vid, min, max);
    totalCorregidas += res.corregidas || 0;
  }

  // Reanalizar
  const restantes = await window.api.getSolapamientos();
  const el = document.getElementById('solap-result');
  const btnCorregir = document.getElementById('btn-corregir-todo');

  if (!restantes.length) {
    if (btnCorregir) btnCorregir.style.display = 'none';
    el.innerHTML = `<div class="alert alert-ok">Corrección completada. ${totalCorregidas} práctica(s) reordenadas. No quedan solapamientos.</div>`;
  } else {
    el.innerHTML = `<div class="alert alert-err">Se corrigieron ${totalCorregidas} prácticas pero aún quedan ${restantes.length} solapamientos. Pulsa Analizar para revisar.</div>`;
  }
}

