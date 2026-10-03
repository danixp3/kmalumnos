// ─── TRAER DATOS DE OTRO PROGRAMA ───────────────────────────────────────────
// Asistente para cambiarse desde otro programa de gestión (db/migracion.js):
//   1. archivo (Excel, CSV, .dbf…) o tabla pegada, y qué se trae: alumnos o
//      su historial de clases;
//   2. columnas reconocidas solas (se pueden corregir) y opciones;
//   3. vista previa SIN guardar (se recalcula al cambiar algo) → Importar.
// Las columnas elegidas se recuerdan por archivo (mismos títulos → mismas
// columnas): reimportar la lista cuando haya altas nuevas es un par de clics.
// Debajo, el historial de importaciones con «Deshacer».

const MG_MAPEOS_KEY = 'km_migracion_mapeos';
const MG_MAX_PREVIA = 300;
const MG_OPC_DEFECTO = { soloEnCurso: true, actualizar: 'vacios', crearRelacionados: true, crearAlumnos: true, capitalizar: true, ordenNombre: 'nombre_apellidos' };
const MG_NOMBRES_EXTRA = { profesor_id: 'profesor', vehiculo_id: 'coche', clases_previas: 'clases ya hechas', km_previos: 'km ya hechos' };
const mgPl = (n, uno, varios) => `${fmtMiles(n)} ${n === 1 ? uno : varios}`;
const mg = { tipo: 'alumnos', archivo: '', hojas: [], hoja: 0, det: null, mapeo: [], filaCabecera: -1, opciones: { ...MG_OPC_DEFECTO }, plan: null, filtro: 'todas', recordado: false, turno: 0 };

async function loadMigracion() {
  mgPintarTipo();
  await mgPintarHistorial();
}

