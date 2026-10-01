// ─── PROFESORES ───────────────────────────────────────────────────────────────
// CRUD de profesores y el helper para poblar selects de profesor en otras páginas.

// ─── PROFESORES ───────────────────────────────────────────────────────────────
async function loadProfesores() {
  cargarDirector();
  profesoresCache = await window.api.getProfesores(getSucursalActual());
  const tbody = document.querySelector('#tabla-profesores tbody');
  if (!profesoresCache.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No hay profesores registrados</td></tr>';
    return;
  }
  tbody.innerHTML = profesoresCache.map(p => `<tr>
      <td><strong>${esc(p.nombre)}</strong></td>
      <td>${esc(p.nota) || '<span style="color:var(--placeholder)">—</span>'}</td>
      <td>${p.num_practicas}</td>
      <td>${p.tiene_firma
        ? `<button type="button" class="pill pill-ok firma-pill" onclick="abrirFirmaProfesor(${p.id})" title="Ver o cambiar su firma">${fichaSvg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 12)} Guardada</button>`
        : `<button type="button" class="pill pill-warn firma-pill" onclick="abrirFirmaProfesor(${p.id})" title="Dibujar su firma para la ficha DGT">Sin firma · Firmar</button>`}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="openEditProfesor(${p.id},'${esc(p.nombre)}','${esc(p.nota || '')}','${esc(p.dni || '')}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProfesor(${p.id},'${esc(p.nombre)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> Borrar</button>
      </td>
    </tr>`).join('');
}

async function addProfesor() {
  const nombre = document.getElementById('pf-nombre').value.trim();
  const nota = document.getElementById('pf-nota').value.trim();
  const dni = document.getElementById('pf-dni')?.value.trim() || null;
  if (!nombre) { alert('Introduce un nombre para el profesor.'); return; }
  await window.api.addProfesor(nombre, nota, getSucursalActual(), dni);
  document.getElementById('pf-nombre').value = '';
  document.getElementById('pf-nota').value = '';
  document.getElementById('pf-dni').value = '';
  loadProfesores();
}

async function deleteProfesor(id, nombre) {
  if (!await confirmar(`¿Borrar el profesor "${nombre}"? Las prácticas ya registradas conservarán a este profesor en su historial.`, { peligro: true, textoAceptar: 'Borrar' })) return;
  await window.api.deleteProfesor(id);
  loadProfesores();
}

function openEditProfesor(id, nombre, nota, dni) {
  document.getElementById('edit-pf-id').value = id;
  document.getElementById('edit-pf-nombre').value = nombre;
  document.getElementById('edit-pf-nota').value = nota;
  document.getElementById('edit-pf-dni').value = dni || '';
  openModal('modal-profesor');
}

async function saveProfesor() {
  const id = parseInt(document.getElementById('edit-pf-id').value);
  const nombre = document.getElementById('edit-pf-nombre').value.trim();
  const nota = document.getElementById('edit-pf-nota').value.trim();
  const dni = document.getElementById('edit-pf-dni')?.value.trim() || null;
  if (!nombre) { alert('Introduce un nombre para el profesor.'); return; }
  await window.api.updateProfesor(id, nombre, nota, dni);
  closeModal('modal-profesor');
  loadProfesores();
}

// ─── FIRMA DEL PROFESOR / DEL DIRECTOR ─────────────────────────────────────
// Se dibuja una vez (aquí o, la del profesor, en el móvil: Perfil → Mi firma) y
// la app la pone en la ficha DGT: la del profesor en «Firma del profesor» de
// todas sus clases y en el pie; la del director en «Firma del Director» del pie.
// abrirFirmaProfesor / abrirPerfilDirector devuelven una promesa: true si se
// guardó (o se quitó) algo, false si se cerró sin cambios. Comparten el mismo
// panel (#modal-firma-profesor, creado en JS) y el mismo lienzo.
let padFirma = null; // { trazos, caja, cv, ctx, ultimo, medio, resolver, guardar, quitar, sinTrazo }

function _modalPadFirma() {
  if (padFirma && padFirma.resolver) padFirma.resolver(false);
  let modal = document.getElementById('modal-firma-profesor');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'overlay'; modal.id = 'modal-firma-profesor';
    modal.innerHTML = '<div class="modal modal-firma" role="dialog" aria-modal="true" aria-labelledby="firma-pad-tit"></div>';
    document.body.appendChild(modal);
  }
  return modal.firstElementChild;
}

