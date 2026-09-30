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
  document.getElementById('pm-barra').hidden = true;
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
    <td>${p.id ? '' : '<button class="btn btn-sm btn-ghost" title="Quitar fila" onclick="this.closest(\'tr\').remove()">×</button>'}</td></tr>`;
}
function pmOpciones(lista, sel, vacio) {
  return `<option value="">${vacio}</option>` + lista.map(x => `<option value="${x.id}" ${String(x.id) === String(sel) ? 'selected' : ''}>${esc(x.nombre)}${x.matricula ? ' · ' + esc(x.matricula) : ''}</option>`).join('');
}
function pmFilaAlumno(a, i) {
  const permisos = ['B', 'A', 'A1', 'A2', 'AM', 'C', 'C1', 'D', 'BE', 'CE'];
  return `<tr data-id="${a.id || ''}" data-fila="${i}">
    <td><input type="text" data-c="nombre" value="${esc(a.nombre || '')}" placeholder="Nombre" oninput="pmMarcarSucio()" onpaste="pmPegar(event)"></td>
    <td><input type="text" data-c="primer_apellido" value="${esc(a.primer_apellido || '')}" oninput="pmMarcarSucio()"></td>
    <td><input type="text" data-c="segundo_apellido" value="${esc(a.segundo_apellido || '')}" oninput="pmMarcarSucio()"></td>
    <td><select data-c="permiso" onchange="pmMarcarSucio()">${permisos.map(p => `<option ${p === (a.permiso || 'B') ? 'selected' : ''}>${p}</option>`).join('')}</select></td>
    <td><select data-c="profesor_id" onchange="pmMarcarSucio()">${pmOpciones(pmDatos.profesores, a.profesor_id, '— Sin asignar —')}</select></td>
    <td><select data-c="vehiculo_id" onchange="pmMarcarSucio()">${pmOpciones(pmDatos.vehiculos, a.vehiculo_id, '— Sin asignar —')}</select></td>
    <td class="col-num"><input type="number" data-c="clases_previas" min="0" max="500" value="${pmNum(a.clases_previas)}" placeholder="0" class="num-mono" style="width:80px;text-align:right" oninput="pmMarcarSucio()"></td>
    <td class="col-num"><input type="number" data-c="km_previos" min="0" value="${pmNum(a.km_previos)}" placeholder="0" class="num-mono" style="width:90px;text-align:right" oninput="pmMarcarSucio()"></td>
    <td class="col-num num-mono">${a.id ? `${a.practicas} · ${fmtMiles(a.km_practicas)} km` : '—'}</td>
    <td>${a.id ? '' : '<button class="btn btn-sm btn-ghost" title="Quitar fila" onclick="this.closest(\'tr\').remove()">×</button>'}</td></tr>`;
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
      if (inp) inp.value = cols[k].endsWith('previas') || cols[k].endsWith('previos') ? String(parseInt(v) || '') : v.trim();
    });
    tr = tr.nextElementSibling;
  }
  pmMarcarSucio();
  showToast('pm-toast', `${filas.length} fila(s) pegadas. Revisa y pulsa «Guardar todo».`, 'ok');
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
  const r = pmDatos ? pmDatos.resumen : { alumnos: 0, practicas: 0 };
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
