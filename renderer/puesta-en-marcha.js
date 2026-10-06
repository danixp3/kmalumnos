// ─── PUESTA EN MARCHA ────────────────────────────────────────────────────────
// Pantalla de arranque con datos reales: vehículos con el km de hoy, profesores
// y alumnos con su punto de partida (clases/km hechos antes de usar la app).
// Todo se edita en tablas y se guarda de una vez (db.guardarPuestaEnMarcha).
// Opcional: borrar los datos de prueba (con copia de seguridad previa).

let pmDatos = null;   // { vehiculos, profesores, alumnos, resumen }
let pmSucio = false;

async function loadPuestaEnMarcha() {
  pmDatos = await window.api.getPuestaEnMarcha();
  pmSucio = false;
  pmPintar();
}

function pmMarcarSucio() {
  pmSucio = true;
  const b = document.getElementById('pm-barra'); if (b) b.hidden = false;
}

function pmPintar() {
  const d = pmDatos; if (!d) return;
  const r = d.resumen;
  document.getElementById('pm-resumen').innerHTML = [
    [r.vehiculos, r.vehiculos === 1 ? 'vehículo' : 'vehículos', !r.vehiculos],
    [r.profesores, r.profesores === 1 ? 'profesor' : 'profesores', !r.profesores],
    [r.alumnos, r.alumnos === 1 ? 'alumno' : 'alumnos', !r.alumnos],
    [r.practicas, r.practicas === 1 ? 'práctica registrada' : 'prácticas registradas', false],
    ...(r.alumnos_sin_profesor ? [[r.alumnos_sin_profesor, 'sin profesor asignado', true]] : []),
    ...(r.alumnos_sin_vehiculo ? [[r.alumnos_sin_vehiculo, 'sin vehículo asignado', true]] : [])
  ].map(([n, t, aviso]) => `<span class="pill ${aviso ? 'pill-warn' : 'pill-line'}"><b>${n}</b>&nbsp;${t}</span>`).join('');

  const tbV = document.querySelector('#pm-vehiculos tbody');
  tbV.innerHTML = d.vehiculos.map((v, i) => pmFilaVehiculo(v, i)).join('') || '';
  if (!d.vehiculos.length) pmAnadirFila('vehiculos', 1, false);

  const tbP = document.querySelector('#pm-profesores tbody');
  tbP.innerHTML = d.profesores.map((p, i) => pmFilaProfesor(p, i)).join('');
  if (!d.profesores.length) pmAnadirFila('profesores', 1, false);

  const tbA = document.querySelector('#pm-alumnos tbody');
  tbA.innerHTML = d.alumnos.map((a, i) => pmFilaAlumno(a, i)).join('');
  pmAnadirFila('alumnos', d.alumnos.length ? 3 : 8, false);
  const term = document.getElementById('pm-terminados');
  if (term) {
    term.hidden = !r.alumnos_terminados;
    term.textContent = r.alumnos_terminados ? `No se muestran ${r.alumnos_terminados} ${r.alumnos_terminados === 1 ? 'alumno terminado' : 'alumnos terminados'} (aprobados, bajas o inactivos): están en Alumnos.` : '';
  }
  document.getElementById('pm-barra').hidden = true;
  pmEstadoAnteriores();
}

