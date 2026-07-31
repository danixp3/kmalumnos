// ─── IMPORTAR / EXPORTAR / COMPARAR CSV ────────────────────────────────────────
// Selección e importación de CSV de prácticas, exportación y comparación de dos
// archivos CSV.

// ─── IMPORTAR CSV ─────────────────────────────────────────────────────────────
async function seleccionarCSV() {
  const filePath = await window.api.openCsvDialog();
  if (!filePath) return;
  selectedCsvPath = filePath;
  document.getElementById('csv-path').textContent = filePath;
  document.getElementById('btn-importar').disabled = false;
  showImportAlert('Archivo seleccionado. Pulsa "Importar" para procesar.', 'info');
}

async function importarCSV() {
  if (!selectedCsvPath) return;
  const kmMin = parseFloat(document.getElementById('imp-min').value) || 40;
  const kmMax = parseFloat(document.getElementById('imp-max').value) || 45;
  const result = await window.api.importarCsv(selectedCsvPath, kmMin, kmMax);
  if (!result.ok) {
    showImportAlert('Error: ' + result.msg, 'err');
    return;
  }
  let msg = `Importación completada: ${result.insertados} prácticas insertadas.`;
  if (result.errores > 0) {
    msg += `\n\n${result.errores} filas con error:\n`;
    msg += result.erroresDetalle.map(e => `  • Fila ${e.fila}: ${e.motivo}  [${e.datos}]`).join('\n');
    showImportAlert(msg.replace(/\n/g, '<br>'), result.insertados > 0 ? 'ok' : 'err');
  } else {
    showImportAlert(msg, 'ok');
  }
  if (result.erroresDetalle && result.erroresDetalle.length) {
    console.table(result.erroresDetalle);
  }
  selectedCsvPath = null;
  document.getElementById('csv-path').textContent = '';
  document.getElementById('btn-importar').disabled = true;
}