// Lienzo + botones. `cfg`: { textoGuardar, quitar (muestra «Quitar la firma
// guardada»), sinTrazo (Guardar activo sin dibujar: el perfil del director
// guarda también sus datos) }
function _htmlPadFirma(cfg) {
  return `
    <div class="firma-pad" id="firma-pad">
      <canvas id="firma-pad-cv" aria-label="Recuadro para firmar"></canvas>
      <span class="firma-pad-linea" aria-hidden="true"></span>
      <span class="firma-pad-ayuda" id="firma-pad-ayuda">Firma aquí</span>
    </div>
    <div class="firma-pad-pie">
      <button type="button" class="btn btn-ghost btn-sm" onclick="borrarPadFirma()">Borrar y repetir</button>
      <button type="button" class="btn btn-ghost btn-sm firma-pad-quitar" id="firma-pad-quitar" onclick="quitarFirmaProfesor()"${cfg.quitar ? '' : ' hidden'}>Quitar la firma guardada</button>
      <span style="flex:1"></span>
      <button type="button" class="btn btn-primary" id="firma-pad-ok"${cfg.sinTrazo ? '' : ' disabled'} onclick="guardarPadFirma()">${cfg.textoGuardar || 'Guardar firma'}</button>
    </div>
    <div id="firma-pad-error" class="alert alert-err hidden" style="margin-top:10px"></div>`;
}

const _htmlFirmaActual = (img, alt, titulo = 'Firma guardada') => img
  ? `<div class="clase-firma-tit">${titulo}</div><div class="clase-firma firma-pad-actual"><img src="${img}" alt="${esc(alt)}"></div>
     <div class="clase-firma-tit" style="margin-top:14px">Para cambiarla, firma de nuevo</div>`
  : '';

function _abrirPadFirma(cfg) {
  openModal('modal-firma-profesor');
  return new Promise(resolver => {
    padFirma = { trazos: 0, caja: null, resolver, guardar: cfg.guardar, quitar: cfg.quitar || null, sinTrazo: !!cfg.sinTrazo };
    requestAnimationFrame(iniciarPadFirma);
  });
}

async function abrirFirmaProfesor(id, opciones = {}) {
  const prof = (await window.api.getProfesores()).find(x => x.id === id);
  if (!prof) return false;
  const actual = await window.api.getFirmaProfesor(id);
  _modalPadFirma().innerHTML = `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 id="firma-pad-tit" style="margin:0">Firma de ${esc(prof.nombre)}</h3>
      <button class="btn btn-outline btn-sm" onclick="cerrarFirmaProfesor(false)">${opciones.textoCerrar || 'Cerrar'}</button>
    </div>
    ${opciones.motivo ? `<div class="alert alert-warn" style="margin:12px 0 0">${esc(opciones.motivo)}</div>` : ''}
    <p class="aj-intro" style="margin:12px 0">Firma con el ratón, el lápiz o el dedo. Se guarda una sola vez y sale en la casilla «Firma del profesor» de todas sus clases en la ficha DGT y en el pie de las fichas de sus alumnos. También se puede firmar desde el móvil (Perfil → Mi firma).</p>
    ${_htmlFirmaActual(actual, 'Firma guardada de ' + prof.nombre)}
    ${_htmlPadFirma({ textoGuardar: opciones.textoGuardar, quitar: !!actual })}`;
  return _abrirPadFirma({
    guardar: firma => window.api.setFirmaProfesor(id, firma),
    quitar: {
      texto: `¿Quitar la firma guardada de ${prof.nombre}? Sus clases saldrán sin firma del profesor en la ficha DGT hasta que vuelva a firmar.`,
      hacer: () => window.api.setFirmaProfesor(id, null),
    },
  });
}

