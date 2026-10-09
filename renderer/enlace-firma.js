// ─── ENLACE PARA QUE EL ALUMNO FIRME (2026-10-09) ───────────────────────────
// Clases que se quedaron sin firmar (el profesor se olvidó de pasarle el móvil
// al alumno al terminar): desde la ficha del alumno se crea un enlace
// (https://aulamovil.vercel.app/f/<código>), se le manda por WhatsApp o se
// copia, y el alumno ve los datos de esas clases y firma con el dedo en su
// móvil, sin cuenta. La firma se guarda en la nube y llega a este PC con el
// sync (aviso «N clases firmadas por el alumno»). Aquí se ve también qué pasó
// con cada enlace: abierto, firmado, clases que no reconoció y su comentario.
// sync.js → crearEnlaceFirma / listarEnlacesFirma / anularEnlaceFirma;
// db/alumnos.js → getClasesSinFirma. Web: web-remote/firmar.html.

let efEstado = null;      // { alumno, clases, marcadas:Set, creado:{url,...}|null, enlaces:[] }
let efVigilancia = null;  // mientras la ventana está abierta, se mira cada 15 s si el alumno ha firmado

const EF_DIAS = [3, 7, 14, 30];

async function abrirEnlaceFirma(alumnoId, soloIds) {
  let datos;
  try { datos = await window.api.getClasesSinFirma(alumnoId); } catch (e) { datos = null; }
  if (!datos) { await avisar('No se encontró al alumno.'); return; }
  const firmables = datos.clases.filter(c => c.firmable);
  const marcadas = new Set(Array.isArray(soloIds) && soloIds.length
    ? firmables.filter(c => soloIds.includes(c.id)).map(c => c.id)
    : firmables.filter(c => c.sugerida).map(c => c.id));
  efEstado = { alumno: datos.alumno, clases: datos.clases, marcadas, creado: null, enlaces: null, msgEnlaces: '', dias: 7 };
  pmModal('modal-enlace-firma', '<div id="ef-cuerpo"></div>');
  const modal = document.getElementById('modal-enlace-firma');
  if (!modal.dataset.ef) {
    modal.dataset.ef = '1';
    modal.addEventListener('click', e => { if (e.target === modal) cerrarEnlaceFirma(); });
  }
  efPintar();
  efCargarEnlaces();
  clearInterval(efVigilancia);
  efVigilancia = setInterval(() => {
    const m = document.getElementById('modal-enlace-firma');
    if (!m || !m.classList.contains('open')) { clearInterval(efVigilancia); efVigilancia = null; return; }
    efCargarEnlaces(true);
  }, 15000);
}

function cerrarEnlaceFirma() {
  clearInterval(efVigilancia); efVigilancia = null;
  closeModal('modal-enlace-firma');
  // Lo firmado mientras tanto ya está en la nube: se trae ya (sin esperar al próximo sondeo)
  if (efEstado && efEstado.enlaces && efEstado.enlaces.some(e => (e.firmadas || []).length)) window.api.sondearNube().catch(() => {});
}

function efNombre() {
  const a = efEstado.alumno;
  return nombrePropio([a.nombre, a.primer_apellido].filter(Boolean).join(' '));
}

function efFilaClase(c) {
  const marcada = efEstado.marcadas.has(c.id);
  const km = c.km_final > 0 ? `${fmtMiles(c.km)} km` : (c.tipo === 'pista' ? 'Pista' : 'Sin km');
  const etiqueta = c.anterior ? '<span class="pill pill-line ef-tag">Anterior a la app</span>'
    : (c.procedencia ? `<span class="pill pill-line ef-tag">Traída de ${esc(c.procedencia)}</span>` : '');
  return `<label class="ef-clase${c.firmable ? '' : ' ef-no'}" ${c.firmable ? '' : 'title="Sin km no se puede firmar: rellena antes sus km (Kilómetros → Cuadrar) y vuelve a crear el enlace"'}>
    <input type="checkbox" ${marcada ? 'checked' : ''} ${c.firmable ? '' : 'disabled'} onchange="efMarcar(${c.id}, this.checked)">
    <span class="ef-n num-mono">${c.n}</span>
    <span class="ef-fecha">${esc(fechaCorta(c.fecha).replace(/^./, x => x.toUpperCase()))} ${esc((c.fecha || '').slice(0, 4))}${c.hora_inicio ? ` <span class="num-mono">${esc(c.hora_inicio)}</span>` : ''}</span>
    <span class="ef-det">${c.matricula ? placaHTML(c.matricula) : esc(c.vehiculo_nombre || '')} <span class="num-mono">${km}</span>${c.fraccion ? ` · ${fmtClases(c.fraccion)} clase` : ''}${c.profesor_nombre ? ` · ${esc(nombrePropio(c.profesor_nombre))}` : ''}</span>
    ${etiqueta}${c.firmable ? '' : '<span class="ef-sin">No se puede: sin km</span>'}
  </label>`;
}