const pmNum = v => (v ? String(v) : '');
function pmFilaVehiculo(v, i) {
  const aviso = v.id && v.km_max_practicas > v.km_actual
    ? `<small class="pm-aviso" title="Hay prácticas registradas con km mayores que el odómetro">Sus prácticas llegan a ${fmtMiles(v.km_max_practicas)}</small>` : '';
  return `<tr data-id="${v.id || ''}" data-fila="${i}">
    <td><input type="text" data-c="nombre" value="${esc(v.nombre || '')}" placeholder="Ej.: Kia rojo" oninput="pmMarcarSucio()"></td>
    <td><input type="text" data-c="matricula" value="${esc(v.matricula || '')}" placeholder="1234ABC" style="width:110px;text-transform:uppercase" oninput="pmMarcarSucio()"></td>
    <td class="col-num"><input type="number" data-c="km_actual" min="0" value="${v.km_actual != null ? v.km_actual : ''}" placeholder="190692" class="num-mono" style="width:130px;text-align:right" oninput="pmMarcarSucio()">${aviso}</td>
    <td class="col-num num-mono">${v.id ? v.practicas : '—'}</td>
    <td>${v.id ? '' : '<button class="btn btn-sm btn-ghost" title="Quitar fila" onclick="this.closest(\'tr\').remove()">×</button>'}</td></tr>`;
}
function pmFilaProfesor(p, i) {
  return `<tr data-id="${p.id || ''}" data-fila="${i}">
    <td><input type="text" data-c="nombre" value="${esc(p.nombre || '')}" placeholder="Nombre y apellidos" style="width:320px" oninput="pmMarcarSucio()"></td>
    <td><select data-c="vehiculo_id" onchange="pmMarcarSucio()" title="El coche que la web del móvil le propone al empezar o anotar sus clases">${pmOpciones(pmDatos.vehiculos, p.vehiculo_id, '— Sin coche fijo —')}</select></td>
    <td>${p.id ? '' : '<button class="btn btn-sm btn-ghost" title="Quitar fila" onclick="this.closest(\'tr\').remove()">×</button>'}</td></tr>`;
}
function pmOpciones(lista, sel, vacio) {
  return `<option value="">${vacio}</option>` + lista.map(x => `<option value="${x.id}" ${String(x.id) === String(sel) ? 'selected' : ''}>${esc(x.nombre)}${x.matricula ? ' · ' + esc(x.matricula) : ''}</option>`).join('');
}
function pmFilaAlumno(a, i) {
  const permisos = ['B', 'A', 'A1', 'A2', 'AM', 'C', 'C1', 'D', 'BE', 'CE'];
  const nReg = a.id ? (a.n_registro || '') : '';
  return `<tr data-id="${a.id || ''}" data-fila="${i}">
    <td><input type="text" data-c="n_registro" value="${esc(nReg)}" placeholder="${a.id ? '' : (pmDatos.siguiente_n_registro ? 'auto' : '')}" title="${a.id ? 'Nº de registro' : 'Vacío: se pone solo el siguiente nº'}" class="num-mono pm-nreg" oninput="pmMarcarSucio()"></td>
    <td><input type="text" data-c="nombre" value="${esc(a.nombre || '')}" placeholder="Nombre" oninput="pmMarcarSucio()" onpaste="pmPegar(event)"></td>
    <td><input type="text" data-c="primer_apellido" value="${esc(a.primer_apellido || '')}" oninput="pmMarcarSucio()"></td>
    <td><input type="text" data-c="segundo_apellido" value="${esc(a.segundo_apellido || '')}" oninput="pmMarcarSucio()"></td>
    <td><select data-c="permiso" onchange="pmMarcarSucio()">${permisos.map(p => `<option ${p === (a.permiso || 'B') ? 'selected' : ''}>${p}</option>`).join('')}</select></td>
    <td><select data-c="profesor_id" onchange="pmMarcarSucio();pmProfesorElegido(this)">${pmOpciones(pmDatos.profesores, a.profesor_id, '— Sin asignar —')}</select></td>
    <td><select data-c="vehiculo_id" onchange="pmMarcarSucio()">${pmOpciones(pmDatos.vehiculos, a.vehiculo_id, '— Sin asignar —')}</select></td>
    <td class="col-num"><input type="text" inputmode="decimal" data-c="clases_previas" value="${clasesEnCasilla((a.clases_previas || 0) + (a.anteriores || 0))}" placeholder="0" class="num-mono" style="width:80px;text-align:right" title="De ¼ en ¼: 12 · 12,25 · 12,5 · 12,75 (o 12 ½)" oninput="pmMarcarSucio();pmValidarClases(this)"></td>
    <td class="col-num"><input type="number" data-c="km_previos" min="0" value="${pmNum(a.km_previos)}" placeholder="vacío" title="Déjalo vacío para que la app cree las clases con sus km (paso 4)" class="num-mono" style="width:90px;text-align:right" oninput="pmMarcarSucio()"></td>
    <td>${a.id ? `<button type="button" class="btn btn-sm btn-outline pm-anotar${a.anteriores ? ' hecho' : ''}" onclick="pmAnotar(${a.id})" title="Anotar las fechas (y km) de sus clases anteriores">${a.anteriores ? `${fmtClases(a.anteriores)} ${a.anteriores > 0 && a.anteriores <= 1 ? 'creada' : 'creadas'} · ver` : 'Anotar'}</button>` : '<span style="color:var(--text-faint);font-size:12px">al guardar</span>'}</td>
    <td class="col-num pm-enapp" title="Clases que ya tiene en la app y sus km">${a.id ? `<b class="num-mono">${fmtClases(a.practicas || 0)}</b> ${(a.practicas || 0) > 0 && (a.practicas || 0) <= 1 ? 'clase' : 'clases'}<small class="num-mono">${fmtMiles(a.km_practicas || 0)} km</small>` : '<span class="pm-tenue">—</span>'}</td>
    <td>${a.id ? '' : '<button class="btn btn-sm btn-ghost" title="Quitar fila" onclick="this.closest(\'tr\').remove()">×</button>'}</td></tr>`;
}

// Al elegir el profesor de un alumno sin coche, se pone el coche habitual del
// profesor (el que esté elegido ahora en la tabla de profesores).
function pmProfesorElegido(sel) {
  const tr = sel.closest('tr'); const coche = tr && tr.querySelector('[data-c="vehiculo_id"]');
  if (!coche || coche.value || !sel.value) return;
  const filaProf = document.querySelector(`#pm-profesores tbody tr[data-id="${sel.value}"] [data-c="vehiculo_id"]`);
  const vid = filaProf ? filaProf.value : ((pmDatos.profesores.find(p => String(p.id) === sel.value) || {}).vehiculo_id || '');
  if (vid && [...coche.options].some(o => o.value === String(vid))) coche.value = String(vid);
}