// ─── PERFIL DEL DIRECTOR ─────────────────────────────────────────────────────
// Quién es (uno de los profesores u otra persona) y su firma, en el mismo
// panel. Si es un profesor, la firma que se dibuja aquí es la de ese profesor
// (una sola firma para sus clases y para el pie).
async function abrirPerfilDirector(opciones = {}) {
  const [dir, profes, propia] = await Promise.all([
    window.api.getDirector(), window.api.getProfesores(), window.api.getFirmaDirector(true)]);
  const opcionesProf = profes.map(p =>
    `<option value="${p.id}"${dir.profesor_id === p.id ? ' selected' : ''}>${esc(p.nombre)} (profesor)</option>`).join('');
  const otra = dir.profesor_id == null;
  _modalPadFirma().innerHTML = `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 id="firma-pad-tit" style="margin:0">Director del centro</h3>
      <button class="btn btn-outline btn-sm" onclick="cerrarFirmaProfesor(false)">${opciones.textoCerrar || 'Cerrar'}</button>
    </div>
    ${opciones.motivo ? `<div class="alert alert-warn" style="margin:12px 0 0">${esc(opciones.motivo)}</div>` : ''}
    <p class="aj-intro" style="margin:12px 0">Su firma sale en «Firma del Director», en el certificado del pie de todas las fichas DGT. Firma con el ratón, el lápiz o el dedo.</p>
    <div class="director-datos">
      <div class="form-group director-quien-campo">
        <label for="dir-quien">¿Quién es el director?</label>
        <select id="dir-quien" onchange="cambiarDirectorQuien()">
          <option value=""${otra ? ' selected' : ''}>Otra persona (no da clases)</option>
          ${opcionesProf}
        </select>
      </div>
      <div class="form-group" data-dir-otra>
        <label for="dir-nombre">Nombre y apellidos</label>
        <input type="text" id="dir-nombre" maxlength="80" value="${otra ? esc(dir.nombre || '') : ''}" placeholder="Nombre del director">
      </div>
      <div class="form-group" data-dir-otra>
        <label for="dir-dni">DNI/NIE (opcional)</label>
        <input type="text" id="dir-dni" maxlength="20" value="${otra ? esc(dir.dni || '') : ''}" placeholder="12345678A">
      </div>
    </div>
    <div id="dir-firma-actual"></div>
    ${_htmlPadFirma({ textoGuardar: opciones.textoGuardar || 'Guardar', sinTrazo: true })}`;
  const promesa = _abrirPadFirma({
    sinTrazo: true,
    guardar: async firma => {
      const quien = document.getElementById('dir-quien').value;
      const res = await window.api.setDirector(quien
        ? { profesor_id: parseInt(quien) }
        : { nombre: document.getElementById('dir-nombre').value, dni: document.getElementById('dir-dni').value });
      if (!res || !res.ok || !firma) return res;
      return window.api.setFirmaDirector(firma);
    },
    quitar: {
      texto: '¿Quitar la firma guardada del director? El pie de la ficha DGT saldrá sin ella hasta que vuelva a firmar.',
      hacer: () => window.api.setFirmaDirector(null),
    },
  });
  padFirma.propia = propia;
  await cambiarDirectorQuien();
  return promesa;
}

// Al elegir quién es: nombre y DNI solo para «otra persona»; la firma que se
// enseña es la de ese profesor o la propia del director.
async function cambiarDirectorQuien() {
  const sel = document.getElementById('dir-quien'); if (!sel || !padFirma) return;
  const valor = sel.value, id = valor ? parseInt(valor) : null;
  document.querySelectorAll('[data-dir-otra]').forEach(el => { el.hidden = id != null; });
  const nombre = id != null ? sel.selectedOptions[0].textContent.replace(/ \(profesor\)$/, '') : '';
  const img = id != null ? await window.api.getFirmaProfesor(id) : padFirma.propia;
  if (!padFirma || sel.value !== valor) return; // cambió mientras se leía
  document.getElementById('dir-firma-actual').innerHTML = img
    ? _htmlFirmaActual(img, 'Firma guardada', id != null ? `Firma de ${esc(nombre)} (la misma de sus clases)` : 'Firma guardada')
    : `<div class="clase-firma-tit">${id != null ? `${esc(nombre)} aún no tiene firma: la que hagas aquí valdrá también para sus clases` : 'Firma del director'}</div>`;
  // Solo se quita aquí la firma propia del director (la de un profesor, desde su fila)
  document.getElementById('firma-pad-quitar').hidden = !(id == null && padFirma.propia);
}

