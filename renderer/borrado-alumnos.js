// ─── BORRAR ALUMNOS POR FECHAS (2026-11-06) ─────────────────────────────────
// Alumnos → «Borrar por fechas»: se eligen unas fechas (a partir de un día, o entre dos) y se ve
// la lista de a quién afectaría y todo lo que tienen; solo después se borra. Siempre con copia de
// seguridad previa y con «Deshacer». Los cobros se conservan salvo que se pida lo contrario.
// (db/borrado-alumnos.js → proponerBorradoAlumnos / aplicarBorradoAlumnos / deshacerBorradoAlumnos)

const BO_CONFIRMAR_DESDE = 20;   // a partir de tantos alumnos hay que escribir BORRAR
let boEstado = { criterio: 'alta', desde: '', hasta: '', procedencia: '', incluirSinClases: false, borrarCobros: false };
let boPrevia = null;

function boLeerFiltros() {
  const v = id => (document.getElementById(id) || {}).value || '';
  boEstado = {
    criterio: boEstado.criterio, desde: v('bo-desde'), hasta: v('bo-hasta'), procedencia: v('bo-procedencia'),
    incluirSinClases: !!(document.getElementById('bo-sin-clases') || {}).checked,
    borrarCobros: !!(document.getElementById('bo-cobros') || {}).checked
  };
  return boEstado;
}

async function abrirBorradoAlumnos() {
  boPrevia = null;
  let borrados = [];
  try { borrados = await window.api.getBorradosAlumnos(); } catch (e) { /* sin historial */ }
  pmModal('modal-borrado-alumnos', boHTML(borrados));
  pintarFiltroProcedencia('bo-procedencia', (typeof alumnosCache !== 'undefined' ? alumnosCache : []).map(a => a.procedencia));
  const sel = document.getElementById('bo-procedencia'); if (sel) sel.value = boEstado.procedencia || '';
}

function boHTML(borrados) {
  const e = boEstado;
  const deshacibles = (borrados || []).filter(b => !b.deshecho && b.disponible);
  const histo = deshacibles.length ? `<div class="bo-historial"><b>Borrados que se pueden deshacer</b>${deshacibles.slice(0, 5).map(b => `
      <div class="bo-fila"><span>${esc(fmtFecha(b.fecha.slice(0, 10)))} · ${fmtMiles(b.alumnos)} ${b.alumnos === 1 ? 'alumno' : 'alumnos'}, ${fmtMiles(b.clases)} clases${b.cobros_borrados ? ' y sus cobros' : ''}</span>
      <button class="btn btn-outline btn-sm" onclick="boDeshacer('${esc(b.id)}')">Deshacer</button></div>`).join('')}</div>` : '';
  return `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0">Borrar alumnos por fechas</h3>
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-borrado-alumnos')">Cerrar</button>
    </div>
    <p style="font-size:13px;color:var(--text-muted);margin:4px 0 12px">Elige un periodo y verás a quién afecta <b>antes de borrar nada</b>. Se borra al alumno y todo lo suyo (clases, reservas, exámenes, tasas…); sus <b>cobros se conservan</b> salvo que marques lo contrario. Antes se hace una copia de seguridad y puedes deshacerlo.</p>
    <div class="aa-barra"><span>Mirar la fecha de</span><div class="seg">
      <button type="button" aria-pressed="${e.criterio === 'alta'}" onclick="boCriterio('alta')">alta del alumno</button>
      <button type="button" aria-pressed="${e.criterio === 'ultima_clase'}" onclick="boCriterio('ultima_clase')">su última clase</button></div></div>
    <div class="bo-fechas">
      <label>Desde <small>(a partir de este día)</small><input type="date" id="bo-desde" value="${esc(e.desde)}" aria-label="Desde"></label>
      <label>Hasta <small>(vacío = sin límite)</small><input type="date" id="bo-hasta" value="${esc(e.hasta)}" aria-label="Hasta"></label>
      <label class="filtro-inline">Procedencia <select id="bo-procedencia" aria-label="Procedencia"><option value="">Cualquier procedencia</option></select></label>
    </div>
    <label class="bo-opcion ${e.criterio === 'ultima_clase' ? '' : 'hidden'}" id="bo-sin-clases-caja"><input type="checkbox" id="bo-sin-clases" ${e.incluirSinClases ? 'checked' : ''}> Incluir también a los que no han dado ninguna clase (se miran por su fecha de alta)</label>
    <div style="margin:10px 0"><button class="btn btn-primary" onclick="boVerPrevia()">Ver a quién afecta</button></div>
    <div id="bo-resultado"></div>
    ${histo}`;
}