function mgPintarTipo() {
  document.querySelectorAll('#mg-tipo button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tipo === mg.tipo)));
}

async function mgCambiarTipo(tipo) {
  if (mg.tipo === tipo) return;
  mg.tipo = tipo;
  mgPintarTipo();
  if (mg.hojas.length) await mgDetectar();
  else document.getElementById('mg-paso-origen').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function mgMsg(html, tipo = 'err') {
  const el = document.getElementById('mg-origen-msg');
  el.className = `alert alert-${tipo}`;
  el.innerHTML = `<span>${html}</span>`; // .alert es flex: el texto va envuelto
}

// ─── 1. ORIGEN ──────────────────────────────────────────────────────────────
async function mgAbrirArchivo() {
  const r = await window.api.migracionAbrirArchivo();
  if (!r || r.canceled) return;
  if (!r.ok) { mgMsg(esc(r.error)); return; }
  document.getElementById('mg-pegar').value = '';
  document.getElementById('mg-paso-ariauto').hidden = true;
  if (r.ariauto) { mgAriautoMostrar(r); return; }
  await mgCargar(r.archivo, r.hojas);
}

// Lo pegado llega al cuadro justo después del evento
function mgPegado() {
  setTimeout(async () => {
    const t = document.getElementById('mg-pegar').value;
    if (!t.trim()) return;
    const r = await window.api.migracionLeerTexto(t);
    if (!r.filas.length) { mgMsg('No se ha encontrado ninguna tabla en lo pegado.'); return; }
    await mgCargar('Tabla pegada', [{ nombre: 'Tabla pegada', ...r }]);
  }, 0);
}

async function mgCargar(archivo, hojas) {
  mg.archivo = archivo; mg.hojas = hojas; mg.plan = null; mg.filtro = 'todas';
  mg.hoja = hojas.reduce((m, h, i) => (h.filas.length > hojas[m].filas.length ? i : m), 0);
  const h = hojas[mg.hoja];
  mgMsg(`<b>${esc(archivo)}</b>: ${fmtMiles(h.filas.length)} filas leídas${hojas.length > 1 ? ` de la hoja «${esc(h.nombre)}» (el archivo tiene ${hojas.length} hojas)` : ''}.`, 'ok');
  document.getElementById('mg-paso-hecho').hidden = true;
  await mgDetectar();
  document.getElementById('mg-paso-columnas').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function mgElegirHoja(i) {
  mg.hoja = parseInt(i) || 0;
  await mgDetectar();
}

// ─── 2. COLUMNAS Y OPCIONES ─────────────────────────────────────────────────
const mgNorm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function mgFirma() {
  const h = mg.hojas[mg.hoja];
  const titulos = mg.filaCabecera >= 0 ? h.filas[mg.filaCabecera].map(mgNorm).join('|') : `sin-titulos:${mg.mapeo.length}`;
  return `${mg.tipo}|${titulos}`;
}
function mgRecordados() {
  try { const v = JSON.parse(localStorage.getItem(MG_MAPEOS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}
function mgRecordar() {
  try {
    const todos = mgRecordados();
    const { hoy, duracion, sucursal_id, ...opciones } = mg.opciones;
    todos[mgFirma()] = { mapeo: mg.mapeo, opciones, fecha: Date.now() };
    const claves = Object.keys(todos).sort((a, b) => (todos[b].fecha || 0) - (todos[a].fecha || 0)).slice(0, 20);
    localStorage.setItem(MG_MAPEOS_KEY, JSON.stringify(Object.fromEntries(claves.map(k => [k, todos[k]]))));
  } catch (e) {}
}

async function mgDetectar(filaCabecera) {
  const hoja = mg.hojas[mg.hoja];
  const det = await window.api.migracionDetectar(hoja, mg.tipo, filaCabecera);
  mg.det = det; mg.filaCabecera = det.filaCabecera; mg.mapeo = det.mapeo.slice();
  mg.opciones = { ...MG_OPC_DEFECTO, ordenNombre: det.ordenNombre };
  // ¿Ya se importó un archivo con estas mismas columnas? Se repite lo de entonces
  mg.recordado = false;
  const guardado = filaCabecera === undefined ? mgRecordados()[mgFirma()] : null;
  if (guardado && Array.isArray(guardado.mapeo) && guardado.mapeo.length === mg.mapeo.length) {
    mg.mapeo = guardado.mapeo.slice(); mg.opciones = { ...mg.opciones, ...guardado.opciones }; mg.recordado = true;
  }
  mgPintarColumnas();
  mgPintarOpciones();
  document.getElementById('mg-paso-columnas').hidden = false;
  await mgAnalizar();
}

const mgLetra = c => (c >= 26 ? String.fromCharCode(64 + Math.floor(c / 26)) : '') + String.fromCharCode(65 + (c % 26));

function mgPintarColumnas() {
  const det = mg.det, hoja = mg.hojas[mg.hoja];
  const selHoja = mg.hojas.length > 1
    ? `<label>Hoja <select onchange="mgElegirHoja(this.value)">${mg.hojas.map((h, i) => `<option value="${i}" ${i === mg.hoja ? 'selected' : ''}>${esc(h.nombre)} · ${fmtMiles(h.filas.length)} filas</option>`).join('')}</select></label>` : '';
  const filasTit = [`<option value="-1" ${mg.filaCabecera < 0 ? 'selected' : ''}>No hay: los datos empiezan arriba</option>`]
    .concat(hoja.filas.slice(0, 12).map((f, i) => `<option value="${i}" ${i === mg.filaCabecera ? 'selected' : ''}>Fila ${hoja.numFila[i]}: ${esc(f.filter(Boolean).slice(0, 4).join(' · ').slice(0, 70))}</option>`));
  document.getElementById('mg-fuente').innerHTML = `${selHoja}<label>Fila con los títulos <select onchange="mgDetectar(parseInt(this.value))">${filasTit.join('')}</select></label>` +
    (mg.recordado ? '<span class="pill pill-ok">Columnas como en tu importación anterior de este archivo</span>' : '');
  document.getElementById('mg-aviso-tipo').innerHTML = det.tipoSugerido === mg.tipo ? ''
    : det.tipoSugerido === 'clases'
      ? `<div class="alert alert-warn" style="margin-bottom:12px"><span>Este archivo parece un <b>historial de clases</b> (fechas, horas, km). <a href="#" onclick="event.preventDefault();mgCambiarTipo('clases')">Importarlo como historial de clases</a></span></div>`
      : `<div class="alert alert-warn" style="margin-bottom:12px"><span>Este archivo parece una <b>lista de alumnos</b> (DNI, teléfonos…), no un historial de clases. <a href="#" onclick="event.preventDefault();mgCambiarTipo('alumnos')">Importarlo como alumnos</a></span></div>`;
  const opciones = campo => '<option value="">— No importar —</option>' + det.campos.map(x => `<option value="${x.id}" ${x.id === campo ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  const datos = hoja.filas.slice(mg.filaCabecera + 1);
  document.querySelector('#mg-columnas tbody').innerHTML = mg.mapeo.map((campo, c) => {
    const titulo = mg.filaCabecera >= 0 ? hoja.filas[mg.filaCabecera][c] : '';
    const ej = datos.map(f => f[c]).filter(Boolean).slice(0, 3);
    const auto = campo && det.mapeo[c] === campo;
    return `<tr class="${campo ? '' : 'mg-col-off'}">
      <td><b>${esc(titulo || 'Columna ' + mgLetra(c))}</b>${titulo ? ` <small>(${mgLetra(c)})</small>` : ''}</td>
      <td class="mg-ej">${ej.length ? ej.map(x => `<span title="${esc(x)}">${esc(x.length > 38 ? x.slice(0, 37) + '…' : x)}</span>`).join('') : '<i>vacía</i>'}</td>
      <td><select class="${auto ? 'mg-auto' : ''}" onchange="mgCambiarCampo(${c}, this.value)" aria-label="Qué es la columna ${esc(titulo || mgLetra(c))}">${opciones(campo)}</select></td></tr>`;
  }).join('');
}

function mgCambiarCampo(c, campo) {
  const def = mg.det.campos.find(x => x.id === campo);
  // Un campo de una sola columna se mueve: deja de estar en la que lo tenía
  if (campo && def && !def.multiple) mg.mapeo = mg.mapeo.map((k, i) => (k === campo && i !== c ? '' : k));
  mg.mapeo[c] = campo;
  mg.recordado = false;
  mgPintarColumnas();
  mgPintarOpciones();
  mgAnalizar();
}

function mgPintarOpciones() {
  const o = mg.opciones, tiene = k => mg.mapeo.includes(k);
  const chk = (k, texto) => `<label class="mg-chk"><input type="checkbox" ${o[k] ? 'checked' : ''} onchange="mgOpcion('${k}', this.checked)"> ${texto}</label>`;
  const sel = (k, texto, ops, nota = '') => `<label class="mg-sel">${texto} <select onchange="mgOpcion('${k}', this.value)">${ops.map(([v, t]) => `<option value="${v}" ${o[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select>${nota ? ` <small>${nota}</small>` : ''}</label>`;
  let h = '';
  if (mg.tipo === 'alumnos') {
    h += sel('actualizar', 'Si el alumno ya está en la app:', [['vacios', 'completar solo lo que le falte (recomendado)'], ['todo', 'poner los datos del archivo'], ['nada', 'no tocarlo']]);
    if (tiene('estado') || tiene('fecha_baja')) h += chk('soloEnCurso', 'Dejar fuera a los dados de baja y a los ya aprobados');
    h += chk('crearRelacionados', 'Crear los profesores y coches que no existan');
  } else {
    h += chk('crearAlumnos', 'Crear los alumnos que no estén en la app');
    h += chk('crearRelacionados', 'Crear los profesores y coches que no existan');
    h += `<span class="mg-nota">Cada clase dura ${getDuracionClaseMin()} min (Ajustes): una de ${getDuracionClaseMin() * 2} min cuenta como 2. Entran como «clases anteriores» y se descuentan de las clases ya hechas del alumno.</span>`;
  }
  h += chk('capitalizar', 'Arreglar los nombres escritos EN MAYÚSCULAS');
  if (tiene('nombre_completo')) {
    h += sel('ordenNombre', 'El nombre completo está escrito como', [['nombre_apellidos', 'Nombre Apellidos (Ana García López)'], ['apellidos_nombre', 'Apellidos Nombre (García López Ana)']], 'con coma («García López, Ana») se entiende siempre');
  }
  document.getElementById('mg-opciones').innerHTML = h;
}

function mgOpcion(k, v) { mg.opciones[k] = v; mgAnalizar(); }

function mgEntrada() {
  const h = mg.hojas[mg.hoja];
  const suc = typeof getSucursalActual === 'function' ? getSucursalActual() : null;
  return {
    tipo: mg.tipo, filas: h.filas, numFila: h.numFila, filaCabecera: mg.filaCabecera, mapeo: mg.mapeo, archivo: mg.archivo,
    opciones: { ...mg.opciones, hoy: hoyISO(), duracion: getDuracionClaseMin(), sucursal_id: suc || null }
  };
}

// ─── 3. VISTA PREVIA E IMPORTAR ─────────────────────────────────────────────
async function mgAnalizar() {
  const turno = ++mg.turno;
  const plan = await window.api.migracionAnalizar(mgEntrada());
  if (turno !== mg.turno) return; // ya hay otra más reciente en camino
  mg.plan = plan;
  mgPintarPrevia();
}

const MG_ACCIONES = {
  nuevo: ['pill-ok', 'Nuevo'], actualizar: ['pill-info', 'Se completa'], igual: ['pill-line', 'Ya está'],
  omitir: ['pill-warn', 'No entra'], error: ['pill-err', 'Error']
};

function mgPintarPrevia() {
  const p = mg.plan;
  document.getElementById('mg-paso-revisar').hidden = false;
  const btn = document.getElementById('mg-btn-importar');
  const errores = document.getElementById('mg-errores');
  if (!p.ok) {
    document.getElementById('mg-resumen').innerHTML = '';
    document.getElementById('mg-filtro').innerHTML = '';
    document.getElementById('mg-prev').innerHTML = '';
    errores.innerHTML = `<div class="alert alert-warn"><span>${p.errores.map(esc).join('<br>')}</span></div>`;
    btn.disabled = true; btn.textContent = 'Importar';
    document.getElementById('mg-acciones-txt').textContent = '';
    return;
  }
  const r = p.resumen, alumnos = p.tipo === 'alumnos';
  const pills = (alumnos
    ? [[r.nuevos, r.nuevos === 1 ? 'alumno nuevo' : 'alumnos nuevos', 'pill-ok'], [r.actualizar, r.actualizar === 1 ? 'se completa' : 'se completan', 'pill-info'], [r.iguales, r.iguales === 1 ? 'ya estaba' : 'ya estaban', 'pill-line']]
    : [[r.clases, r.clases === 1 ? 'clase nueva' : 'clases nuevas', 'pill-ok'], [r.alumnosNuevos, r.alumnosNuevos === 1 ? 'alumno nuevo' : 'alumnos nuevos', 'pill-info'], [r.iguales, r.iguales === 1 ? 'ya estaba' : 'ya estaban', 'pill-line'], [r.sinKm, 'sin km', 'pill-line']])
    .concat([[r.omitidos, r.omitidos === 1 ? 'no entra' : 'no entran', 'pill-warn'], [r.errores, 'con errores', 'pill-err'], [r.conAvisos, 'con avisos', 'pill-warn']]);
  document.getElementById('mg-resumen').innerHTML = pills.filter(([n], i) => n || i === 0).map(([n, t, c]) => `<span class="pill ${c}"><b>${fmtMiles(n)}</b>&nbsp;${t}</span>`).join('');
  const crear = [];
  if (r.profesoresNuevos.length) crear.push(`Se crearán ${r.profesoresNuevos.length === 1 ? 'el profesor' : 'los profesores'} <b>${r.profesoresNuevos.map(esc).join(', ')}</b>.`);
  if (r.vehiculosNuevos.length) crear.push(`Se crearán ${r.vehiculosNuevos.length === 1 ? 'el coche' : 'los coches'} <b>${r.vehiculosNuevos.map(esc).join(', ')}</b> (después pon su km en Puesta en marcha).`);
  errores.innerHTML = crear.length ? `<div class="alert alert-info"><span>${crear.join(' ')}</span></div>` : '';

  const cuenta = f => (f === 'todas' ? p.filas.length : f === 'avisos' ? p.filas.filter(x => x.avisos.length).length : p.filas.filter(x => x.accion === f).length);
  const filtros = [['todas', 'Todas'], ['nuevo', 'Nuevos'], ...(alumnos ? [['actualizar', 'Se completan']] : []), ['igual', 'Ya estaban'], ['omitir', 'No entran'], ['error', 'Errores'], ['avisos', 'Con avisos']]
    .filter(([f]) => f === 'todas' || cuenta(f));
  if (!filtros.some(([f]) => f === mg.filtro)) mg.filtro = 'todas';
  document.getElementById('mg-filtro').innerHTML = filtros.map(([f, t]) => `<button type="button" aria-pressed="${f === mg.filtro}" onclick="mg.filtro='${f}';mgPintarPrevia()">${t} <span class="seg-n">${fmtMiles(cuenta(f))}</span></button>`).join('');

  const lista = p.filas.filter(x => mg.filtro === 'todas' || (mg.filtro === 'avisos' ? x.avisos.length : x.accion === mg.filtro));
  const nombreCampo = k => MG_NOMBRES_EXTRA[k] || ((mg.det.campos.find(c => c.id === k) || {}).nombre || k).toLowerCase();
  const detalle = f => {
    const partes = [];
    if (f.motivo) partes.push(esc(f.motivo));
    if (f.cambios && Object.keys(f.cambios).length) partes.push('Añade: ' + Object.keys(f.cambios).map(nombreCampo).map(esc).join(', '));
    if (f.saldo) partes.push(`Saldo ${f.saldo > 0 ? 'pendiente' : 'a favor'}: ${esc(String(f.saldo).replace('.', ','))} €`);
    if (f.alumno && (f.alumno.clases_previas || f.alumno.km_previos)) partes.push(`Lleva ${f.alumno.clases_previas || 0} clases${f.alumno.km_previos ? ` y ${fmtMiles(f.alumno.km_previos)} km` : ''}`);
    const av = f.avisos.length ? `<div class="mg-avisos">${f.avisos.map(esc).join('<br>')}</div>` : '';
    return partes.join(' · ') + av;
  };
  const cab = alumnos
    ? '<tr><th class="col-num">Fila</th><th>Qué pasa</th><th>Alumno</th><th>DNI</th><th>Teléfono</th><th>Permiso</th><th>Profesor · coche</th><th>Detalle</th></tr>'
    : '<tr><th class="col-num">Fila</th><th>Qué pasa</th><th>Alumno</th><th>Fecha</th><th>Hora</th><th class="col-num">Clases</th><th>Km</th><th>Detalle</th></tr>';
  const fila = f => {
    const [cls, txt] = MG_ACCIONES[f.accion] || ['pill-line', f.accion];
    const comun = `<td class="col-num num-mono">${f.n}</td><td><span class="pill ${cls}">${txt}</span></td><td>${esc(f.nombre || '—')}</td>`;
    if (alumnos) {
      return `<tr>${comun}<td class="num-mono">${esc(f.dni || '')}</td><td class="num-mono">${esc(f.telefono || '')}</td><td>${esc(f.permiso || '')}</td>
        <td>${esc([f.profesor, f.vehiculo].filter(Boolean).join(' · '))}</td><td class="mg-det">${detalle(f)}</td></tr>`;
    }
    const km = f.practica && f.practica.km_final > 0 ? `${fmtMiles(f.practica.km_inicial)}–${fmtMiles(f.practica.km_final)}` : '';
    return `<tr>${comun}<td class="num-mono">${f.fecha ? esc(fmtFecha(f.fecha)) : ''}</td><td class="num-mono">${esc(f.hora || '')}</td>
      <td class="col-num">${f.clases || ''}</td><td class="num-mono">${km}</td><td class="mg-det">${detalle(f)}</td></tr>`;
  };
  document.getElementById('mg-prev').innerHTML = `<thead>${cab}</thead><tbody>${lista.slice(0, MG_MAX_PREVIA).map(fila).join('') ||
    '<tr><td colspan="8" class="mg-vacio">No hay filas aquí.</td></tr>'}${lista.length > MG_MAX_PREVIA ? `<tr><td colspan="8" class="mg-vacio">… y ${fmtMiles(lista.length - MG_MAX_PREVIA)} filas más</td></tr>` : ''}</tbody>`;

  const hay = alumnos ? r.nuevos + r.actualizar : r.clases;
  btn.disabled = !hay;
  btn.textContent = alumnos
    ? (hay ? `Importar ${r.nuevos ? `${fmtMiles(r.nuevos)} ${r.nuevos === 1 ? 'alumno' : 'alumnos'}` : ''}${r.nuevos && r.actualizar ? ' y ' : ''}${r.actualizar ? `completar ${fmtMiles(r.actualizar)}` : ''}` : 'No hay nada nuevo que importar')
    : (hay ? `Importar ${fmtMiles(r.clases)} ${r.clases === 1 ? 'clase' : 'clases'}` : 'No hay clases nuevas que importar');
  document.getElementById('mg-acciones-txt').textContent = hay ? 'Antes se guarda una copia de seguridad y se puede deshacer.' : '';
}

async function mgImportar() {
  const r = mg.plan && mg.plan.ok ? mg.plan.resumen : null;
  if (!r) return;
  const que = mg.plan.tipo === 'alumnos'
    ? `Entrarán ${mgPl(r.nuevos, 'alumno nuevo', 'alumnos nuevos')}${r.actualizar ? ` y se completarán los datos de ${mgPl(r.actualizar, 'alumno', 'alumnos')}` : ''}.`
    : `Entrarán ${mgPl(r.clases, 'clase anterior', 'clases anteriores')}${r.alumnosNuevos ? ` y ${mgPl(r.alumnosNuevos, 'alumno nuevo', 'alumnos nuevos')}` : ''}.`;
  const ok = await confirmar(`${que}\n\nAntes se guarda una copia de seguridad, y podrás deshacer esta importación desde esta misma pantalla.`, { titulo: 'Importar', textoAceptar: 'Importar' });
  if (!ok) return;
  const btn = document.getElementById('mg-btn-importar');
  btn.disabled = true; btn.textContent = 'Importando…';
  const res = await window.api.migracionAplicar(mgEntrada());
  if (!res || !res.ok) {
    await avisar(((res && res.errores) || ['No se pudo importar.']).join('\n'), { titulo: 'No se ha importado nada' });
    mgPintarPrevia();
    return;
  }
  mgRecordar();
  mgPintarHecho(res, mg.plan.tipo);
  mg.hojas = []; mg.plan = null;
  document.getElementById('mg-pegar').value = '';
  document.getElementById('mg-origen-msg').className = 'hidden';
  document.getElementById('mg-paso-columnas').hidden = true;
  document.getElementById('mg-paso-revisar').hidden = true;
  await mgPintarHistorial();
}

function mgPintarHecho(res, tipo) {
  const r = res.resumen;
  const el = document.getElementById('mg-paso-hecho');
  const que = tipo === 'alumnos'
    ? `${mgPl(r.creadosAlumnos, 'alumno nuevo', 'alumnos nuevos')}${r.actualizadosAlumnos ? ` y ${mgPl(r.actualizadosAlumnos, 'completado', 'completados')}` : ''}`
    : `${mgPl(r.clasesCreadas, 'clase anterior', 'clases anteriores')}${r.creadosAlumnos ? ` y ${mgPl(r.creadosAlumnos, 'alumno nuevo', 'alumnos nuevos')}` : ''}`;
  const botones = [];
  if (tipo === 'alumnos') botones.push(`<button class="btn btn-primary" onclick="mgCambiarTipo('clases')">Traer también su historial de clases</button>`);
  botones.push(`<button class="btn btn-outline" onclick="navegarA('alumnos')">Ver los alumnos</button>`);
  botones.push(`<button class="btn btn-outline" onclick="navegarA('puesta-en-marcha')">${tipo === 'clases' && r.sinKm ? 'Dar km a las clases que no los traen' : 'Puesta en marcha: km de los coches y clases ya hechas'}</button>`);
  el.innerHTML = `<div class="pm-paso-cab"><span class="pm-num mg-num-ok">✓</span><div><h3>Hecho: ${que}</h3>
      <p>Se están subiendo a la nube: en unos segundos los profesores los verán en el móvil.${res.copia ? ' Copia de seguridad previa guardada.' : ''}
      Si sigues dando de alta en tu programa anterior, repite esto con su lista cuando quieras: <b>solo entrarán los nuevos</b> y se recordarán estas columnas.</p></div></div>
    <div class="mg-siguientes">${botones.join('')}</div>
    <div class="mg-basico"><div><b>¿Solo vas a usar AulaMovil para registrar las prácticas?</b> Deja en el menú lo básico (alumnos, prácticas, coches, km) y oculta cobros, caja, exámenes… Se puede volver a mostrar en Ajustes → Menú lateral.</div>
      <button class="btn btn-outline btn-sm" onclick="aplicarPresetMenu('basico');showToast('mg-toast','Menú reducido a lo básico. Para volver a verlo todo: Ajustes → Menú lateral.','ok')">Dejar el menú en lo básico</button></div>`;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── HISTORIAL Y DESHACER ───────────────────────────────────────────────────
async function mgPintarHistorial() {
  const lista = await window.api.migracionHistorial();
  const card = document.getElementById('mg-historial-card');
  card.hidden = !lista.length;
  if (!lista.length) return;
  const cuando = iso => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const que = i => i.tipo === 'alumnos' || i.tipo === 'ariauto'
    ? `${mgPl(i.alumnos, 'alumno nuevo', 'alumnos nuevos')}${i.actualizados ? `, ${mgPl(i.actualizados, 'completado', 'completados')}` : ''}${i.tipo === 'ariauto' ? ` <small>(Ariauto${i.examenes ? `, ${mgPl(i.examenes, 'examen', 'exámenes')}` : ''}${i.pagos || i.cargos ? `, ${fmtMiles(i.cargos)} cargos y ${fmtMiles(i.pagos)} pagos` : ''})</small>` : ''}`
    : `${mgPl(i.clases, 'clase', 'clases')}${i.alumnos ? `, ${mgPl(i.alumnos, 'alumno nuevo', 'alumnos nuevos')}` : ''}`;
  document.getElementById('mg-historial').innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Cuándo</th><th>De dónde</th><th>Qué entró</th><th></th></tr></thead>
    <tbody>${lista.map(i => `<tr><td class="num-mono">${cuando(i.fecha)}</td><td>${esc(i.archivo)}</td>
      <td>${que(i)}${i.profesores || i.vehiculos ? ` <small>(+ ${[i.profesores && mgPl(i.profesores, 'profesor', 'profesores'), i.vehiculos && mgPl(i.vehiculos, 'coche', 'coches')].filter(Boolean).join(', ')})</small>` : ''}</td>
      <td style="text-align:right">${i.deshecha ? `<span class="pill pill-line">Deshecha el ${esc(cuando(i.deshecha))}</span>` : `<button class="btn btn-sm btn-outline" onclick="mgDeshacer('${esc(i.id)}')">Deshacer</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}

async function mgDeshacer(id) {
  const ok = await confirmar('Se quitará lo que entró en esa importación (alumnos, clases, profesores, coches y saldos) y los alumnos que se completaron volverán a como estaban. Los alumnos que ya tengan clases o pagos nuevos se conservan.\n\n¿Deshacer la importación?', { titulo: 'Deshacer importación', peligro: true, textoAceptar: 'Deshacer' });
  if (!ok) return;
  const r = await window.api.migracionDeshacer(id);
  if (!r.ok) { showToast('mg-toast', r.error, 'err'); return; }
  const quitado = [r.alumnos && mgPl(r.alumnos, 'alumno', 'alumnos'), r.practicas && mgPl(r.practicas, 'clase', 'clases')].filter(Boolean).join(' y ');
  showToast('mg-toast', `Importación deshecha${quitado ? `: quitados ${quitado}` : ''}${r.restaurados ? `; ${mgPl(r.restaurados, 'alumno vuelve', 'alumnos vuelven')} a como estaba${r.restaurados === 1 ? '' : 'n'}` : ''}${r.conservados.length ? `. Se ${r.conservados.length === 1 ? 'conserva' : 'conservan'} ${mgPl(r.conservados.length, 'alumno que ya tiene', 'alumnos que ya tienen')} clases o pagos (${r.conservados.slice(0, 4).join(', ')}${r.conservados.length > 4 ? '…' : ''})` : ''}.`, 'ok');
  await mgPintarHistorial();
}

// ─── ARIAUTO (base de datos Access) ─────────────────────────────────────────
// Al elegir la base de Ariauto (.accdb) se salta el reconocimiento de columnas:
// db/ariauto.js ya sabe dónde está cada cosa. Aquí solo se eligen secciones,
// qué alumnos y qué más traer, con la vista previa al momento.
const mga = { archivo: '', plan: null, opciones: {}, turno: 0 };

function mgAriautoMostrar(r) {
  mga.archivo = r.archivo; mga.plan = r.plan;
  mga.opciones = { alcance: 'curso', economia: false, examenes: true, tasas: true, profesores: true, vehiculos: true, centro: true,
    secciones: r.plan.secciones.filter(s => s.elegida).map(s => s.seccion) };
  mgMsg(`<b>${esc(r.archivo)}</b>: base de datos de <b>Ariauto</b> reconocida.`, 'ok');
  ['mg-paso-columnas', 'mg-paso-revisar', 'mg-paso-hecho'].forEach(id => { document.getElementById(id).hidden = true; });
  mgAriautoPintar();
  document.getElementById('mg-paso-ariauto').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function mgAriautoOpcion(k, v) {
  if (k === 'seccion') {
    const s = new Set(mga.opciones.secciones);
    if (v.on) s.add(v.seccion); else s.delete(v.seccion);
    mga.opciones.secciones = [...s];
  } else mga.opciones[k] = v;
  const turno = ++mga.turno;
  const plan = await window.api.ariautoAnalizar({ ...mga.opciones, hoy: hoyISO() });
  if (turno !== mga.turno) return;
  mga.plan = plan;
  mgAriautoPintar();
}

function mgAriautoPintar() {
  const p = mga.plan, o = mga.opciones, el = document.getElementById('mg-paso-ariauto');
  el.hidden = false;
  if (!p || !p.ok) { el.innerHTML = `<div class="alert alert-warn"><span>${esc(((p && p.errores) || ['No se pudo leer la base de Ariauto.']).join(' '))}</span></div>`; return; }
  const r = p.resumen, f = p.fiabilidadCobros || {};
  const chk = (k, texto, on = o[k]) => `<label class="mg-chk"><input type="checkbox" ${on ? 'checked' : ''} onchange="mgAriautoOpcion('${k}', this.checked)"> ${texto}</label>`;
  const secciones = p.secciones.map(s => `<label class="mg-chk"><input type="checkbox" ${s.elegida ? 'checked' : ''} onchange="mgAriautoOpcion('seccion', { seccion: ${s.seccion}, on: this.checked })"> ${esc(s.nombre)} <small>(${fmtMiles(s.alumnos)}${s.curso ? ' · cursos' : ''})</small></label>`).join('');
  const pills = [[r.nuevos, r.nuevos === 1 ? 'alumno nuevo' : 'alumnos nuevos', 'pill-ok'], [r.completar, r.completar === 1 ? 'se completa' : 'se completan', 'pill-info'],
    [r.revisar, 'no se tocan (nombre repetido)', 'pill-warn'], [r.clases, 'clases ya hechas', 'pill-line'], [r.examenes, 'exámenes', 'pill-line'],
    [r.tasas, 'tasas', 'pill-line'], [r.vencimientos, 'caducidades', 'pill-line'], [r.profesoresNuevos, r.profesoresNuevos === 1 ? 'profesor nuevo' : 'profesores nuevos', 'pill-line'],
    [r.vehiculosNuevos, r.vehiculosNuevos === 1 ? 'coche nuevo' : 'coches nuevos', 'pill-line'], ...(o.economia ? [[r.cargos, 'cargos', 'pill-line'], [r.pagos, 'pagos', 'pill-line']] : [])]
    .filter(([n], i) => n || i === 0).map(([n, t, c]) => `<span class="pill ${c}"><b>${fmtMiles(n)}</b>&nbsp;${t}</span>`).join('');
  const estados = { matriculado: 'Matriculado', en_practicas: 'En prácticas', apto: 'Aprobado', baja: 'Baja', apto_teorico: 'Teórico aprobado' };
  const filas = p.filas.map(x => {
    const [cls, txt] = MG_ACCIONES[x.accion] || (x.accion === 'revisar' ? ['pill-warn', 'No se toca'] : ['pill-line', x.accion]);
    return `<tr><td><span class="pill ${cls}">${txt}</span></td><td>${esc(x.nombre)}</td><td class="num-mono">${esc(x.dni || '')}</td><td>${esc(x.permiso || '')}</td>
      <td>${esc(estados[x.estado] || x.estado || '')}</td><td class="col-num">${x.clases ? String(x.clases).replace('.', ',') : ''}</td>
      ${o.economia ? `<td class="col-num num-mono">${x.saldo == null ? '' : esc(String(x.saldo).replace('.', ','))}</td>` : ''}<td class="col-num">${x.examenes || ''}</td>
      <td class="mg-det">${x.avisos.length ? `<div class="mg-avisos">${x.avisos.map(esc).join('<br>')}</div>` : ''}</td></tr>`;
  }).join('');
  const hay = r.nuevos + r.completar;
  el.innerHTML = `<div class="pm-paso-cab"><span class="pm-num">2</span><div><h3>Ariauto: elige qué traer</h3>
      <p>La app ya sabe dónde guarda Ariauto cada dato. <b>Todavía no se ha guardado nada</b>: cambia lo que quieras y la vista previa se actualiza.</p></div></div>
    <div class="mg-ariauto-op">
      <div><b>Secciones</b><div class="mg-ariauto-lista">${secciones}</div></div>
      <div><b>Alumnos</b><div class="seg seg-tabs" role="group" aria-label="Qué alumnos">
        <button type="button" aria-pressed="${o.alcance !== 'todos'}" onclick="mgAriautoOpcion('alcance','curso')">En curso <span class="seg-n">${fmtMiles(r.enCurso)}</span></button>
        <button type="button" aria-pressed="${o.alcance === 'todos'}" onclick="mgAriautoOpcion('alcance','todos')">También los terminados <span class="seg-n">${fmtMiles(r.enCurso + r.terminados)}</span></button></div>
        <small class="mg-nota">En curso: sin baja ni aprobado y con alta o movimientos en el último año. De los terminados solo se traen sus datos.</small></div>
      <div><b>Qué más</b><div class="mg-ariauto-lista">${chk('examenes', 'Exámenes')}${chk('tasas', 'Tasas de la DGT')}${chk('profesores', 'Profesores que falten')}${chk('vehiculos', 'Coches de alta, con ITV y seguro en Caducidades')}${chk('centro', 'Datos del centro para la ficha DGT (si están vacíos)')}</div></div>
    </div>
    <div class="alert ${f.fiable ? 'alert-info' : 'alert-warn'}" style="margin-top:12px"><span>${chk('economia', '<b>Traer también los cargos y pagos de Ariauto</b>')}
      ${f.fiable ? 'Su saldo pasará a ser el de Ariauto.' : `<br>No recomendado: en Ariauto no constan la mayoría de los cobros (de ${fmtMiles(f.aptosRecientes)} alumnos aprobados en los dos últimos años, ${fmtMiles(f.aptosConDeuda)} aparecen debiendo). Si los traes, la app los mostraría como morosos. Mejor empezar a cero y apuntar en la app lo que cobres desde ahora.`}</span></div>
    <div class="pm-resumen" style="margin-top:14px">${pills}</div>
    <div class="table-wrap mg-prev-wrap"><table class="mg-prev"><thead><tr><th>Qué pasa</th><th>Alumno</th><th>DNI</th><th>Permiso</th><th>Estado</th><th class="col-num">Clases hechas</th>${o.economia ? '<th class="col-num">Saldo €</th>' : ''}<th class="col-num">Exámenes</th><th>Avisos</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="9" class="mg-vacio">Ningún alumno con estas opciones.</td></tr>'}${p.masFilas ? `<tr><td colspan="9" class="mg-vacio">… y ${fmtMiles(p.masFilas)} alumnos más</td></tr>` : ''}</tbody></table></div>
    <div class="mg-acciones"><span>${hay ? 'Antes se guarda una copia de seguridad y se puede deshacer.' : ''}</span>
      <button class="btn btn-primary" id="mg-ariauto-btn" onclick="mgAriautoImportar()" ${hay ? '' : 'disabled'}>${hay ? `Importar ${fmtMiles(r.nuevos)} ${r.nuevos === 1 ? 'alumno' : 'alumnos'}${r.completar ? ` y completar ${fmtMiles(r.completar)}` : ''}` : 'No hay nada que importar'}</button></div>`;
}

async function mgAriautoImportar() {
  const r = mga.plan && mga.plan.ok ? mga.plan.resumen : null;
  if (!r) return;
  const ok = await confirmar(`Entrarán ${mgPl(r.nuevos, 'alumno nuevo', 'alumnos nuevos')}${r.completar ? ` y se completarán ${mgPl(r.completar, 'alumno', 'alumnos')}` : ''}, con sus clases ya hechas${mga.opciones.examenes ? ', exámenes' : ''}${mga.opciones.economia ? ', cargos y pagos' : ''}.\n\nAntes se guarda una copia de seguridad, y podrás deshacer esta importación desde esta misma pantalla.`, { titulo: 'Importar de Ariauto', textoAceptar: 'Importar' });
  if (!ok) return;
  const btn = document.getElementById('mg-ariauto-btn');
  btn.disabled = true; btn.textContent = 'Importando…';
  const suc = typeof getSucursalActual === 'function' ? getSucursalActual() : null;
  const res = await window.api.ariautoAplicar({ ...mga.opciones, hoy: hoyISO(), sucursal_id: suc || null });
  if (!res || !res.ok) {
    await avisar(((res && res.errores) || ['No se pudo importar.']).join('\n'), { titulo: 'No se ha importado nada' });
    mgAriautoPintar();
    return;
  }
  // Datos del centro para la ficha DGT, si aún no se habían puesto
  let centro = false;
  if (mga.opciones.centro && res.centro) {
    const actual = getCentroDatos();
    if (!actual.numero && !actual.denominacion) {
      try { localStorage.setItem(CENTRO_DATOS_KEY, JSON.stringify({ ...res.centro, rellenar_fecha: actual.rellenar_fecha !== false })); centro = true; } catch (e) {}
    }
  }
  document.getElementById('mg-paso-ariauto').hidden = true;
  document.getElementById('mg-origen-msg').className = 'hidden';
  mga.plan = null;
  const x = res.resumen;
  const el = document.getElementById('mg-paso-hecho');
  el.innerHTML = `<div class="pm-paso-cab"><span class="pm-num mg-num-ok">✓</span><div><h3>Hecho: ${mgPl(x.creadosAlumnos, 'alumno nuevo', 'alumnos nuevos')}${x.actualizadosAlumnos ? ` y ${mgPl(x.actualizadosAlumnos, 'completado', 'completados')}` : ''} desde Ariauto</h3>
      <p>Se están subiendo a la nube: en unos segundos los profesores los verán en el móvil.${res.copia ? ' Copia de seguridad previa guardada.' : ''}${centro ? ' Los datos del centro de la ficha DGT se han rellenado con los de Ariauto (Ajustes → Datos del centro).' : ''}
      Los datos que la app no tiene como campo (sexo, nacionalidad, tutor, nº de Ariauto…) están en las observaciones de cada alumno.</p></div></div>
    <div class="mg-siguientes"><button class="btn btn-outline" onclick="navegarA('alumnos')">Ver los alumnos</button>
      <button class="btn btn-outline" onclick="navegarA('puesta-en-marcha')">Puesta en marcha: km de los coches y clases ya hechas</button>
      <button class="btn btn-outline" onclick="navegarA('vencimientos')">Ver caducidades (ITV, seguros, DNI)</button></div>`;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await mgPintarHistorial();
}