function pmAnadirFila(tipo, n = 1, sucio = true) {
  const tb = document.querySelector(`#pm-${tipo} tbody`); if (!tb) return;
  for (let k = 0; k < n; k++) {
    const i = tb.children.length;
    const html = tipo === 'vehiculos' ? pmFilaVehiculo({}, i) : tipo === 'profesores' ? pmFilaProfesor({}, i) : pmFilaAlumno({}, i);
    tb.insertAdjacentHTML('beforeend', html);
  }
  if (sucio) { pmMarcarSucio(); tb.lastElementChild?.querySelector('input')?.focus(); }
}

// Pegar varias filas de Excel (tabuladores/saltos de línea) en «Nombre».
function pmPegar(e) {
  const txt = (e.clipboardData || window.clipboardData).getData('text');
  if (!/[\t\n]/.test(txt)) return; // un solo valor: pegado normal
  e.preventDefault();
  const filas = txt.replace(/\r/g, '').split('\n').map(l => l.split('\t')).filter(c => c.some(x => x.trim()));
  let tr = e.target.closest('tr');
  const cols = ['nombre', 'primer_apellido', 'segundo_apellido', 'clases_previas', 'km_previos'];
  for (const celdas of filas) {
    if (!tr) { pmAnadirFila('alumnos', 1, false); tr = document.querySelector('#pm-alumnos tbody').lastElementChild; }
    celdas.slice(0, cols.length).forEach((v, k) => {
      const inp = tr.querySelector(`[data-c="${cols[k]}"]`);
      if (inp) inp.value = cols[k] === 'clases_previas' ? clasesEnCasilla(leerClases(v) || 0) : cols[k] === 'km_previos' ? String(parseInt(v) || '') : v.trim();
    });
    tr = tr.nextElementSibling;
  }
  pmMarcarSucio();
  showToast('pm-toast', `${filas.length} fila(s) pegadas. Revisa y pulsa «Guardar todo».`, 'ok');
}

// «Clases ya hechas» van de ¼ en ¼: lo que no se entiende se marca en rojo
function pmValidarClases(inp) {
  const v = inp.value.trim();
  const mal = v !== '' && leerClases(v) == null && v !== '0';
  inp.classList.toggle('input-error', mal);
  inp.title = mal ? 'No se entiende: escribe las clases de ¼ en ¼ (12 · 12,25 · 12,5 · 12,75 o 12 ½)' : 'De ¼ en ¼: 12 · 12,25 · 12,5 · 12,75 (o 12 ½)';
}
function pmRecoger(tipo) {
  return [...document.querySelectorAll(`#pm-${tipo} tbody tr`)].map(tr => {
    const o = { id: tr.dataset.id ? parseInt(tr.dataset.id) : null };
    tr.querySelectorAll('[data-c]').forEach(el => { o[el.dataset.c] = el.value; });
    return o;
  });
}