// Tarjeta «Director del centro» de la página Profesores.
async function cargarDirector() {
  const caja = document.getElementById('director-resumen'); if (!caja) return;
  const dir = await window.api.getDirector();
  if (!dir.configurado) {
    caja.innerHTML = `<span class="director-vacio">Todavía no has indicado quién es el director.</span>
      <button class="btn btn-primary btn-sm" onclick="abrirPerfilDirector()">Crear perfil y firmar</button>`;
    return;
  }
  caja.innerHTML = `<div class="director-quien"><strong>${esc(dir.nombre)}</strong>${dir.dni ? ` <span class="director-dni">${esc(dir.dni)}</span>` : ''}${dir.profesor_id != null ? ' <span class="pill">También es profesor</span>' : ''}</div>
    ${dir.tiene_firma
      ? `<button type="button" class="pill pill-ok firma-pill" onclick="abrirPerfilDirector()" title="Ver o cambiar su firma">${fichaSvg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 12)} Firma guardada</button>`
      : `<button type="button" class="pill pill-warn firma-pill" onclick="abrirPerfilDirector()" title="Dibujar su firma para la ficha DGT">Sin firma · Firmar</button>`}
    <span style="flex:1"></span>
    <button class="btn btn-outline btn-sm" onclick="abrirPerfilDirector()">Editar perfil</button>`;
}

