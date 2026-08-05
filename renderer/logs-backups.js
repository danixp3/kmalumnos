// ─── LOGS Y BACKUP ───────────────────────────────────────────────────────────
// Historial de operaciones automáticas (logs) y copias de seguridad de data.json.

// ─── LOGS ────────────────────────────────────────────────────────────────────
const LOG_ICONS = { importacion: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', relleno: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>', correccion: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>', conflicto_sync: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' };
const LOG_COLORS = { importacion: '#1d4ed8', relleno: '#15803d', correccion: '#92400e', conflicto_sync: '#b91c1c' };
const LOG_BG = { importacion: '#eff6ff', relleno: '#f0fdf4', correccion: '#fef3c7', conflicto_sync: '#fef2f2' };

// ─── AUDITORÍA: FILTROS Y EXPORTACIÓN ──────────────────────────────────────
// Los filtros (texto/tipo/rango de fechas) se resuelven en db/core.js
// (getLogs(filtro)) para no traer al renderer más logs de los necesarios.
let logsCache = [];

function leerFiltroLogs() {
  return {
    texto: (document.getElementById('f-logs-texto')?.value || '').trim() || undefined,
    tipo: document.getElementById('f-logs-tipo')?.value || undefined,
    desde: document.getElementById('f-logs-desde')?.value || undefined,
    hasta: document.getElementById('f-logs-hasta')?.value || undefined,
  };
}

function limpiarFiltrosLogs() {
  const txt = document.getElementById('f-logs-texto');
  const tipo = document.getElementById('f-logs-tipo');
  const desde = document.getElementById('f-logs-desde');
  const hasta = document.getElementById('f-logs-hasta');
  if (txt) txt.value = '';
  if (tipo) tipo.value = '';
  if (desde) desde.value = '';
  if (hasta) hasta.value = '';
  loadLogs();
}

async function loadLogs() {
  ocultarConflictosSync(); // visitar Historial cuenta como "visto" el aviso de conflictos
  const logs = await window.api.getLogs(leerFiltroLogs());
  logsCache = logs;
  const el = document.getElementById('logs-result');
  if (!logs.length) {
    el.innerHTML = '<div class="card"><p class="empty">No hay operaciones que coincidan con el filtro.</p></div>';
    return;
  }
  el.innerHTML = logs.map(log => {
    const ico = LOG_ICONS[log.tipo] || '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
    const color = LOG_COLORS[log.tipo] || '#444';
    const bg = LOG_BG[log.tipo] || '#f9f9f9';
    const fecha = new Date(log.fecha).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const detallesHtml = log.detalles && log.detalles.length
      ? `<ul style="margin:8px 0 0 16px;padding:0;font-size:12px;color:#555;list-style:disc">
          ${log.detalles.slice(0,20).map(d => `<li>${esc(d)}</li>`).join('')}
          ${log.detalles.length > 20 ? `<li style="color:#888">... y ${log.detalles.length - 20} más</li>` : ''}
         </ul>`
      : '';
    return `<div class="card" style="border-left:4px solid ${color};background:${bg};margin-bottom:10px;padding:14px 18px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:13px;color:${color}">${ico} ${esc(log.descripcion)}</span>
        <span style="font-size:11px;color:#888">${fecha}</span>
      </div>
      ${detallesHtml}
    </div>`;
  }).join('');
}

// Exporta el historial actualmente filtrado (mismo patrón que
// renderer/informes.js:exportarInformeCSV — Blob + BOM para que Excel
// muestre bien los acentos).
function _csvLineaLogs(campos) {
  return campos.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';') + '\r\n';
}

function exportarLogsCSV() {
  if (!logsCache.length) { showToast('logs-toast', 'No hay operaciones que exportar con el filtro actual.', 'warn'); return; }
  let csv = '﻿';
  csv += _csvLineaLogs(['Fecha', 'Tipo', 'Descripción', 'Detalles']);
  for (const log of logsCache) {
    const detalles = Array.isArray(log.detalles) ? log.detalles.join(' | ') : '';
    csv += _csvLineaLogs([log.fecha, log.tipo, log.descripcion, detalles]);
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historial_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function borrarLogs() {
  if (!confirm('¿Borrar todo el historial de operaciones automáticas?')) return;
  await window.api.clearLogs();
  loadLogs();
}

// ─── BACKUP ──────────────────────────────────────────────────────────────────
async function hacerBackup() {
  const result = await window.api.crearBackup();
  const el = document.getElementById('backup-ok');
  if (result.ok) {
    el.innerHTML = `Copia guardada: <strong>${esc(result.nombre || result.file)}</strong>`;
    el.className = 'alert alert-ok';
  } else {
    el.innerHTML = `Error: ${esc(result.msg)}`;
    el.className = 'alert alert-err';
  }
  el.classList.remove('hidden');
  loadUltimoBackup();
}

let ultimoBackupInfo = null;

async function loadUltimoBackup() {
  const el = document.getElementById('ultimo-backup-info');
  const btn = document.getElementById('btn-restaurar-ultimo');
  ultimoBackupInfo = await window.api.getUltimoBackup();
  if (!el || !btn) return;
  if (!ultimoBackupInfo) {
    el.textContent = 'Todavía no se ha guardado ninguna copia en la carpeta de la aplicación.';
    btn.disabled = true;
    return;
  }
  const fecha = ultimoBackupInfo.fecha
    ? new Date(ultimoBackupInfo.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  el.innerHTML = `Última copia: <strong>${esc(ultimoBackupInfo.nombre)}</strong>${fecha ? ' · ' + fecha : ''}`;
  btn.disabled = false;
}

async function restaurarUltimoBackup() {
  if (!ultimoBackupInfo) return;
  if (!confirm(`Esto reemplazará todos los datos actuales por la copia "${ultimoBackupInfo.nombre}". ¿Continuar?`)) return;
  const result = await window.api.restaurarUltimoBackup();
  if (!result.ok) {
    alert('Error al restaurar: ' + (result.msg || 'Error desconocido.'));
    return;
  }
  alert('Backup restaurado correctamente. A continuación puedes subir estos datos a la nube (la restauración no se sube sola).');
  await pushAllToCloud();
  location.reload();
}

async function restaurarBackup() {
  const result = await window.api.restaurarBackup();
  if (!result) return;
  if (!result.ok) {
    const el = document.getElementById('restaurar-err');
    el.textContent = result.msg || 'Error desconocido.';
    el.classList.remove('hidden');
    return;
  }
  alert('Backup restaurado correctamente. La aplicación se recargará ahora.');
  location.reload();
}