async function guardarPuestaEnMarchaUI() {
  const res = await window.api.guardarPuestaEnMarcha({
    vehiculos: pmRecoger('vehiculos'), profesores: pmRecoger('profesores'), alumnos: pmRecoger('alumnos')
  });
  if (!res.ok) { await avisar(res.errores.join('\n'), { titulo: 'Revisa estos datos antes de guardar' }); return; }
  const c = res.creados, a = res.actualizados;
  const partes = [];
  if (c.alumnos || a.alumnos) partes.push(`${c.alumnos} alumnos nuevos y ${a.alumnos} actualizados`);
  if (c.vehiculos || a.vehiculos) partes.push(`${c.vehiculos + a.vehiculos} vehículos`);
  if (c.profesores || a.profesores) partes.push(`${c.profesores + a.profesores} profesores`);
  await loadPuestaEnMarcha();
  showToast('pm-toast', partes.length ? `Guardado: ${partes.join(', ')}. Se sincroniza con la nube y la web en unos segundos.` : 'No había cambios que guardar.', 'ok');
  document.getElementById('pm-toast')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function vaciarDatosPruebaUI() {
  const r0 = pmDatos ? pmDatos.resumen : { alumnos: 0, practicas: 0 };
  // Se borran todos, también los terminados que no salen en la tabla
  const r = { ...r0, alumnos: (r0.alumnos || 0) + (r0.alumnos_terminados || 0) };
  const vehiculos = document.getElementById('pm-borrar-vehiculos').checked;
  const profesores = document.getElementById('pm-borrar-profesores').checked;
  const que = `${r.alumnos} alumnos y ${r.practicas} prácticas${vehiculos ? `, ${r.vehiculos} vehículos` : ''}${profesores ? `, ${r.profesores} profesores` : ''}`;
  const escrito = await pedirTexto(
    `Se borrarán ${que} (y sus pagos, cargos, reservas, bonos y exámenes), también en la nube y en la web del móvil. Antes se guarda una copia de seguridad.\n\nPara confirmar, escribe BORRAR:`,
    { titulo: 'Borrar datos de prueba', peligro: true, textoAceptar: 'Borrar', placeholder: 'BORRAR' });
  if (escrito == null) return;
  if (escrito.trim().toUpperCase() !== 'BORRAR') { showToast('pm-borrar-toast', 'No se ha borrado nada: el texto no coincide.', 'warn'); return; }
  const res = await window.api.vaciarDatosPrueba({ vehiculos, profesores });
  if (!res.ok) { showToast('pm-borrar-toast', res.error, 'err'); return; }
  await loadPuestaEnMarcha();
  showToast('pm-borrar-toast', `Datos de prueba borrados. Copia de seguridad guardada en: ${res.copia}`, 'ok');
}

// ─── CLASES ANTERIORES (anotar del papel / crear con fecha y km) ─────────────
// «Anotar» abre el editor de las clases anteriores de un alumno; el paso 4
// prepara una propuesta para TODAS las que falten (db.planificarClasesAnteriores),
// la enseña y solo al confirmar la guarda tal cual (db.aplicarClasesAnteriores).
let pmPlan = null;
let pmAnot = null;   // { alumno, clases, total }

function pmEstadoAnteriores() {
  const el = document.getElementById('pm-anteriores-estado'); if (!el || !pmDatos) return;
  const r = pmDatos.resumen;
  const conKmPrevios = pmDatos.alumnos.filter(a => a.clases_previas > 0 && a.km_previos > 0);
  const pendientes = (r.clases_por_crear || 0) + (r.anteriores_sin_km || 0);
  const partes = [];
  if (r.clases_por_crear) partes.push(`<b>${fmtClases(r.clases_por_crear)}</b> ${r.clases_por_crear > 0 && r.clases_por_crear <= 1 ? 'clase' : 'clases'} de <b>${r.alumnos_por_crear}</b> ${r.alumnos_por_crear === 1 ? 'alumno' : 'alumnos'} están solo como número.`);
  if (r.anteriores_sin_km) partes.push(`<b>${r.anteriores_sin_km}</b> ${r.anteriores_sin_km === 1 ? 'clase anotada no tiene' : 'clases anotadas no tienen'} km todavía.`);
  if (r.clases_anteriores) partes.push(`Ya hay <b>${fmtClases(r.clases_anteriores)}</b> ${r.clases_anteriores > 0 && r.clases_anteriores <= 1 ? 'clase anterior creada o anotada' : 'clases anteriores creadas o anotadas'}.`);
  if (conKmPrevios.length) partes.push(`<span style="color:var(--text-muted)">${conKmPrevios.length} ${conKmPrevios.length === 1 ? 'alumno tiene' : 'alumnos tienen'} «km ya hechos» y se ${conKmPrevios.length === 1 ? 'queda' : 'quedan'} solo como número.</span>`);
  el.innerHTML = `<div class="pm-ant-estado ${pendientes ? '' : 'ok'}">
    <div class="pm-ant-txt">${partes.length ? partes.join(' ') : 'No hay clases anteriores apuntadas. Si un alumno ya había hecho clases, escribe cuántas en «Clases ya hechas» (paso 3).'}</div>
    ${pendientes ? `<button class="btn btn-primary" onclick="pmVerPropuesta()">Ver propuesta y crear…</button>` : ''}
  </div>`;
}

// Modal creado en JS (mismo patrón que #modal-clase)
function pmModal(id, html) {
  let modal = document.getElementById(id);
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'overlay'; modal.id = id;
    modal.innerHTML = '<div class="modal modal-ancho" role="dialog" aria-modal="true"><div class="pm-modal-cuerpo"></div></div>';
    document.body.appendChild(modal);
  }
  modal.querySelector('.pm-modal-cuerpo').innerHTML = html;
  openModal(id);
  return modal;
}

async function pmGuardarSiHaceFalta() {
  if (!pmSucio) return true;
  if (!(await confirmar('Hay cambios sin guardar en las tablas. Se guardan primero para que la propuesta los tenga en cuenta.', { titulo: 'Guardar antes', textoAceptar: 'Guardar y seguir' }))) return false;
  await guardarPuestaEnMarchaUI();
  return !pmSucio;
}

// ── Anotar (editor por alumno) ──
// Cada fila es un día: «Clases» = cuántas seguidas ese día (se guardan con la
// hora y los km repartidos). Se pueden pegar desde Excel o importar de un
// archivo (p. ej. el que saca una IA de un vídeo de la ficha en papel).

// Clases ya anotadas → filas: las seguidas del mismo día (hora a hora según la
// duración de clase y km encadenados, o sin hora/km) se juntan en una fila.
function pmAgruparAnteriores(clases) {
  const dur = getDuracionClaseMin();
  const aMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
  const filas = [];
  for (const c of clases) {
    const f = filas[filas.length - 1], u = f && f._ultima;
    // Una fracción (¼ ½ ¾) siempre cierra su fila: solo se sigue tras una clase entera
    const valor = c.clases || 1;
    const seguida = u && (u.clases || 1) === 1 && u.fecha === c.fecha && u.vehiculo_id === c.vehiculo_id && f.clases + valor <= 4 &&
      (!!u.hora_inicio === !!c.hora_inicio) && (!u.hora_inicio || aMin(c.hora_inicio) - aMin(u.hora_inicio) === dur) &&
      ((!u.km_final && !c.km_final) || (u.km_final > 0 && u.km_final === c.km_inicial));
    if (seguida) { f.ids.push(c.id); f.clases += valor; f.km_final = c.km_final; f._ultima = c; }
    else filas.push({ ...c, ids: [c.id], clases: valor, _ultima: c });
  }
  return filas;
}