function boCriterio(c) {
  boLeerFiltros(); boEstado.criterio = c;
  document.querySelectorAll('#modal-borrado-alumnos .aa-barra .seg button').forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === (c === 'alta'))));
  const caja = document.getElementById('bo-sin-clases-caja'); if (caja) caja.classList.toggle('hidden', c !== 'ultima_clase');
  boPrevia = null; const r = document.getElementById('bo-resultado'); if (r) r.innerHTML = '';
}

async function boVerPrevia() {
  const f = boLeerFiltros();
  const r = document.getElementById('bo-resultado');
  if (!f.desde && !f.hasta) { r.innerHTML = '<div class="alert alert-warn">Pon al menos una fecha: «desde» (a partir de ese día) o «hasta».</div>'; return; }
  r.innerHTML = '<div class="empty">Buscando…</div>';
  let p;
  try { p = await window.api.proponerBorradoAlumnos(f, getSucursalActual()); }
  catch (err) { r.innerHTML = '<div class="alert alert-err">No se pudo preparar la lista.</div>'; return; }
  if (!p || !p.ok) { r.innerHTML = `<div class="alert alert-err">${esc((p && p.error) || 'No se pudo preparar la lista.')}</div>`; return; }
  boPrevia = p;
  if (!p.total) { r.innerHTML = `<div class="alert alert-ok">Ningún alumno cumple ese filtro.</div>${(p.avisos || []).map(a => `<div class="fd-vacio" style="margin-top:6px">${esc(a)}</div>`).join('')}`; return; }
  const s = p.resumen;
  const pills = [
    `<span class="pill pill-dark">${fmtMiles(s.alumnos)} ${s.alumnos === 1 ? 'alumno' : 'alumnos'}</span>`,
    `<span class="pill pill-line">${esc(fmtClases(s.clases))} ${s.clases === 1 ? 'clase' : 'clases'}</span>`,
    s.cobros ? `<span class="pill pill-line">${fmtMiles(s.cobros)} cobros · ${esc(fmtDec(s.importe_cobrado))} €</span>` : '',
    s.examenes ? `<span class="pill pill-line">${fmtMiles(s.examenes)} exámenes</span>` : '',
    s.deben ? `<span class="pill pill-err">${fmtMiles(s.deben)} deben dinero</span>` : '',
    s.con_clase_reciente ? `<span class="pill pill-warn">${fmtMiles(s.con_clase_reciente)} con clase en el último mes</span>` : '',
    s.con_examen_pendiente ? `<span class="pill pill-warn">${fmtMiles(s.con_examen_pendiente)} con clase o examen por delante</span>` : ''
  ].filter(Boolean).join(' ');
  const filas = p.alumnos.map((x, i) => {
    const avisos = [
      x.debe > 0 ? `<span class="pill pill-err">Debe ${esc(fmtDec(x.debe))} €</span>` : '',
      x.reciente ? '<span class="pill pill-warn">Clase reciente</span>' : '',
      x.examen_pendiente ? '<span class="pill pill-warn">Por delante</span>' : '',
      x.procedencia ? etiquetaProcedencia(x.procedencia) : ''
    ].filter(Boolean).join(' ');
    return `<tr data-id="${x.id}">
      <td><input type="checkbox" class="bo-ok" checked aria-label="Borrar a este alumno" onchange="boContar()"></td>
      <td><b>${esc(nombrePropio(x.nombre))}</b> ${tagPermiso(x.permiso)}${x.n_registro ? ` <span class="num-mono" style="color:var(--text-faint)">nº ${esc(x.n_registro)}</span>` : ''}</td>
      <td>${x.fecha_alta ? esc(fmtFecha(x.fecha_alta)) : '<span class="fd-vacio">—</span>'}</td>
      <td>${x.ultima_clase ? esc(fmtFecha(x.ultima_clase)) : '<span class="fd-vacio">Sin clases</span>'}</td>
      <td class="col-num">${x.clases || x.previas ? esc(fmtClases(x.clases + x.previas)) : '—'}</td>
      <td class="col-num">${x.cobros ? `${esc(fmtDec(x.cobrado))} €` : '—'}</td>
      <td>${avisos}</td></tr>`;
  }).join('');
  r.innerHTML = `
    <div class="bo-resumen">${pills}</div>
    ${(p.avisos || []).map(a => `<div class="fd-vacio" style="margin:4px 0">${esc(a)}</div>`).join('')}
    <div class="table-wrap ar-tabla aa-tabla"><table><thead><tr>
      <th><input type="checkbox" checked aria-label="Marcar todos" onchange="document.querySelectorAll('#modal-borrado-alumnos .bo-ok').forEach(c => { c.checked = this.checked; }); boContar()"></th>
      <th>Alumno</th><th>Alta</th><th>Última clase</th><th class="col-num">Clases</th><th class="col-num">Cobrado</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
    ${p.truncado ? `<div class="fd-vacio" style="margin-top:6px">Se enseñan los primeros ${fmtMiles(p.alumnos.length)} de ${fmtMiles(p.total)}: si no los desmarcas, se borran todos los que cumplen el filtro.</div>` : ''}
    <label class="bo-opcion"><input type="checkbox" id="bo-cobros" ${boEstado.borrarCobros ? 'checked' : ''} onchange="boContar()"> Borrar también sus <b>cobros y cargos</b> (por defecto se conservan para la contabilidad)</label>
    <div id="bo-confirmar-caja" class="hidden" style="margin-top:8px"><label style="font-size:13px">Son muchos alumnos. Escribe <b>BORRAR</b> para confirmar <input type="text" id="bo-escribir" autocomplete="off" style="width:120px;margin-left:8px" oninput="boContar()"></label></div>
    <div id="bo-msg" class="hidden" style="margin-top:10px"></div>
    <div class="ar-pie">
      <button class="btn btn-gray" onclick="closeModal('modal-borrado-alumnos')">Cancelar</button>
      <button class="btn btn-danger" id="bo-aplicar" onclick="boAplicar()">Borrar</button>
    </div>`;
  boContar();
}