function iniciarPadFirma() {
  const cv = document.getElementById('firma-pad-cv'); if (!cv || !padFirma) return;
  const caja = document.getElementById('firma-pad');
  const dpr = window.devicePixelRatio || 1;
  cv.width = caja.clientWidth * dpr; cv.height = caja.clientHeight * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = ctx.fillStyle = '#14161B';
  Object.assign(padFirma, { cv, ctx, trazos: 0, caja: null });
  let dibujando = false;
  const punto = e => {
    const r = cv.getBoundingClientRect(); const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    const c = padFirma.caja || (padFirma.caja = { x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    c.x0 = Math.min(c.x0, p.x); c.y0 = Math.min(c.y0, p.y); c.x1 = Math.max(c.x1, p.x); c.y1 = Math.max(c.y1, p.y);
    return p;
  };
  cv.onpointerdown = e => {
    e.preventDefault(); cv.setPointerCapture(e.pointerId); dibujando = true;
    padFirma.ultimo = padFirma.medio = punto(e);
    ctx.beginPath(); ctx.arc(padFirma.ultimo.x, padFirma.ultimo.y, 1.1, 0, 6.3); ctx.fill();
    document.getElementById('firma-pad-ayuda').hidden = true;
  };
  cv.onpointermove = e => {
    if (!dibujando) return; e.preventDefault();
    const p = punto(e), u = padFirma.ultimo, m = { x: (u.x + p.x) / 2, y: (u.y + p.y) / 2 };
    // Curva suave: de la mitad anterior a la nueva, con el último punto de control
    ctx.beginPath(); ctx.moveTo(padFirma.medio.x, padFirma.medio.y); ctx.quadraticCurveTo(u.x, u.y, m.x, m.y); ctx.stroke();
    padFirma.medio = m; padFirma.ultimo = p;
    if (++padFirma.trazos > 8) document.getElementById('firma-pad-ok').disabled = false;
  };
  cv.onpointerup = cv.onpointercancel = () => { dibujando = false; };
}

function borrarPadFirma() {
  if (!padFirma || !padFirma.ctx) return;
  padFirma.ctx.clearRect(0, 0, padFirma.cv.width, padFirma.cv.height);
  padFirma.trazos = 0; padFirma.caja = null;
  document.getElementById('firma-pad-ok').disabled = !padFirma.sinTrazo;
  document.getElementById('firma-pad-ayuda').hidden = false;
}

// PNG recortado al contorno de lo dibujado y reducido (suele quedar en 5-25 KB).
function padFirmaComoPNG(anchoMax = 480) {
  const cv = padFirma.cv, dpr = cv.width / (cv.clientWidth || cv.width) || 1;
  const c = padFirma.caja, m = 10;
  const x0 = Math.max(0, c.x0 - m), y0 = Math.max(0, c.y0 - m);
  const w = Math.max(1, Math.min(cv.clientWidth, c.x1 + m) - x0), h = Math.max(1, Math.min(cv.clientHeight, c.y1 + m) - y0);
  const escala = Math.min(1, anchoMax / w);
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.round(w * escala)); tmp.height = Math.max(1, Math.round(h * escala));
  tmp.getContext('2d').drawImage(cv, x0 * dpr, y0 * dpr, w * dpr, h * dpr, 0, 0, tmp.width, tmp.height);
  return tmp.toDataURL('image/png');
}

async function guardarPadFirma() {
  if (!padFirma || (!padFirma.caja && !padFirma.sinTrazo)) return;
  // Un toque suelto de pocos puntos no cuenta como firma
  let firma = null;
  if (padFirma.caja && padFirma.trazos > 8) {
    firma = padFirmaComoPNG();
    if (firma.length > 150000) firma = padFirmaComoPNG(300); // firma muy densa: se reduce más
  }
  if (!firma && !padFirma.sinTrazo) return; // (null quitaría la firma guardada)
  const res = await padFirma.guardar(firma);
  if (!res || !res.ok) {
    const err = document.getElementById('firma-pad-error');
    err.textContent = (res && res.error) || 'No se pudo guardar la firma.'; err.classList.remove('hidden');
    return;
  }
  cerrarFirmaProfesor(true);
}

async function quitarFirmaProfesor() {
  if (!padFirma || !padFirma.quitar) return;
  const quitar = padFirma.quitar;
  if (!await confirmar(quitar.texto, { peligro: true, textoAceptar: 'Quitar' })) return;
  await quitar.hacer();
  cerrarFirmaProfesor(true);
}

function cerrarFirmaProfesor(cambiada) {
  closeModal('modal-firma-profesor');
  const r = padFirma && padFirma.resolver;
  padFirma = null;
  if (cambiada && document.getElementById('page-profesores')?.classList.contains('active')) loadProfesores();
  if (r) r(!!cambiada);
}

// Rellena un <select> de profesores con un placeholder "Sin profesor" y,
// opcionalmente, deja preseleccionado un id (usado al editar una práctica).
async function llenarSelectProfesores(selectId, selectedId) {
  profesoresCache = await window.api.getProfesores();
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin profesor —</option>' +
    profesoresCache.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  sel.value = (selectedId !== undefined && selectedId !== null) ? String(selectedId) : '';
}

// ─── ESTADÍSTICAS DE PROFESORES ─────────────────────────────────────────────
// Tabla de estadísticas por profesor, con filtro de fechas (desde/hasta) y
// orden clicable en cabeceras, sobre statsProfesoresCache (mismo patrón que
// deudasCache/renderDeudasTabla en pagos.js).
async function loadStatsProfesores() {
  const desde = document.getElementById('stats-prof-desde').value || undefined;
  const hasta = document.getElementById('stats-prof-hasta').value || undefined;
  statsProfesoresCache = await window.api.getStatsProfesores(desde, hasta);
  renderStatsProfesoresTabla();
}

function ordenarStatsProfesores(col) {
  if (statsProfesoresSort.col === col) {
    statsProfesoresSort.dir *= -1;
  } else {
    statsProfesoresSort.col = col;
    statsProfesoresSort.dir = 1;
  }
  renderStatsProfesoresTabla();
}

function actualizarIndicadoresOrdenStatsProfesores() {
  document.querySelectorAll('#tabla-stats-profesores thead th[data-sort]').forEach(th => {
    const ind = th.querySelector('.sort-ind');
    if (!ind) return;
    if (th.dataset.sort === statsProfesoresSort.col) {
      ind.innerHTML = statsProfesoresSort.dir === 1 ? SVG_SORT_ASC : SVG_SORT_DESC;
      th.classList.add('sort-active');
    } else {
      ind.innerHTML = '';
      th.classList.remove('sort-active');
    }
  });
}

function renderStatsProfesoresTabla() {
  const tbody = document.querySelector('#tabla-stats-profesores tbody');
  if (!statsProfesoresCache.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay profesores registrados</td></tr>';
    actualizarIndicadoresOrdenStatsProfesores();
    return;
  }

  const { col, dir } = statsProfesoresSort;
  const filas = [...statsProfesoresCache].sort((a, b) => {
    if (col === 'nombre') return a.nombre.localeCompare(b.nombre, 'es', { numeric: true }) * dir;
    if (col === 'ultima_practica') {
      const va = a.ultima_practica || '';
      const vb = b.ultima_practica || '';
      return va.localeCompare(vb) * dir;
    }
    return ((a[col] || 0) - (b[col] || 0)) * dir;
  });
  actualizarIndicadoresOrdenStatsProfesores();

  tbody.innerHTML = filas.map(s => `<tr>
      <td><strong>${esc(s.nombre)}</strong></td>
      <td>${s.num_practicas}</td>
      <td><span class="km-badge">${fmt(s.km_totales)} km</span></td>
      <td>${s.num_alumnos}</td>
      <td>${s.practicas_pista}</td>
      <td>${s.practicas_circulacion}</td>
      <td>${s.ultima_practica ? fmtFecha(s.ultima_practica) : '<span style="color:var(--placeholder)">—</span>'}</td>
    </tr>`).join('');
}