// Cantidades del selector «Clases» de cada día: de ¼ en ¼ hasta 4
const PM_CANTIDADES = Array.from({ length: 16 }, (_, i) => (i + 1) / 4);
async function pmAnotar(alumnoId) {
  if (!(await pmGuardarSiHaceFalta())) return;
  const datos = await window.api.getClasesAnteriores(alumnoId);
  if (!datos) return;
  pmAnot = datos;
  const fila = (c = {}) => `<tr data-ids="${(c.ids || []).join(',')}"${c.revisar ? ' class="pm-anot-revisar" title="La IA no estaba segura de esta fecha: revísala"' : ''}>
      <td class="num-mono" style="color:var(--text-faint);width:34px"></td>
      <td><input type="text" data-c="fecha" data-mascara="fecha" maxlength="10" placeholder="dd/mm/aaaa" value="${c.fecha ? (/^\d{4}-/.test(c.fecha) ? fmtFecha(c.fecha) : esc(c.fecha)) : ''}" oninput="pmAnotCuenta()" onpaste="pmAnotPegar(event)" onkeydown="pmAnotTecla(event)"></td>
      <td><select data-c="clases" class="num-mono" title="Clases seguidas ese día (también ¼, ½ o ¾)" onchange="pmAnotCuenta()" onkeydown="pmAnotTecla(event)">${PM_CANTIDADES.map(v => `<option value="${v}"${v === (c.clases || 1) ? ' selected' : ''}>${fmtClases(v)}</option>`).join('')}</select></td>
      <td><input type="text" data-c="hora_inicio" data-mascara="hora" maxlength="5" placeholder="hh:mm" value="${esc(c.hora_inicio || '')}" onkeydown="pmAnotTecla(event)"></td>
      <td><input type="text" data-c="km_inicial" inputmode="numeric" placeholder="opcional" class="num-mono" value="${c.km_final ? c.km_inicial : ''}" onkeydown="pmAnotTecla(event)"></td>
      <td><input type="text" data-c="km_final" inputmode="numeric" placeholder="opcional" class="num-mono" value="${c.km_final ? c.km_final : ''}" onkeydown="pmAnotTecla(event)"></td>
      <td style="white-space:nowrap"><button type="button" class="btn btn-sm btn-ghost" title="Otra clase el mismo día, a otra hora" onclick="pmAnotMismoDia(this)">+ mismo día</button>
        <button type="button" class="btn btn-sm btn-ghost" title="Quitar" aria-label="Quitar" onclick="this.closest('tr').remove();pmAnotCuenta()">×</button></td></tr>`;
  pmAnotar._fila = fila;
  const filas = pmAgruparAnteriores(datos.clases).map(fila).join('') + fila();
  const nombre = esc(datos.alumno.nombre.split(' ')[0]);
  pmModal('modal-pm-anotar', `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0">Clases anteriores de ${esc(datos.alumno.nombre)}</h3>
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-pm-anotar')">Cerrar</button>
    </div>
    <p style="font-size:13px;color:var(--text-muted);margin:4px 0 12px">Copia del papel las clases que tengas: la <b>fecha</b> basta. Si ese día dio varias seguidas, pon cuántas en <b>Clases</b> (se guardan una detrás de otra, de ${getDuracionClaseMin()} min; también vale ¼, ½ o ¾ de clase). La hora y los km son opcionales: si no los pones, la app los calcula al crear las demás. Puedes pegar desde Excel varias filas (Fecha · Clases · Hora · Km inicial · Km final) en la primera casilla.</p>
    <div class="pm-anot-import">
      <div class="pm-anot-import-txt"><b>¿Tiene muchas clases?</b> Graba un vídeo de su ficha en papel, pásaselo a una IA (ChatGPT, Gemini, Claude…) con las instrucciones y guarda su respuesta como archivo <b>.csv</b> o <b>.txt</b> (o pégala en la primera casilla de Fecha). Se añaden aquí para que las revises antes de guardar.</div>
      <div class="pm-anot-import-bot">
        <button type="button" class="btn btn-sm btn-outline" onclick="pmCopiarInstruccionesIA()">Copiar instrucciones para la IA</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="pmGuardarPlantilla()">Descargar plantilla</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="document.getElementById('pm-anot-archivo').click()">Importar archivo…</button>
        <input type="file" id="pm-anot-archivo" accept=".csv,.txt,text/csv,text/plain" hidden onchange="pmAnotImportar(this)">
      </div>
      <div id="pm-anot-import-msg" class="hidden"></div>
    </div>
    <div class="pm-anot-scroll"><table class="pm-anot-tabla"><thead><tr><th>#</th><th>Fecha</th><th title="Clases seguidas ese día">Clases</th><th>Hora</th><th>Km inicial</th><th>Km final</th><th></th></tr></thead>
      <tbody id="pm-anot-filas">${filas}</tbody></table></div>
    <div class="pm-anot-pie">
      <span class="pm-anot-cuenta" id="pm-anot-cuenta"></span>
      <button class="btn btn-outline btn-sm" onclick="pmAnotNuevaFila(1)">+ Añadir día</button>
      <button class="btn btn-outline btn-sm" onclick="pmAnotNuevaFila(5)">+ 5 filas</button>
      <button class="btn btn-primary" onclick="pmAnotGuardar()">Guardar clases</button>
    </div>
    <div id="pm-anot-error" class="alert alert-err hidden" style="margin-top:10px;white-space:pre-line"></div>`);
  pmAnotCuenta();
  setTimeout(() => document.querySelector('#pm-anot-filas input')?.focus(), 60);
}
function pmAnotNuevaFila(n = 1, tras) {
  const tb = document.getElementById('pm-anot-filas'); if (!tb) return null;
  let ultima = null;
  for (let k = 0; k < n; k++) {
    if (tras) { tras.insertAdjacentHTML('afterend', pmAnotar._fila()); ultima = tras.nextElementSibling; tras = ultima; }
    else { tb.insertAdjacentHTML('beforeend', pmAnotar._fila()); ultima = tb.lastElementChild; }
  }
  pmAnotCuenta();
  return ultima;
}
function pmAnotMismoDia(btn) {
  const tr = btn.closest('tr');
  const nueva = pmAnotNuevaFila(1, tr);
  nueva.querySelector('[data-c="fecha"]').value = tr.querySelector('[data-c="fecha"]').value;
  pmAnotCuenta();
  nueva.querySelector('[data-c="hora_inicio"]').focus();
}
// Intro = misma casilla de la fila siguiente (como en una hoja de cálculo)
function pmAnotTecla(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const tr = e.target.closest('tr'), c = e.target.dataset.c;
  const sig = tr.nextElementSibling || pmAnotNuevaFila(1);
  sig.querySelector(`[data-c="${c}"]`).focus();
}
// Filas leídas (de un archivo o de lo pegado) → al editor: ocupan las filas
// vacías desde `tr` (o el final) y añaden las que falten.
function pmAnotRellenar(filas, tr) {
  const tb = document.getElementById('pm-anot-filas');
  if (!tr) tr = [...tb.children].find(x => ![...x.querySelectorAll('input')].some(i => i.dataset.c !== 'clases' && i.value.trim()));
  for (const f of filas) {
    if (!tr) tr = pmAnotNuevaFila(1);
    tr.querySelector('[data-c="fecha"]').value = f.fecha;
    tr.querySelector('[data-c="clases"]').value = String(PM_CANTIDADES.includes(f.clases) ? f.clases : 1);
    tr.querySelector('[data-c="hora_inicio"]').value = f.hora_inicio || '';
    tr.querySelector('[data-c="km_inicial"]').value = f.km_inicial || '';
    tr.querySelector('[data-c="km_final"]').value = f.km_final || '';
    tr.classList.toggle('pm-anot-revisar', !!f.revisar);
    if (f.revisar) tr.title = 'La IA no estaba segura de esta fecha: revísala'; else tr.removeAttribute('title');
    tr = tr.nextElementSibling;
  }
  if (!tr) pmAnotNuevaFila(1);
  pmAnotCuenta();
}
function pmAnotAviso(res, origen) {
  const el = document.getElementById('pm-anot-import-msg'); if (!el) return;
  const n = res.filas.reduce((t, f) => t + (f.clases || 1), 0);
  el.className = res.filas.length ? (res.errores.length ? 'alert alert-warn' : 'alert alert-ok') : 'alert alert-err';
  el.innerHTML = `<div>${res.filas.length ? `<b>${origen}: ${res.filas.length} ${res.filas.length === 1 ? 'día' : 'días'} (${fmtClases(n)} ${n > 0 && n <= 1 ? 'clase' : 'clases'}).</b> Revísalos y pulsa «Guardar clases».` : `<b>${origen}: no se ha podido leer ninguna clase.</b>`}
    ${res.errores.length ? `<ul class="pm-prop-lista">${res.errores.slice(0, 8).map(e => `<li>${esc(e)}</li>`).join('')}${res.errores.length > 8 ? `<li>… y ${res.errores.length - 8} avisos más.</li>` : ''}</ul>` : ''}</div>`;
}
// Pegar varias filas (Excel, o la respuesta de la IA) en la casilla de Fecha
async function pmAnotPegar(e) {
  const txt = (e.clipboardData || window.clipboardData).getData('text');
  if (!/[\t\n;]/.test(txt.trim())) return; // un solo valor: pegado normal
  e.preventDefault();
  const tr = e.target.closest('tr');
  const res = await window.api.leerArchivoClasesAnteriores(txt);
  if (res.filas.length) pmAnotRellenar(res.filas, tr);
  if (res.errores.length || res.filas.length > 1) pmAnotAviso(res, 'Pegado');
}
async function pmAnotImportar(input) {
  const archivo = input.files && input.files[0];
  input.value = '';
  if (!archivo) return;
  if (archivo.size > 2 * 1024 * 1024) { pmAnotAviso({ filas: [], errores: ['El archivo es demasiado grande (más de 2 MB): ¿seguro que es la lista de clases?'] }, archivo.name); return; }
  const texto = await archivo.text();
  const res = await window.api.leerArchivoClasesAnteriores(texto);
  if (res.filas.length) pmAnotRellenar(res.filas);
  pmAnotAviso(res, esc(archivo.name));
}
async function pmGuardarPlantilla() {
  const r = await window.api.guardarPlantillaClasesAnteriores();
  const el = document.getElementById('pm-anot-import-msg');
  if (r && r.ok && el) { el.className = 'alert alert-ok'; el.textContent = `Plantilla guardada en ${r.path}.`; }
  else if (r && !r.canceled && el) { el.className = 'alert alert-err'; el.textContent = r.msg || 'No se pudo guardar la plantilla.'; }
}
// Instrucciones para la IA que lee el vídeo de la ficha en papel
const PM_INSTRUCCIONES_IA = `Te paso un vídeo de la ficha de clases prácticas de un alumno de autoescuela (en papel). Extrae TODAS las clases que aparecen, en orden, y respóndeme SOLO con un CSV (sin explicaciones ni tablas) con esta cabecera exacta:
fecha;hora;clases

Reglas:
- fecha: día de la clase en formato dd/mm/aaaa. Si no se ve el año, deduce el que toca por el orden de las fechas.
- hora: hora de inicio en formato HH:MM (24 h). Si no aparece, déjala vacía.
- clases: cuántas clases se dieron ese día a esa hora (normalmente 1; si pone «2 clases» o hay dos firmas seguidas, 2). Si es una parte de clase, con decimales de cuarto en cuarto: media clase = 0.5, un cuarto = 0.25, tres cuartos = 0.75, una y media = 1.5.
- Una línea por cada fila de la ficha. No inventes clases ni fechas.
- Si una fecha no se lee con seguridad, escríbela igualmente con un «?» al final (por ejemplo 12/03/2025?) para que la revise.

Ejemplo:
fecha;hora;clases
08/09/2025;10:00;1
10/09/2025;17:30;2
12/09/2025;;1
15/09/2025;18:00;1.5`;
async function pmCopiarInstruccionesIA() {
  let ok = false;
  try { await navigator.clipboard.writeText(PM_INSTRUCCIONES_IA); ok = true; } catch (_) { /* sin portapapeles: se enseña el texto */ }
  const el = document.getElementById('pm-anot-import-msg'); if (!el) return;
  el.className = ok ? 'alert alert-ok' : 'alert alert-warn';
  el.innerHTML = ok
    ? '<div><b>Instrucciones copiadas.</b> Pégalas en la IA junto con el vídeo de la ficha; guarda su respuesta como .csv (o pégala en la primera casilla de Fecha).</div>'
    : `<div style="flex:1">Copia este texto y pégalo en la IA junto con el vídeo:<textarea readonly style="width:100%;height:160px;margin-top:6px;font-size:12px">${esc(PM_INSTRUCCIONES_IA)}</textarea></div>`;
}
function pmAnotCuenta() {
  const tb = document.getElementById('pm-anot-filas'); if (!tb || !pmAnot) return;
  const trs = [...tb.children];
  trs.forEach((tr, i) => { tr.firstElementChild.textContent = i + 1; });
  const n = trs.filter(tr => tr.querySelector('[data-c="fecha"]').value.trim())
    .reduce((t, tr) => t + (leerClases(tr.querySelector('[data-c="clases"]').value) || 1), 0);
  const total = pmAnot.total;
  const el = document.getElementById('pm-anot-cuenta');
  const C = fmtClases;
  el.innerHTML = n >= total
    ? `<b>${C(n)}</b> ${n > 0 && n <= 1 ? 'clase anotada' : 'clases anotadas'}${n > total ? ` (son más de las ${C(total)} que tenía apuntadas: el total sube a ${C(n)})` : ' — todas'}.`
    : `<b>${C(n)}</b> de <b>${C(total)}</b> anotadas · las <b>${C(total - n)}</b> que faltan las crea la app (paso 4).`;
}
async function pmAnotGuardar() {
  const filas = [...document.querySelectorAll('#pm-anot-filas tr')].map(tr => {
    const o = { ids: (tr.dataset.ids || '').split(',').map(x => parseInt(x)).filter(Boolean) };
    tr.querySelectorAll('[data-c]').forEach(el => { o[el.dataset.c] = el.value; });
    return o;
  });
  const res = await window.api.guardarClasesAnteriores(pmAnot.alumno.id, filas, { duracion: getDuracionClaseMin() });
  const err = document.getElementById('pm-anot-error');
  if (!res.ok) { err.textContent = res.errores.join('\n'); err.classList.remove('hidden'); err.scrollIntoView({ block: 'nearest' }); return; }
  closeModal('modal-pm-anotar');
  await loadPuestaEnMarcha();
  showToast('pm-toast', `${pmAnot.alumno.nombre}: ${fmtClases(res.anotadas)} ${res.anotadas > 0 && res.anotadas <= 1 ? 'clase anotada' : 'clases anotadas'}${res.pendientes ? `; faltan ${fmtClases(res.pendientes)}, que se crean en el paso 4` : ''}.`, 'ok');
}

