// ─── ALUMNOS REPETIDOS Y NOMBRES JUNTOS (2026-10-06) ───────────────────────
// Aviso en Alumnos cuando hay fichas por revisar y dos herramientas
// (db/alumnos-repetidos.js):
//   · Separar nombre y apellidos de los alumnos dados de alta en el móvil con
//     todo en «Nombre» (antes era una sola casilla).
//   · Juntar dos fichas de la misma persona: todo lo de una pasa a la otra
//     (clases, cobros, exámenes…), con vista previa y «Deshacer».
// Las ventanas se crean con pmModal (renderer/puesta-en-marcha.js).

const AR_AVISO_KEY = 'km_aviso_alumnos_revisar';
let arSeparar = [];          // propuesta de separar nombres que se está viendo
let arDeshacerSeparar = null; // lo que había antes de separar (para «Deshacer»)
let arFusion = null;          // { queda, seVa } de la vista previa abierta
let arUltimaFusion = null;    // id de la última fusión (para «Deshacer»)

// Aviso en la lista de Alumnos (se oculta hasta que cambie lo que hay por revisar)
async function avisoAlumnosRepetidos() {
  const cont = document.getElementById('alumnos-revisar-aviso'); if (!cont) return;
  let sep = [], rep = [], antiguos = { total: 0, meses: 6 };
  try { [sep, rep, antiguos] = await Promise.all([window.api.proponerSepararNombres(), window.api.buscarAlumnosRepetidos(), window.api.proponerAlumnosInactivos({ meses: 6 }, getSucursalActual())]); }
  catch (e) { cont.classList.add('hidden'); return; }
  // Solo los que seguro llevan los apellidos dentro del nombre (con «María José» o «Juan Carlos» no se
  // avisa: puede ser un nombre compuesto) y que siguen viniendo (a los inactivos o de baja no se les molesta)
  sep = sep.filter(x => x.seguro && !ESTADOS_ALUMNO_TERMINADO.includes(x.estado));
  const firma = `${sep.length}|${rep.length}|${antiguos.total}`;
  let oculto = null; try { oculto = localStorage.getItem(AR_AVISO_KEY); } catch (e) { /* sin almacenamiento */ }
  if ((!sep.length && !rep.length && !antiguos.total) || oculto === firma) { cont.classList.add('hidden'); cont.innerHTML = ''; return; }
  const partes = [];
  if (antiguos.total) partes.push(`<span><b>${fmtMiles(antiguos.total)}</b> ${antiguos.total === 1 ? 'alumno lleva' : 'alumnos llevan'} más de ${antiguos.meses} meses sin dar clase y ${antiguos.total === 1 ? 'sigue' : 'siguen'} «en curso» <button type="button" class="btn btn-sm btn-outline" onclick="abrirAlumnosAntiguos()">Revisar</button></span>`);
  if (sep.length) partes.push(`<span><b>${sep.length}</b> ${sep.length === 1 ? 'alumno tiene' : 'alumnos tienen'} los apellidos dentro del nombre <button type="button" class="btn btn-sm btn-outline" onclick="abrirSepararNombres()">Separar apellidos</button></span>`);
  if (rep.length) partes.push(`<span><b>${rep.length}</b> ${rep.length === 1 ? 'posible ficha repetida' : 'posibles fichas repetidas'} (la misma persona dos veces) <button type="button" class="btn btn-sm btn-outline" onclick="abrirAlumnosRepetidos()">Revisar</button></span>`);
  cont.className = 'alert alert-warn ar-aviso';
  cont.innerHTML = `<div class="ar-aviso-txt">${partes.join('')}</div><button type="button" class="btn btn-sm btn-ghost" title="Ocultar hasta que haya algo nuevo" aria-label="Ocultar" onclick="ocultarAvisoAlumnosRevisar('${firma}')">×</button>`;
}
function ocultarAvisoAlumnosRevisar(firma) {
  try { localStorage.setItem(AR_AVISO_KEY, firma); } catch (e) { /* solo esta vez */ }
  document.getElementById('alumnos-revisar-aviso')?.classList.add('hidden');
}