function showImportAlert(msg, type) {
  const el = document.getElementById('import-alert');
  el.className = `alert alert-${type}`;
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

// ─── EXPORTAR / COMPARAR CSV ─────────────────────────────────────────────────
let csvAPath = null, csvBPath = null;

async function exportarCSV() {
  const res = await window.api.exportarCsv({});
  const el = document.getElementById('export-result');
  if (res.canceled) { el.classList.add('hidden'); return; }
  if (!res.ok) {
    el.className = 'alert alert-err';
    el.textContent = 'Error: ' + res.msg;
  } else {
    el.className = 'alert alert-ok';
    el.textContent = `Exportadas ${res.total} prácticas a: ${res.path}`;
  }
  el.classList.remove('hidden');
}

async function seleccionarCsvA() {
  const path = await window.api.openCsvDialog();
  if (!path) return;
  csvAPath = path;
  document.getElementById('csv-a-path').value = path.split(/[/\\]/).pop();
  actualizarBtnComparar();
}

async function seleccionarCsvB() {
  const path = await window.api.openCsvDialog();
  if (!path) return;
  csvBPath = path;
  document.getElementById('csv-b-path').value = path.split(/[/\\]/).pop();
  actualizarBtnComparar();
}

function actualizarBtnComparar() {
  document.getElementById('btn-comparar').disabled = !(csvAPath && csvBPath);
}

async function compararCSVs() {
  if (!csvAPath || !csvBPath) return;
  const res = await window.api.compararCsvs(csvAPath, csvBPath, {});
  
  if (!res.ok) {
    alert('Error al comparar: ' + res.msg);
    return;
  }
  
  const r = res.resumen;
  document.getElementById('cmp-resumen').innerHTML = `
    <div style="background:var(--gray-light);padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700">${r.totalA}</div>
      <div style="font-size:11px;color:var(--text-muted)">Prácticas CSV A</div>
    </div>
    <div style="background:var(--gray-light);padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700">${r.totalB}</div>
      <div style="font-size:11px;color:var(--text-muted)">Prácticas CSV B</div>
    </div>
    <div style="background:#e0e7ff;padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#4f46e5">${r.alumnosTotal}</div>
      <div style="font-size:11px;color:#3730a3">Alumnos totales</div>
    </div>
    <div style="background:#d1fae5;padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#059669">${r.diasCoinciden}</div>
      <div style="font-size:11px;color:#065f46">Días coinciden</div>
    </div>
    <div style="background:#fee2e2;padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#dc2626">${r.diasConflicto}</div>
      <div style="font-size:11px;color:#991b1b">Conflictos (≠ prácticas)</div>
    </div>
    <div style="background:#fef3c7;padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#d97706">${r.diasSoloEnA}</div>
      <div style="font-size:11px;color:#92400e">Días solo en A</div>
    </div>
    <div style="background:#dbeafe;padding:12px;border-radius:8px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#2563eb">${r.diasSoloEnB}</div>
      <div style="font-size:11px;color:#1e40af">Días solo en B</div>
    </div>
  `;
  
  // Alumnos diferentes
  const alumnosCard = document.getElementById('cmp-alumnos-card');
  if (res.alumnosSoloEnA.length || res.alumnosSoloEnB.length) {
    alumnosCard.style.display = '';
    document.getElementById('cmp-alumnos').innerHTML = `
      ${res.alumnosSoloEnA.length ? `<div style="margin-bottom:8px"><strong style="color:var(--warn-fg-soft)">Solo en A:</strong> ${res.alumnosSoloEnA.map(a => esc(a)).join(', ')}</div>` : ''}
      ${res.alumnosSoloEnB.length ? `<div><strong style="color:var(--info-fg)">Solo en B:</strong> ${res.alumnosSoloEnB.map(a => esc(a)).join(', ')}</div>` : ''}
    `;
  } else {
    alumnosCard.style.display = 'none';
  }
  
  // Detalle por alumno
  const detalleCard = document.getElementById('cmp-detalle-card');
  const detalleBody = document.getElementById('cmp-detalle-body');
  
  // Filtrar solo alumnos con diferencias
  const alumnosConDiferencias = res.porAlumno.filter(a => 
    a.conflictos.length > 0 || a.soloEnA.length > 0 || a.soloEnB.length > 0
  );
  
  if (alumnosConDiferencias.length > 0) {
    detalleCard.style.display = '';
    detalleBody.innerHTML = alumnosConDiferencias.map(a => {
      let html = `<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="font-weight:600;font-size:14px;margin-bottom:8px;color:var(--primary)">${esc(a.nombre)}</div>`;
      
      if (a.coincidencias.length > 0) {
        html += `<div style="margin-bottom:6px"><span style="color:#059669;font-weight:500">✓ Coinciden (${a.coincidencias.length}):</span> 
          <span style="font-size:12px;color:var(--text-muted)">${a.coincidencias.map(c => `${c.fecha} (${c.cant})`).join(', ')}</span></div>`;
      }
      
      if (a.conflictos.length > 0) {
        html += `<div style="margin-bottom:6px"><span style="color:#dc2626;font-weight:500">Conflictos (${a.conflictos.length}):</span> 
          <span style="font-size:12px">${a.conflictos.map(c => `<span style="background:#fee2e2;padding:2px 6px;border-radius:4px;margin:2px">${c.fecha}: A=${c.cantA} vs B=${c.cantB}</span>`).join(' ')}</span></div>`;
      }
      
      if (a.soloEnA.length > 0) {
        html += `<div style="margin-bottom:6px"><span style="color:var(--warn-fg-soft);font-weight:500">Solo en A (${a.soloEnA.length}):</span>
          <span style="font-size:12px">${a.soloEnA.map(d => `<span style="background:#fef3c7;padding:2px 6px;border-radius:4px;margin:2px">${d.fecha} (${d.cant})</span>`).join(' ')}</span></div>`;
      }
      
      if (a.soloEnB.length > 0) {
        html += `<div><span style="color:var(--info-fg);font-weight:500">Solo en B (${a.soloEnB.length}):</span>
          <span style="font-size:12px">${a.soloEnB.map(d => `<span style="background:#dbeafe;padding:2px 6px;border-radius:4px;margin:2px">${d.fecha} (${d.cant})</span>`).join(' ')}</span></div>`;
      }
      
      html += '</div>';
      return html;
    }).join('');
  } else {
    detalleCard.style.display = 'none';
  }
  
  // Ocultar cards antiguos que ya no usamos
  document.getElementById('cmp-conflictos-card').style.display = 'none';
  document.getElementById('cmp-solo-a-card').style.display = 'none';
  document.getElementById('cmp-solo-b-card').style.display = 'none';
  document.getElementById('cmp-coincidencias-card').style.display = 'none';
  
  document.getElementById('cmp-results').classList.remove('hidden');
}