// Cuántos están marcados (los que no se ven en la lista, por ser muchos, cuentan como marcados)
function boMarcados() {
  if (!boPrevia) return { n: 0, ids: [] };
  const visibles = [...document.querySelectorAll('#modal-borrado-alumnos tbody tr')];
  const sinMarcar = new Set(visibles.filter(tr => !tr.querySelector('.bo-ok').checked).map(tr => +tr.dataset.id));
  const ids = boPrevia.ids.filter(id => !sinMarcar.has(id));
  return { n: ids.length, ids };
}
function boContar() {
  const { n } = boMarcados();
  const b = document.getElementById('bo-aplicar'); if (!b) return;
  const cobros = (document.getElementById('bo-cobros') || {}).checked;
  b.textContent = n ? `Borrar ${fmtMiles(n)} ${n === 1 ? 'alumno' : 'alumnos'}${cobros ? ' y sus cobros' : ''}` : 'Borrar';
  const pideTexto = n > BO_CONFIRMAR_DESDE;
  const caja = document.getElementById('bo-confirmar-caja'); if (caja) caja.classList.toggle('hidden', !pideTexto);
  const escrito = ((document.getElementById('bo-escribir') || {}).value || '').trim().toUpperCase() === 'BORRAR';
  b.disabled = !n || (pideTexto && !escrito);
}

async function boAplicar() {
  const f = boLeerFiltros();
  const { n, ids } = boMarcados();
  if (!n) { showToast('bo-msg', 'Marca al menos un alumno.', 'err'); return; }
  const cobros = f.borrarCobros;
  const ok = await confirmar(`Se van a borrar ${fmtMiles(n)} ${n === 1 ? 'alumno' : 'alumnos'} con todas sus clases, reservas, exámenes y tasas${cobros ? ', y también sus cobros y cargos' : ' (sus cobros se conservan)'}.\n\nAntes se hace una copia de seguridad y podrás deshacerlo desde esta misma ventana.\n\n¿Borrar?`, { peligro: true, textoAceptar: 'Borrar' });
  if (!ok) return;
  const b = document.getElementById('bo-aplicar'); if (b) { b.disabled = true; b.textContent = 'Borrando…'; }
  let r;
  try { r = await window.api.aplicarBorradoAlumnos({ ...f, ids }, getSucursalActual()); }
  catch (err) { r = { ok: false, error: 'No se pudo borrar.' }; }
  if (!r || !r.ok) { showToast('bo-msg', (r && r.error) || 'No se pudo borrar.', 'err'); boContar(); return; }
  closeModal('modal-borrado-alumnos');
  boEstado.desde = ''; boEstado.hasta = ''; boPrevia = null;
  if (typeof refrescarTrasRevisarAlumnos === 'function') await refrescarTrasRevisarAlumnos();
  avisoConDeshacer(`Borrados ${fmtMiles(r.borrados.alumnos)} ${r.borrados.alumnos === 1 ? 'alumno' : 'alumnos'} y ${fmtMiles(r.borrados.practicas || 0)} clases${r.cobros_borrados ? ' con sus cobros' : '; sus cobros se conservan'}.`, `boDeshacer('${r.id}')`);
}

async function boDeshacer(id) {
  const r = await window.api.deshacerBorradoAlumnos(id);
  if (!r || !r.ok) { await avisar((r && r.error) || 'No se pudo deshacer.'); return; }
  closeModal('modal-borrado-alumnos');
  if (typeof refrescarTrasRevisarAlumnos === 'function') await refrescarTrasRevisarAlumnos();
  showToast('alumnos-alta-toast', `Devueltos ${fmtMiles(r.devueltos.alumnos)} ${r.devueltos.alumnos === 1 ? 'alumno' : 'alumnos'} con sus clases.`, 'ok');
}
