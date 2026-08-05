// ─── JORNADA LABORAL (FICHAJES) ────────────────────────────────────────────
// UI del registro de jornada (art. 34.9 ET): botón único de fichar que
// cambia solo según haya o no una jornada abierta hoy para el empleado
// escrito, lista filtrable por fecha/empleado con corrección auditada y
// exportación a CSV para Inspección de Trabajo. Todo pasa por los IPC de
// db/jornadas.js — registro LOCAL, no sincroniza con la nube.

let jornadasCache = [];

// Diferencia entrada→salida en formato "Xh Ym". Vacío si falta la salida.
function calcHoras(entrada, salida) {
  if (!entrada || !salida) return '';
  const [he, me] = entrada.split(':').map(Number);
  const [hs, ms] = salida.split(':').map(Number);
  let minutos = (hs * 60 + ms) - (he * 60 + me);
  if (minutos < 0) minutos += 24 * 60; // por si la salida cae al día siguiente
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h ${m}m`;
}

async function loadJornadas() {
  const desde = document.getElementById('f-jornada-desde')?.value || '';
  const hasta = document.getElementById('f-jornada-hasta')?.value || '';
  const empleado = document.getElementById('f-jornada-empleado')?.value.trim() || '';
  jornadasCache = await window.api.getJornadas({ sucursalId: getSucursalActual(), desde, hasta, empleado });
  renderJornadasLista();
  actualizarBotonFichaje();
}

function renderJornadasLista() {
  const tbody = document.querySelector('#tabla-jornadas tbody');
  if (!tbody) return;

  if (!jornadasCache.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay jornadas registradas</td></tr>';
    return;
  }

  tbody.innerHTML = jornadasCache.map(j => {
    const nCorr = (j.correcciones || []).length;
    const correccionesTitle = nCorr
      ? (j.correcciones.map(c => `${c.ts}: ${c.campo} "${c.antes || ''}" → "${c.despues || ''}"`).join('\n'))
      : '';
    const correccionesTxt = nCorr
      ? `<span class="badge" title="${esc(correccionesTitle)}">${nCorr}</span>`
      : '<span style="color:var(--placeholder)">—</span>';

    return `<tr>
      <td>${fmtFecha(j.fecha)}</td>
      <td>${esc(j.empleado)}</td>
      <td>${j.sucursal_nombre ? esc(j.sucursal_nombre) : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${j.entrada ? esc(j.entrada) : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${j.salida ? esc(j.salida) : '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${calcHoras(j.entrada, j.salida)}</td>
      <td>${correccionesTxt}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="abrirCorregirJornada(${j.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Corregir</button>
        <button class="btn btn-danger btn-sm" onclick="borrarJornadaUI(${j.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> Borrar</button>
      </td>
    </tr>`;
  }).join('');
}

// Lee el nombre del cuadro de fichar y consulta si ese empleado tiene ya una
// jornada abierta hoy, para decidir si el botón dice "entrada" o "salida".
// Se dispara en cada tecla del nombre: las respuestas pueden llegar
// desordenadas, así que se descarta la que ya no corresponde a lo escrito
// (si no, el botón podría quedar apuntando a la jornada de otro empleado).
let _jornadaConsultaSeq = 0;

async function actualizarBotonFichaje() {
  const btn = document.getElementById('btn-fichar');
  if (!btn) return;
  const empleado = document.getElementById('jor-empleado')?.value.trim() || '';
  if (!empleado) {
    btn.textContent = 'Fichar entrada';
    delete btn.dataset.jornadaId;
    return;
  }
  const seq = ++_jornadaConsultaSeq;
  const abierta = await window.api.jornadaAbiertaDe(empleado, getSucursalActual());
  const actual = document.getElementById('jor-empleado')?.value.trim() || '';
  if (seq !== _jornadaConsultaSeq || actual !== empleado) return; // respuesta obsoleta
  if (abierta) {
    btn.textContent = 'Fichar salida';
    btn.dataset.jornadaId = abierta.id;
  } else {
    btn.textContent = 'Fichar entrada';
    delete btn.dataset.jornadaId;
  }
}

async function toggleFichaje() {
  const empleado = document.getElementById('jor-empleado')?.value.trim() || '';
  if (!empleado) {
    showToast('jornada-toast', 'Escribe el nombre del empleado.', 'err');
    return;
  }

  // No se confía en el estado pintado del botón: se vuelve a preguntar por el
  // empleado escrito justo antes de actuar, para no cerrar la jornada de otro.
  const abierta = await window.api.jornadaAbiertaDe(empleado, getSucursalActual());

  if (abierta) {
    const res = await window.api.ficharSalida(abierta.id);
    if (!res || !res.ok) {
      showToast('jornada-toast', (res && res.msg) || 'No se pudo fichar la salida.', 'err');
      return;
    }
    showToast('jornada-toast', `Salida fichada a las ${new Date().toTimeString().slice(0, 5)}.`, 'ok');
  } else {
    await window.api.ficharEntrada({ empleado, sucursal_id: getSucursalActual(), nota: '' });
    showToast('jornada-toast', `Entrada fichada a las ${new Date().toTimeString().slice(0, 5)}.`, 'ok');
  }
  await loadJornadas();
}

function abrirCorregirJornada(id) {
  const j = jornadasCache.find(x => x.id === id);
  if (!j) return;
  document.getElementById('jor-edit-id').value = j.id;
  document.getElementById('jor-edit-entrada').value = j.entrada || '';
  document.getElementById('jor-edit-salida').value = j.salida || '';
  document.getElementById('jor-edit-nota').value = j.nota || '';
  openModal('modal-jornada');
}

async function guardarCorreccionJornada() {
  const id = parseInt(document.getElementById('jor-edit-id').value);
  const entrada = document.getElementById('jor-edit-entrada').value || null;
  const salida = document.getElementById('jor-edit-salida').value || null;
  const nota = document.getElementById('jor-edit-nota').value.trim();
  await window.api.corregirJornada(id, { entrada, salida, nota });
  closeModal('modal-jornada');
  loadJornadas();
}

async function borrarJornadaUI(id) {
  if (!confirm('¿Borrar esta jornada?')) return;
  await window.api.borrarJornada(id);
  loadJornadas();
}

// CSV en cliente (separador ';' para Excel ES, BOM para acentos), a partir de
// la lista actualmente en cache — mismo patrón que las demás exportaciones.
function exportarJornadasCSV() {
  const escCSV = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const cabecera = ['Fecha', 'Empleado', 'Sucursal', 'Entrada', 'Salida', 'Horas', 'Nota'];
  const filas = jornadasCache.map(j => [
    j.fecha || '',
    j.empleado || '',
    j.sucursal_nombre || '',
    j.entrada || '',
    j.salida || '',
    calcHoras(j.entrada, j.salida),
    j.nota || ''
  ]);
  const csv = '﻿' + [cabecera, ...filas].map(fila => fila.map(escCSV).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jornadas.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
