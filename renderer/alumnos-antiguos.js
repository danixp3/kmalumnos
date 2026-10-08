// ─── ALUMNOS ANTIGUOS → INACTIVOS (2026-10-09) ──────────────────────────────
// Hay alumnos que empezaron y nunca terminaron el permiso en la autoescuela: siguen
// «en curso», salen en avisos («lleva 200 días sin clase», DNI por caducar…) y
// ensucian las listas. Aquí se revisan juntos y se pasan a «Inactivo» de una vez
// (db/alumnos.js → proponerAlumnosInactivos / setEstadoAlumnos). No se borra nada:
// siguen en Alumnos → Todos y se pueden volver a poner «En prácticas» desde su estado.

let aaMeses = 6;      // cuánto tiempo sin clase para proponerlo
let aaLista = [];     // lo que se está viendo
const AA_MESES = [3, 6, 12, 24];

// «hace 8 meses» / «hace 1 año y 2 meses»
function aaHaceTiempo(iso) {
  const dias = diasEntre(iso, hoyISO());
  if (dias < 45) return `hace ${dias} días`;
  const meses = Math.round(dias / 30.4);
  if (meses < 12) return `hace ${meses} meses`;
  const a = Math.floor(meses / 12), m = meses % 12;
  return `hace ${a} ${a === 1 ? 'año' : 'años'}${m ? ` y ${m} ${m === 1 ? 'mes' : 'meses'}` : ''}`;
}

async function abrirAlumnosAntiguos(meses) {
  if (meses) aaMeses = meses;
  let r;
  try { r = await window.api.proponerAlumnosInactivos({ meses: aaMeses }, getSucursalActual()); }
  catch (e) { await avisar('No se pudo preparar la lista de alumnos antiguos.'); return; }
  aaLista = r.alumnos || [];
  const filas = aaLista.map((x, i) => {
    const debe = x.debe > 0.005;
    const cuando = x.ultima_fecha
      ? `${esc(fmtFecha(x.ultima_fecha))}<div class="ar-nota">${esc(aaHaceTiempo(x.ultima_fecha))}</div>`
      : `<span class="fd-vacio">Nunca ha dado clase</span><div class="ar-nota">alta ${esc(aaHaceTiempo(x.fecha_alta))}</div>`;
    return `<tr data-i="${i}">
      <td><input type="checkbox" class="aa-ok" ${debe ? '' : 'checked'} aria-label="Pasar a inactivo" onchange="aaContar()"></td>
      <td><b>${esc(nombrePropio(x.nombre))}</b> ${tagPermiso(x.permiso)}${x.n_registro ? ` <span class="num-mono" style="color:var(--text-faint)">nº ${esc(x.n_registro)}</span>` : ''}</td>
      <td>${cuando}</td>
      <td class="col-num">${x.clases ? esc(fmtClases(x.clases)) : '—'}</td>
      <td>${debe ? `<span class="pill pill-err" title="Tiene pagos pendientes: se deja sin marcar">Debe ${esc(String(x.debe).replace('.', ','))} €</span>` : ''}</td></tr>`;
  }).join('');
  const meses_ = AA_MESES.map(m => `<button type="button" aria-pressed="${m === aaMeses}" onclick="abrirAlumnosAntiguos(${m})">${m < 12 ? m + ' meses' : (m / 12) + (m === 12 ? ' año' : ' años')}</button>`).join('');
  pmModal('modal-alumnos-antiguos', `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0">Alumnos antiguos que siguen «en curso»</h3>
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-alumnos-antiguos')">Cerrar</button>
    </div>
    <p style="font-size:13px;color:var(--text-muted);margin:4px 0 12px">Son alumnos que no han dado ninguna clase desde hace tiempo y no tienen clase ni examen por delante. Los que pases a <b>Inactivo</b> dejan de salir en avisos, semáforos, caducidades y listas de clase. No se borra nada: siguen en Alumnos → Todos y puedes volver a ponerlos «En prácticas» cuando quieras.</p>
    <div class="aa-barra"><span>Sin clase desde hace más de</span><div class="seg">${meses_}</div></div>
    ${aaLista.length ? `<div class="table-wrap ar-tabla aa-tabla"><table><thead><tr>
        <th><input type="checkbox" checked aria-label="Marcar todos" onchange="document.querySelectorAll('#modal-alumnos-antiguos .aa-ok').forEach(c => { c.checked = this.checked; }); aaContar()"></th>
        <th>Alumno</th><th>Última clase</th><th class="col-num">Clases</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
      : `<div class="alert alert-ok">No hay alumnos en curso que lleven más de ${aaMeses} meses sin clase.</div>`}
    <div id="aa-msg" class="hidden" style="margin-top:10px"></div>
    <div class="ar-pie">
      <button class="btn btn-gray" onclick="closeModal('modal-alumnos-antiguos')">Cancelar</button>
      <button class="btn btn-primary" id="aa-aplicar" onclick="aaAplicar()" ${aaLista.length ? '' : 'disabled'}>Pasar a inactivos</button>
    </div>`);
  aaContar();
}

function aaContar() {
  const n = document.querySelectorAll('#modal-alumnos-antiguos .aa-ok:checked').length;
  const b = document.getElementById('aa-aplicar'); if (!b) return;
  b.textContent = n ? `Pasar ${fmtMiles(n)} ${n === 1 ? 'alumno' : 'alumnos'} a inactivos` : 'Pasar a inactivos';
  b.disabled = !n;
}

async function aaAplicar() {
  const ids = [...document.querySelectorAll('#modal-alumnos-antiguos tbody tr')]
    .filter(tr => tr.querySelector('.aa-ok').checked).map(tr => aaLista[+tr.dataset.i].id);
  if (!ids.length) { showToast('aa-msg', 'Marca al menos un alumno.', 'err'); return; }
  const r = await window.api.setEstadoAlumnos(ids, 'inactivo');
  if (!r || !r.ok) { showToast('aa-msg', (r && r.error) || 'No se pudo guardar.', 'err'); return; }
  estadoDeshacer = r.anteriores;
  closeModal('modal-alumnos-antiguos');
  await refrescarTrasRevisarAlumnos();
  avisoConDeshacer(`${fmtMiles(r.cambiados)} ${r.cambiados === 1 ? 'alumno pasa' : 'alumnos pasan'} a «Inactivo»: ya no salen en avisos ni caducidades.`, 'deshacerEstadoAlumnoUI()');
}