function efPintar() {
  const E = efEstado; if (!E) return;
  const cuerpo = document.getElementById('ef-cuerpo'); if (!cuerpo) return;
  const cab = `<div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0">Enlace para que firme</h3>
      <button class="btn btn-outline btn-sm" onclick="cerrarEnlaceFirma()">Cerrar</button>
    </div>`;
  if (E.creado) { cuerpo.innerHTML = cab + efHtmlCreado() + efHtmlEnlaces(); return; }
  const firmables = E.clases.filter(c => c.firmable);
  const n = E.marcadas.size;
  const lista = E.clases.length
    ? `<div class="ef-acciones"><span>${E.clases.length} ${E.clases.length === 1 ? 'clase sin firmar' : 'clases sin firmar'}</span>
        ${firmables.length > 1 ? `<button type="button" class="btn btn-outline btn-sm" onclick="efTodas(true)">Marcar todas</button><button type="button" class="btn btn-outline btn-sm" onclick="efTodas(false)">Ninguna</button>` : ''}</div>
       <div class="ef-lista">${E.clases.map(efFilaClase).join('')}</div>`
    : '<div class="vacio-panel">Este alumno no tiene clases sin firmar.<small>Las clases firmadas en el móvil o con un enlace ya cuentan como firmadas.</small></div>';
  cuerpo.innerHTML = cab + `
    <p class="cp-quien"><b>${esc(efNombre())}</b> recibe un enlace, ve los datos de las clases que marques y firma con el dedo en su móvil, sin cuenta. Su firma llega aquí sola y sale en la ficha DGT.</p>
    ${lista}
    ${firmables.length ? `<div class="ef-pie-form">
      <label for="ef-dias">El enlace vale</label>
      <select id="ef-dias" onchange="efEstado.dias = parseInt(this.value)">${EF_DIAS.map(d => `<option value="${d}" ${d === E.dias ? 'selected' : ''}>${d} días</option>`).join('')}</select>
    </div>` : ''}
    <div id="ef-msg" class="hidden" style="margin-top:10px"></div>
    <div class="ar-pie">
      <button class="btn btn-gray" onclick="cerrarEnlaceFirma()">Cancelar</button>
      ${firmables.length ? `<button class="btn btn-primary" id="ef-crear" onclick="efCrear()" ${n ? '' : 'disabled'}>Crear enlace${n ? ` (${n} ${n === 1 ? 'clase' : 'clases'})` : ''}</button>` : ''}
    </div>` + efHtmlEnlaces();
}

function efMarcar(id, si) {
  if (!efEstado) return;
  if (si) efEstado.marcadas.add(id); else efEstado.marcadas.delete(id);
  const n = efEstado.marcadas.size, b = document.getElementById('ef-crear');
  if (b) { b.disabled = !n; b.textContent = `Crear enlace${n ? ` (${n} ${n === 1 ? 'clase' : 'clases'})` : ''}`; }
}
function efTodas(si) {
  if (!efEstado) return;
  efEstado.marcadas = new Set(si ? efEstado.clases.filter(c => c.firmable).map(c => c.id) : []);
  efPintar();
}

async function efCrear() {
  const E = efEstado; if (!E || !E.marcadas.size) return;
  const btn = document.getElementById('ef-crear'), msg = document.getElementById('ef-msg');
  if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }
  let r;
  try { r = await window.api.crearEnlaceFirma({ alumno_id: E.alumno.id, practica_ids: [...E.marcadas], dias: E.dias }); }
  catch (e) { r = { ok: false, msg: e.message }; }
  if (!r || !r.ok) {
    if (msg) { msg.className = 'alert alert-warn'; msg.textContent = (r && r.msg) || 'No se pudo crear el enlace.'; }
    efMarcar(-1, false);
    return;
  }
  E.creado = r;
  efPintar();
  efCargarEnlaces();
}