// ─── Separar nombre y apellidos ────────────────────────────────────────────
async function abrirSepararNombres(ids) {
  const lista = await window.api.proponerSepararNombres(ids || null);
  if (!lista.length) { await avisar(ids ? 'Este alumno ya tiene los apellidos en sus casillas.' : 'No hay alumnos con los apellidos dentro del nombre.'); return; }
  arSeparar = lista;
  const filas = lista.map((x, i) => `<tr data-i="${i}">
      <td><input type="checkbox" class="ar-sep-ok" ${x.seguro || ids ? 'checked' : ''} aria-label="Separar este"></td>
      <td>${esc(x.actual)}${x.n_registro ? ` <span class="num-mono" style="color:var(--text-faint)">nº ${esc(x.n_registro)}</span>` : ''}${x.movil ? ' <span class="pill pill-line" title="Dado de alta desde el móvil">móvil</span>' : ''}${x.seguro ? '' : '<div class="ar-nota">¿Es un nombre compuesto? Revísalo</div>'}</td>
      <td><input type="text" data-c="nombre" value="${esc(x.nombre)}"></td>
      <td><input type="text" data-c="primer_apellido" value="${esc(x.primer_apellido)}"></td>
      <td><input type="text" data-c="segundo_apellido" value="${esc(x.segundo_apellido)}"></td></tr>`).join('');
  pmModal('modal-separar-nombres', `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0">Separar nombre y apellidos</h3>
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-separar-nombres')">Cerrar</button>
    </div>
    <p style="font-size:13px;color:var(--text-muted);margin:4px 0 12px">${ids ? 'Este alumno tiene' : 'Estos alumnos tienen'} todo en «Nombre» (el alta del móvil tenía una sola casilla). Revisa cómo queda${ids ? '' : ', corrige lo que haga falta y desmarca los que ya estén bien'}. Solo cambia cómo se escribe el nombre: sus clases, cobros y demás datos siguen igual, y si más adelante traes los datos del programa anterior se juntan con su ficha.</p>
    <div class="table-wrap ar-tabla"><table><thead><tr><th><input type="checkbox" checked aria-label="Marcar todos" onchange="document.querySelectorAll('#modal-separar-nombres .ar-sep-ok').forEach(c => { c.checked = this.checked; })"></th><th>Ahora</th><th>Nombre</th><th>1.er apellido</th><th>2.º apellido</th></tr></thead><tbody>${filas}</tbody></table></div>
    <div id="ar-sep-msg" class="hidden" style="margin-top:10px"></div>
    <div class="ar-pie">
      <button class="btn btn-gray" onclick="closeModal('modal-separar-nombres')">Cancelar</button>
      <button class="btn btn-primary" onclick="aplicarSepararNombresUI()">Separar los marcados</button>
    </div>`);
}
async function aplicarSepararNombresUI() {
  const filas = [...document.querySelectorAll('#modal-separar-nombres tbody tr')]
    .filter(tr => tr.querySelector('.ar-sep-ok').checked)
    .map(tr => { const o = { id: arSeparar[+tr.dataset.i].id }; tr.querySelectorAll('[data-c]').forEach(el => { o[el.dataset.c] = el.value.trim(); }); return o; });
  if (!filas.length) { showToast('ar-sep-msg', 'Marca al menos un alumno.', 'err'); return; }
  const r = await window.api.aplicarSepararNombres(filas);
  if (!r.ok) { showToast('ar-sep-msg', (r.errores || []).join(' ') || 'No se pudo guardar.', 'err'); return; }
  arDeshacerSeparar = r.anteriores;
  closeModal('modal-separar-nombres');
  await refrescarTrasRevisarAlumnos();
  avisoConDeshacer(`Nombre y apellidos separados en ${r.cambiados} ${r.cambiados === 1 ? 'alumno' : 'alumnos'}.`, 'deshacerSepararNombresUI()');
}
async function deshacerSepararNombresUI() {
  if (!arDeshacerSeparar || !arDeshacerSeparar.length) return;
  await window.api.aplicarSepararNombres(arDeshacerSeparar);
  arDeshacerSeparar = null;
  await refrescarTrasRevisarAlumnos();
  showToast('alumnos-alta-toast', 'Deshecho: los nombres vuelven a estar como antes.', 'ok');
}