// ── Propuesta y creación (paso 4) ──
async function pmVerPropuesta() {
  if (!(await pmGuardarSiHaceFalta())) return;
  const rango = getRangoPref();
  pmPlan = await window.api.planificarClasesAnteriores({ kmMin: rango.min, kmMax: rango.max, duracion: getDuracionClaseMin() });
  pmPintarPropuesta();
}
function pmPintarPropuesta() {
  const p = pmPlan; if (!p) return;
  const total = p.altas.length + p.km.length;
  const fechaC = f => fmtFecha(f);
  const filas = p.alumnos.map(a => `<tr>
      <td><b>${esc(a.nombre)}</b><details><summary>Ver las ${a.clases.length} clases</summary><div class="pm-prop-dias">${a.clases.map(c => `<span>${fechaC(c.fecha)}${c.hora_inicio ? ' ' + esc(c.hora_inicio) : ''} · ${c.km_final ? fmtMiles(c.km_inicial) + '–' + fmtMiles(c.km_final) : '—'}${c.anotada ? ' ✎' : ''}</span>`).join('')}</div></details></td>
      <td>${placaHTML(a.vehiculo) || esc(a.vehiculo)}</td>
      <td class="col-num num-mono">${a.nuevas}${a.anotadas_sin_km ? ` <small title="Anotadas a mano que reciben km">+${a.anotadas_sin_km} ✎</small>` : ''}</td>
      <td class="col-num num-mono">${a.dias}</td>
      <td class="num-mono">${fechaC(a.desde)} → ${fechaC(a.hasta)}</td>
      <td class="num-mono">${Number.isFinite(a.km_desde) ? fmtMiles(a.km_desde) + ' → ' + fmtMiles(a.km_hasta) : '—'}</td></tr>`).join('');
  const lista = (cls, xs) => xs.length ? `<ul class="pm-prop-lista ${cls}">${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  pmModal('modal-pm-propuesta', `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 style="margin:0">Crear las clases anteriores</h3>
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-pm-propuesta')">Cerrar</button>
    </div>
    ${p.vacio ? '<p>No hay clases anteriores pendientes de crear.</p>' : `
    <div class="pm-prop-tot">
      ${p.altas.length ? `<span class="pill pill-line"><b>${p.altas.length}</b>&nbsp;${p.altas.length === 1 ? 'clase nueva' : 'clases nuevas'}</span>` : ''}
      ${p.km.length ? `<span class="pill pill-line"><b>${p.km.length}</b>&nbsp;anotadas reciben km</span>` : ''}
      <span class="pill pill-line">km de ${p.opciones.kmMin} a ${p.opciones.kmMax} por clase · ${p.opciones.duracion} min</span>
    </div>
    <p style="font-size:13px;color:var(--text-muted);margin:0 0 10px">Días laborables hacia atrás, como mucho 2 clases por alumno y día y 12 por profesor y por coche, sin pisarse de horario. Los km encadenan con lo ya registrado en cada coche y nunca se solapan. Cuentan como clases normales (también en cobros). Antes de crearlas se guarda una copia de seguridad.</p>
    ${p.alumnos.length ? `<div class="table-wrap pm-prop-det"><table><thead><tr><th>Alumno</th><th>Coche</th><th class="col-num">Clases</th><th class="col-num">Días</th><th>Fechas</th><th>Km</th></tr></thead><tbody>${filas}</tbody></table></div>` : ''}`}
    ${lista('pm-prop-err', p.errores)}${lista('pm-prop-aviso', p.avisos)}
    <div class="pm-anot-pie" style="justify-content:flex-end">
      ${!p.vacio ? `<button class="btn btn-outline" onclick="pmVerPropuesta()" title="Los km de cada clase se eligen al azar dentro del rango">Otra propuesta</button>` : ''}
      ${total && p.ok ? `<button class="btn btn-primary" onclick="pmCrearPropuesta()">${p.altas.length ? `Crear ${p.altas.length} ${p.altas.length === 1 ? 'clase' : 'clases'}${p.km.length ? ` y poner km a ${p.km.length}` : ''}` : `Poner km a ${p.km.length} ${p.km.length === 1 ? 'clase' : 'clases'}`}</button>` : ''}
    </div>`);
}
async function pmCrearPropuesta() {
  const p = pmPlan; if (!p) return;
  const res = await window.api.aplicarClasesAnteriores(p);
  if (!res.ok) { await avisar(res.error, { titulo: 'No se han creado las clases' }); return; }
  closeModal('modal-pm-propuesta');
  pmPlan = null;
  await loadPuestaEnMarcha();
  showToast('pm-toast', `Creadas ${res.creadas} clases anteriores${res.km_rellenadas ? ` y puestos los km a ${res.km_rellenadas} anotadas` : ''}. Se sincronizan con la nube en unos segundos. Copia de seguridad previa: ${res.copia}`, 'ok');
  document.getElementById('pm-toast')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