function efTextoMensaje() {
  const E = efEstado, r = E.creado;
  const nombre = nombrePropio(String(E.alumno.nombre || '').trim().split(/\s+/)[0] || '');
  return `Hola${nombre ? ' ' + nombre : ''}, te paso el enlace para firmar ${r.n === 1 ? 'una clase práctica que se quedó' : `${r.n} clases prácticas que se quedaron`} sin firmar. Revisa los datos y firma con el dedo: ${r.url}`;
}
function efHtmlCreado() {
  const E = efEstado, r = E.creado;
  const faltan = (r.faltan || []).length;
  return `<div class="alert alert-ok" style="margin-top:4px">Enlace creado con ${r.n} ${r.n === 1 ? 'clase' : 'clases'}. Vale hasta el ${esc(efFecha(r.caduca))}.</div>
    ${faltan ? `<div class="alert alert-warn">${faltan} ${faltan === 1 ? 'clase no ha entrado' : 'clases no han entrado'}: ya estaban firmadas, no tienen km o todavía no han llegado a la nube.</div>` : ''}
    <div class="ef-url"><input type="text" id="ef-url" readonly value="${esc(r.url)}" onclick="this.select()" aria-label="Enlace para firmar"><button class="btn btn-outline" onclick="efCopiar()">Copiar</button></div>
    <div class="ef-botones">
      <button class="btn btn-primary" onclick="efWhatsApp()">${fichaSvg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>', 15)} Mandar por WhatsApp${E.alumno.telefono ? ` a ${esc(E.alumno.telefono)}` : ''}</button>
      <button class="btn btn-outline" onclick="efCopiarMensaje()">Copiar el mensaje</button>
    </div>
    <p class="aj-intro" style="margin-top:10px">Quien tenga el enlace puede firmar esas clases: mándaselo solo a ${esc(efNombre())}. Cuando firme, sus clases salen como «Firmada» en unos segundos.</p>`;
}