// ─── Fichas repetidas ──────────────────────────────────────────────────────
const arDatoAl = a => [a.n_registro && `nº ${esc(a.n_registro)}`, a.dni && `DNI ${esc(a.dni)}`, `permiso ${esc(a.permiso)}`, `${fmtClases(a.clases)} ${a.clases > 0 && a.clases <= 1 ? 'clase' : 'clases'}`, a.movil && 'creado en el móvil']
  .filter(Boolean).join(' · ');
async function abrirAlumnosRepetidos() {
  const lista = await window.api.buscarAlumnosRepetidos();
  const filas = lista.map(p => `<tr>
      <td><b>${esc(p.a.nombre)}</b><div class="ar-nota">${arDatoAl(p.a)}</div></td>
      <td><b>${esc(p.b.nombre)}</b><div class="ar-nota">${arDatoAl(p.b)}</div></td>
      <td>${esc(p.motivo)}</td>
      <td><button class="btn btn-sm btn-primary" onclick="abrirFusionAlumnos(${p.queda}, ${p.seVa})">Revisar y juntar</button></td></tr>`).join('');
  pmModal('modal-alumnos-repetidos', `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0">Posibles fichas repetidas</h3>
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-alumnos-repetidos')">Cerrar</button>
    </div>
    <p style="font-size:13px;color:var(--text-muted);margin:4px 0 12px">La misma persona dada de alta dos veces (mismo DNI, o mismo nombre y apellidos y mismo permiso). Si de verdad es la misma, júntalas: todo pasa a una sola ficha y no se pierde nada. Otro permiso de la misma persona no sale aquí: es otro expediente.</p>
    ${lista.length ? `<div class="table-wrap ar-tabla"><table><thead><tr><th>Ficha</th><th>Otra ficha</th><th>Por qué</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>` : '<div class="alert alert-ok">No hay fichas repetidas.</div>'}
    ${await arHistorialFusiones()}`);
}
async function arHistorialFusiones() {
  const h = (await window.api.getFusionesAlumnos()) || [];
  if (!h.length) return '';
  return `<h4 style="margin:16px 0 6px">Fichas ya juntadas en este PC</h4><div class="table-wrap"><table><tbody>${h.slice(0, 10).map(f => `<tr>
      <td>${esc(fmtFecha(f.fecha.slice(0, 10)))}</td><td>«${esc(f.seVa)}» → «${esc(f.queda)}»</td><td class="col-num">${f.movidos} registros</td>
      <td>${f.deshecha ? '<span class="pill pill-line">Deshecha</span>' : `<button class="btn btn-sm btn-ghost" onclick="deshacerFusionUI('${esc(f.id)}')">Deshacer</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}

// Juntar esta ficha con otra (desde el menú de la ficha): se busca la otra
async function abrirJuntarConOtro(alumnoId) {
  pmModal('modal-juntar-otro', `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0">Juntar con otra ficha</h3>
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-juntar-otro')">Cerrar</button>
    </div>
    <p style="font-size:13px;color:var(--text-muted);margin:4px 0 12px">Si este alumno está dado de alta dos veces (p. ej. una desde el móvil y otra en el ordenador), busca la otra ficha. Antes de juntar verás qué pasa a cada sitio.</p>
    <input type="text" id="ar-buscar-otro" placeholder="Nombre, DNI o nº de registro" autocomplete="off" oninput="arBuscarOtro(${alumnoId}, this.value)">
    <div id="ar-otros" style="margin-top:10px"></div>`);
  setTimeout(() => document.getElementById('ar-buscar-otro')?.focus(), 60);
}
async function arBuscarOtro(alumnoId, texto) {
  const cont = document.getElementById('ar-otros'); if (!cont) return;
  const r = (await window.api.buscarAlumnosRapido(texto, 8)).filter(a => a.id !== alumnoId);
  cont.innerHTML = r.length ? `<div class="table-wrap"><table><tbody>${r.map(a => `<tr><td><b>${esc(a.nombre)}</b><div class="ar-nota">${[a.n_registro && 'nº ' + esc(a.n_registro), a.dni && 'DNI ' + esc(a.dni), 'permiso ' + esc(a.permiso)].filter(Boolean).join(' · ')}</div></td>
      <td style="text-align:right"><button class="btn btn-sm btn-primary" onclick="closeModal('modal-juntar-otro');abrirFusionAlumnos(${alumnoId}, ${a.id})">Elegir</button></td></tr>`).join('')}</tbody></table></div>`
    : (texto.trim().length >= 2 ? '<div class="ar-nota">Ningún otro alumno coincide.</div>' : '');
}

const AR_CAMPOS = { primer_apellido: '1.er apellido', segundo_apellido: '2.º apellido', dni: 'DNI', telefono: 'Teléfono', email: 'Email', fecha_nacimiento: 'Fecha de nacimiento',
  direccion: 'Dirección', codigo_postal: 'C. P.', poblacion: 'Población', observaciones: 'Observaciones', estado: 'Estado', vehiculo_id: 'Coche', profesor_id: 'Profesor',
  fecha_alta: 'Fecha de alta', permisos: 'Otros permisos', clases_previas: 'Clases antes de la app', km_previos: 'Km antes de la app', n_registro: 'Nº de registro' };
const arValor = (campo, v) => v == null || v === '' ? '—' : Array.isArray(v) ? (v.join(', ') || '—') : campo === 'fecha_alta' || campo === 'fecha_nacimiento' ? fmtFecha(v)
  : campo === 'clases_previas' ? fmtClases(v) : campo === 'vehiculo_id' || campo === 'profesor_id' ? '(se asigna)' : esc(String(v)).slice(0, 80);

// Vista previa: qué ficha se queda, qué pasa de la otra y qué datos se completan
async function abrirFusionAlumnos(queda, seVa) {
  const p = await window.api.previaFusionAlumnos(queda, seVa);
  if (!p.ok) { await avisar(p.error); return; }
  arFusion = { queda, seVa };
  const col = (a, titulo) => `<div class="ar-col"><div class="ar-col-tit">${titulo}</div><b>${esc(a.nombre)}</b><div class="ar-nota">${arDatoAl(a)}${a.fecha_alta ? ' · alta ' + fmtFecha(a.fecha_alta) : ''}</div></div>`;
  pmModal('modal-fusion-alumnos', `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0">Juntar dos fichas</h3>
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-fusion-alumnos')">Cerrar</button>
    </div>
    <div class="ar-cols">${col(p.queda, 'Se queda')}<button type="button" class="btn btn-sm btn-ghost" title="Cambiar cuál se queda" onclick="abrirFusionAlumnos(${seVa}, ${queda})">⇄ Cambiar</button>${col(p.seVa, 'Pasa a la de la izquierda y desaparece')}</div>
    ${p.avisos.length ? `<div class="alert alert-warn" style="margin-top:12px"><ul class="pm-prop-lista">${p.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
    <h4 style="margin:14px 0 6px">Qué pasa a la ficha que se queda</h4>
    ${p.mover.length ? `<ul class="pm-prop-lista">${p.mover.map(m => `<li><b>${m.n}</b> ${esc(m.nombre)}</li>`).join('')}</ul>` : '<div class="ar-nota">La otra ficha no tiene clases, cobros ni otros registros.</div>'}
    <h4 style="margin:14px 0 6px">Datos que se completan</h4>
    ${p.completar.length ? `<div class="table-wrap"><table><thead><tr><th>Dato</th><th>Ahora</th><th>Quedará</th></tr></thead><tbody>${p.completar.map(c => `<tr><td>${esc(AR_CAMPOS[c.campo] || c.campo)}</td><td>${arValor(c.campo, c.antes)}</td><td>${arValor(c.campo, c.despues)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="ar-nota">Ninguno: la ficha que se queda ya tiene todos esos datos (los suyos no se cambian).</div>'}
    <p style="font-size:13px;color:var(--text-muted);margin:12px 0 0">Antes de juntar se guarda una copia de seguridad, y se puede deshacer.</p>
    <div class="ar-pie">
      <button class="btn btn-gray" onclick="closeModal('modal-fusion-alumnos')">Cancelar</button>
      <button class="btn btn-primary" onclick="confirmarFusionAlumnos()">Juntar las dos fichas</button>
    </div>`);
}
async function confirmarFusionAlumnos() {
  if (!arFusion) return;
  if (!await confirmar('¿Juntar las dos fichas en una? Todo lo de la segunda pasa a la primera.', { textoAceptar: 'Sí, juntarlas' })) return;
  const r = await window.api.fusionarAlumnos(arFusion.queda, arFusion.seVa);
  if (!r.ok) { await avisar(r.error); return; }
  arUltimaFusion = r.id;
  const quedaId = arFusion.queda;
  ['modal-fusion-alumnos', 'modal-alumnos-repetidos'].forEach(id => { if (document.getElementById(id)) closeModal(id); });
  arFusion = null;
  // Si se estaba viendo la ficha que desaparece, se pasa a la que se queda
  if (typeof currentAlumnoId !== 'undefined' && currentAlumnoId && document.getElementById('view-practicas')?.style.display !== 'none') {
    const a = (await window.api.getAlumnos()).find(x => x.id === quedaId);
    if (a) verPracticas(a.id, a.vehiculo_id, a.nombre);
  }
  await refrescarTrasRevisarAlumnos();
  avisoConDeshacer(`Fichas juntadas: ${r.movidos} registros pasados${r.completados ? ` y ${r.completados} datos completados` : ''}.`, `deshacerFusionUI('${r.id}')`);
}
async function deshacerFusionUI(id) {
  const r = await window.api.deshacerFusionAlumnos(id || arUltimaFusion);
  if (!r.ok) { await avisar(r.error); return; }
  if (document.getElementById('modal-alumnos-repetidos')?.classList.contains('open')) closeModal('modal-alumnos-repetidos');
  await refrescarTrasRevisarAlumnos();
  showToast('alumnos-alta-toast', 'Deshecho: las dos fichas vuelven a estar separadas.', 'ok');
}

// ─── Comunes ───────────────────────────────────────────────────────────────
async function refrescarTrasRevisarAlumnos() {
  try { if (typeof loadAlumnos === 'function') await loadAlumnos(); } catch (e) { /* la lista se refresca al volver */ }
  if (typeof currentAlumnoId !== 'undefined' && currentAlumnoId && document.getElementById('view-practicas')?.style.display !== 'none' && typeof loadPracticas === 'function') {
    try { await loadPracticas(); } catch (e) { /* ficha ya no existe */ }
  }
}
// Mensaje en la lista de Alumnos con botón «Deshacer» (10 s)
function avisoConDeshacer(texto, accion) {
  // En la ficha del alumno, el aviso sale en su tarjeta de datos; si no, en la lista
  const enFicha = document.getElementById('view-practicas')?.style.display !== 'none' && document.getElementById('fd-alerta');
  const idEl = enFicha ? 'fd-alerta' : 'alumnos-alta-toast';
  const el = document.getElementById(idEl); if (!el) return;
  clearTimeout(toastTimers[idEl]);
  el.className = 'alert alert-ok';
  el.innerHTML = `<div style="flex:1">${esc(texto)}</div><button type="button" class="btn btn-sm btn-outline" onclick="${accion}">Deshacer</button>`;
  el.classList.remove('hidden');
  toastTimers[idEl] = setTimeout(() => hideToast(idEl), 10000);
}

// ─── Al escribir: ofrecer separar nombre y apellidos ───────────────────────
// Si en «Nombre» se escriben también los apellidos y las casillas de apellidos
// están vacías, aparece ahí mismo «Separar». Con un nombre compuesto («María José»,
// «Juan Carlos») no se ofrece nada (db: proponerSepararNombreTexto).
const SUG_CAMPOS = [
  { nombre: 'a-nombre', ap1: 'a-primer-apellido', ap2: 'a-segundo-apellido' },
  { nombre: 'fd-nombre', ap1: 'fd-primer_apellido', ap2: 'fd-segundo_apellido' }
];
const sugDescartados = {}; // campo → texto del que ya se dijo «no, es el nombre»
let sugTurno = 0;
function sugCaja(c) {
  const input = document.getElementById(c.nombre); if (!input) return null;
  let caja = document.getElementById(`sug-${c.nombre}`);
  if (!caja) {
    caja = document.createElement('div');
    caja.id = `sug-${c.nombre}`; caja.className = 'sug-nombre hidden';
    (input.closest('.form-group') || input).insertAdjacentElement('afterend', caja);
  }
  return caja;
}
const sugRevisar = retrasar(async c => {
  const input = document.getElementById(c.nombre); if (!input) return;
  const caja = sugCaja(c); if (!caja) return;
  const texto = input.value.trim();
  const ap1 = document.getElementById(c.ap1), ap2 = document.getElementById(c.ap2);
  const turno = ++sugTurno;
  let r = null;
  if (texto && ap1 && ap2 && sugDescartados[c.nombre] !== texto) {
    try { r = await window.api.proponerSepararNombreTexto(texto, ap1.value, ap2.value); } catch (e) { r = null; }
  }
  if (turno !== sugTurno) return; // llegó una respuesta más nueva
  if (!r) { caja.classList.add('hidden'); caja.innerHTML = ''; return; }
  caja.dataset.n = r.nombre; caja.dataset.a1 = r.primer_apellido; caja.dataset.a2 = r.segundo_apellido || '';
  caja.innerHTML = `<span>¿Has escrito también los apellidos? Quedaría <b>${esc(r.nombre)}</b> · <b>${esc([r.primer_apellido, r.segundo_apellido].filter(Boolean).join(' '))}</b></span>
    <button type="button" class="btn btn-sm btn-outline" onclick="sugSeparar('${c.nombre}')">Separar</button>
    <button type="button" class="btn btn-sm btn-ghost" onclick="sugDescartar('${c.nombre}')">No, es solo el nombre</button>`;
  caja.classList.remove('hidden');
}, 450);
function sugSeparar(idNombre) {
  const c = SUG_CAMPOS.find(x => x.nombre === idNombre); const caja = c && sugCaja(c); if (!caja) return;
  for (const [id, v] of [[c.nombre, caja.dataset.n], [c.ap1, caja.dataset.a1], [c.ap2, caja.dataset.a2]]) {
    const el = document.getElementById(id); if (!el) continue;
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  caja.classList.add('hidden'); caja.innerHTML = '';
}
function sugDescartar(idNombre) {
  const el = document.getElementById(idNombre); if (el) sugDescartados[idNombre] = el.value.trim();
  const caja = document.getElementById(`sug-${idNombre}`); if (caja) { caja.classList.add('hidden'); caja.innerHTML = ''; }
}
document.addEventListener('input', e => {
  const c = SUG_CAMPOS.find(x => x.nombre === e.target.id || x.ap1 === e.target.id || x.ap2 === e.target.id);
  if (c) sugRevisar(c);
});