function efFecha(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

async function efCopiar() {
  const r = efEstado && efEstado.creado; if (!r) return;
  try { await navigator.clipboard.writeText(r.url); toastApp('Enlace copiado'); }
  catch (e) { const i = document.getElementById('ef-url'); if (i) { i.select(); } toastApp('Pulsa Ctrl+C para copiarlo'); }
}
async function efCopiarMensaje() {
  if (!efEstado || !efEstado.creado) return;
  try { await navigator.clipboard.writeText(efTextoMensaje()); toastApp('Mensaje copiado: pégalo en WhatsApp, SMS o correo'); }
  catch (e) { toastApp('No se pudo copiar', 'error'); }
}
// WhatsApp (web o la aplicación del PC). Con el teléfono del alumno va directo a su chat;
// los móviles españoles de 9 cifras llevan delante el 34.
function efWhatsApp() {
  if (!efEstado || !efEstado.creado) return;
  let tel = String(efEstado.alumno.telefono || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (/^[67]\d{8}$/.test(tel)) tel = '34' + tel;
  if (!/^\d{11,15}$/.test(tel)) tel = '';
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(efTextoMensaje())}`, '_blank');
}

// ─── Enlaces ya enviados a este alumno (estado de cada uno) ─────────────────
async function efCargarEnlaces(silencioso) {
  const E = efEstado; if (!E) return;
  let r;
  try { r = await window.api.listarEnlacesFirma(E.alumno.id); } catch (e) { r = { ok: false, msg: 'Sin conexión con la nube' }; }
  if (efEstado !== E) return;
  const antes = JSON.stringify((E.enlaces || []).map(e => [e.id, (e.firmadas || []).length, e.abierto, e.comentario]));
  E.enlaces = r && r.ok ? r.enlaces : (E.enlaces || []);
  E.msgEnlaces = r && !r.ok ? (r.sinCuenta ? 'Para crear y ver enlaces hace falta entrar con la cuenta de la autoescuela (Ajustes → Cuenta de empresa).' : r.msg || '') : '';
  const ahora = JSON.stringify(E.enlaces.map(e => [e.id, (e.firmadas || []).length, e.abierto, e.comentario]));
  if (silencioso && antes === ahora) return;
  // Alguien acaba de firmar: traer ya su firma a este PC
  if (silencioso && antes !== ahora) window.api.sondearNube().catch(() => {});
  const cont = document.getElementById('ef-enlaces');
  if (cont) cont.outerHTML = efHtmlEnlaces();
}

function efEstadoEnlace(e) {
  const total = (e.practica_ids || []).length, firmadas = (e.firmadas || []).length;
  if (e.anulado) return { txt: 'Anulado', cls: 'pill-line', activo: false };
  if (firmadas >= total && total) return { txt: `Firmado${total > 1 ? ` (${total} clases)` : ''}`, cls: 'pill-ok', activo: false };
  const caducado = new Date(e.caduca) < new Date();
  if (caducado) return { txt: firmadas ? `Caducado · firmó ${firmadas} de ${total}` : 'Caducado sin firmar', cls: 'pill-line', activo: false };
  if (firmadas) return { txt: `Firmó ${firmadas} de ${total}`, cls: 'pill-warn', activo: true };
  if (e.abierto) return { txt: 'Abierto, sin firmar', cls: 'pill-warn', activo: true };
  return { txt: 'Sin abrir todavía', cls: 'pill-line', activo: true };
}

function efHtmlEnlaces() {
  const E = efEstado;
  if (!E) return '';
  if (E.enlaces === null) return '<div id="ef-enlaces" class="ef-enlaces"><div class="ef-enl-tit">Enlaces enviados</div><div class="ef-cargando">Consultando la nube…</div></div>';
  if (!E.enlaces.length) return `<div id="ef-enlaces" class="ef-enlaces">${E.msgEnlaces ? `<div class="alert alert-info" style="margin:0">${esc(E.msgEnlaces)}</div>` : ''}</div>`;
  const porId = new Map(E.clases.map(c => [c.id, c]));
  const filas = E.enlaces.map(e => {
    const st = efEstadoEnlace(e);
    const no = (e.no_confirmadas || []).filter(id => !(e.firmadas || []).includes(id));
    const conocidas = no.map(id => porId.get(id)).filter(Boolean).map(c => 'nº ' + c.n + ' (' + esc(fechaCorta(c.fecha)) + ')');
    const noTxt = no.length ? `<div class="ef-enl-aviso">No reconoce ${conocidas.length === no.length ? (no.length === 1 ? 'la clase ' : 'las clases ') + conocidas.join(', ') : (no.length === 1 ? '1 clase' : no.length + ' clases')}</div>` : '';
    return `<div class="ef-enl">
      <div class="ef-enl-l"><b>${esc(efFecha(e.creado))}</b> · ${(e.practica_ids || []).length} ${(e.practica_ids || []).length === 1 ? 'clase' : 'clases'}${e.creado_por ? ` · lo mandó ${esc(e.creado_por === 'la oficina' ? 'la oficina' : nombrePropio(e.creado_por))}` : ''}${st.activo ? ` · vale hasta el ${esc(efFecha(e.caduca))}` : ''}
        ${e.comentario ? `<div class="ef-enl-com">«${esc(e.comentario)}»</div>` : ''}${noTxt}</div>
      <span class="pill ${st.cls}">${esc(st.txt)}</span>
      ${st.activo ? `<button class="btn btn-ghost btn-sm" onclick="efAnular(${e.id})" title="El enlace deja de funcionar">Anular</button>` : ''}
    </div>`;
  }).join('');
  return `<div id="ef-enlaces" class="ef-enlaces"><div class="ef-enl-tit">Enlaces enviados</div>${filas}</div>`;
}

async function efAnular(id) {
  if (!await confirmar('¿Anular este enlace? El alumno ya no podrá firmar con él (lo ya firmado se queda).', { textoAceptar: 'Anular' })) return;
  const r = await window.api.anularEnlaceFirma(id);
  if (!r || !r.ok) { await avisar((r && r.msg) || 'No se pudo anular.'); return; }
  toastApp('Enlace anulado');
  efCargarEnlaces();
}
