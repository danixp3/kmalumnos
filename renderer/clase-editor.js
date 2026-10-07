// ─── EDITOR DE CLASES (añadir y editar) ──────────────────────────────────────
// Una sola ventana para dar de alta una clase (también una olvidada: se encaja
// sola entre las otras del coche, con sus km) y para cambiar una que ya existe:
// cuántas clases fue (de ¼ en ¼), día, hora, coche, profesor, tipo y km. Mientras
// se escribe, enseña CÓMO QUEDARÍA (db/clases-sesion.js, sin guardar nada) y al
// pulsar Guardar se guarda exactamente eso. Cambiar el nº de clases de una sesión
// borra la firma del alumno: el profesor la recoge de nuevo en el móvil.

let CE = null; // estado del editor abierto
const CE_RAPIDAS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3];
const CE_MAX = 8;

function ceHorasTxt(n) {
  const min = Math.round(n * getDuracionClaseMin());
  return min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ' ' + String(min % 60).padStart(2, '0') + ' min' : ''}` : `${min} min`;
}
const ceNum = id => { const e = document.getElementById(id); return e ? e.value : ''; };

/**
 * opciones: { practica_id } para editar · { alumno_id?, vehiculo_id?, profesor_id?, fecha?, hora_inicio?, cantidad? } para una nueva.
 * `alTerminar` (opcional) se llama después de guardar o borrar.
 */
async function abrirEditorClase(opciones = {}) {
  const o = opciones;
  let sesion = null;
  if (o.practica_id) {
    sesion = await window.api.getSesionClase(o.practica_id);
    if (!sesion) { avisar('No se encuentra esa clase.'); return; }
    if (sesion.abierta) { avisar('Esa clase está en curso o sin cerrar: ciérrala desde el móvil antes de cambiarla.'); return; }
  }
  const [vehiculos, alumnos] = await Promise.all([window.api.getVehiculos(getSucursalActual()), window.api.getAlumnos(getSucursalActual())]);
  CE = {
    modo: sesion ? 'editar' : 'nueva', sesion, alTerminar: o.alTerminar || null,
    practica_id: sesion ? sesion.practica_id : null,
    alumno_id: sesion ? sesion.alumno_id : (o.alumno_id || null),
    vehiculo_id: sesion ? sesion.vehiculo_id : (o.vehiculo_id || null),
    profesor_id: sesion ? sesion.profesor_id : (o.profesor_id != null ? o.profesor_id : null),
    fecha: sesion ? sesion.fecha : (o.fecha || hoyISO()),
    hora: sesion ? (sesion.hora_inicio || '') : (o.hora_inicio || ''),
    tipo: sesion ? sesion.tipo : 'circulacion',
    cantidad: sesion ? sesion.cantidad : (o.cantidad || 1),
    km: { modo: sesion ? 'mantener' : 'auto', km_inicial: sesion && !sesion.sin_km ? sesion.km_inicial : '', km_final: sesion && !sesion.sin_km ? sesion.km_final : '', desplazar: false },
    vehiculos: (vehiculos || []).filter(v => v.activo !== false || v.id === (sesion && sesion.vehiculo_id)), alumnos: alumnos || [],
    prev: null, turno: 0, temporizador: null
  };
  if (!CE.vehiculo_id && CE.vehiculos.length) {
    const a = CE.alumnos.find(x => x.id === CE.alumno_id);
    CE.vehiculo_id = (a && a.vehiculo_id) || CE.vehiculos[0].id;
  }
  if (CE.profesor_id == null && CE.modo === 'nueva') {
    const a = CE.alumnos.find(x => x.id === CE.alumno_id);
    if (a && a.profesor_id) CE.profesor_id = a.profesor_id;
  }
  cePintar();
  await llenarSelectProfesores('ce-profesor', CE.profesor_id);
  ceCalcular();
}

function ceModal() {
  let modal = document.getElementById('modal-clase-editor');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'overlay'; modal.id = 'modal-clase-editor';
    modal.innerHTML = '<div class="modal modal-ancho ce-modal" role="dialog" aria-modal="true" aria-labelledby="ce-titulo"><div id="ce-cuerpo"></div></div>';
    document.body.appendChild(modal);
    let pulsadoEnElFondo = false;
    modal.addEventListener('mousedown', e => { pulsadoEnElFondo = e.target === modal; });
    modal.addEventListener('click', e => { if (e.target === modal && pulsadoEnElFondo) ceCerrar(); pulsadoEnElFondo = false; });
    modal.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('.dp-pop')) { e.stopPropagation(); ceCerrar(); } });
  }
  return modal;
}

function cePintar() {
  ceModal();
  const nueva = CE.modo === 'nueva';
  const s = CE.sesion;
  const alumno = CE.alumnos.find(a => a.id === CE.alumno_id);
  const tit = nueva ? 'Añadir clase' : 'Editar clase';
  const quien = s ? s.alumno : (alumno ? nombreAlumnoLista(alumno) : '');
  const km = CE.km;
  document.getElementById('ce-cuerpo').innerHTML = `
    <div class="modal-header">
      <div class="modal-header-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></div>
      <div style="flex:1;min-width:0"><h3 id="ce-titulo">${tit}</h3>${nueva ? '' : `<div class="ce-sub">${esc(quien)}${s && s.con_firma ? ' · <span class="pill pill-ok" style="font-size:11px;padding:1px 8px">Firmada por el alumno</span>' : ''}</div>`}</div>
      <button type="button" class="btn btn-outline btn-sm" onclick="ceCerrar()">Cerrar</button>
    </div>

    ${nueva ? `<div class="form-group"><label for="ce-alumno">Alumno</label>
      <select id="ce-alumno" onchange="ceCambio('alumno')">${CE.alumno_id ? '' : '<option value="">— Elige el alumno —</option>'}${opcionesAlumnosHTML(CE.alumnos, CE.alumno_id)}</select></div>` : ''}

    <div class="ce-clases">
      <div class="ce-clases-cab"><label>Cuántas clases fue</label><span class="ce-horas" id="ce-horas"></span></div>
      <div class="ce-stepper">
        <button type="button" class="ce-paso" onclick="ceSumar(-0.25)" aria-label="Menos un cuarto" id="ce-menos">−</button>
        <div class="ce-cant" id="ce-cant" aria-live="polite"></div>
        <button type="button" class="ce-paso" onclick="ceSumar(0.25)" aria-label="Más un cuarto" id="ce-mas">+</button>
      </div>
      <div class="ce-rapidas" id="ce-rapidas">${CE_RAPIDAS.map(c => `<button type="button" class="ce-chip" data-c="${c}" onclick="ceFijar(${c})">${fmtClases(c)}</button>`).join('')}</div>
    </div>

    <div class="ce-grid">
      <div class="form-group"><label for="ce-fecha">Día</label><input type="date" id="ce-fecha" value="${esc(CE.fecha)}" onchange="ceCambio('fecha')"></div>
      <div class="form-group"><label for="ce-hora">Hora de inicio</label><input type="text" id="ce-hora" data-mascara="hora" inputmode="numeric" maxlength="5" placeholder="hh:mm" value="${esc(CE.hora)}" oninput="ceCambio('hora')"></div>
      <div class="form-group"><label for="ce-vehiculo">Coche</label>
        <select id="ce-vehiculo" onchange="ceCambio('vehiculo')">${CE.vehiculos.map(v => `<option value="${v.id}"${v.id === CE.vehiculo_id ? ' selected' : ''}>${esc(v.nombre)}${v.matricula ? ' (' + esc(v.matricula) + ')' : ''}</option>`).join('')}</select></div>
      <div class="form-group"><label for="ce-profesor">Profesor</label>
        <select id="ce-profesor" onchange="ceCambio('profesor')"><option value="">— Sin profesor —</option></select></div>
      <div class="form-group"><label for="ce-tipo">Tipo</label>
        <select id="ce-tipo" onchange="ceCambio('tipo')"><option value="circulacion"${CE.tipo === 'circulacion' ? ' selected' : ''}>Circulación</option><option value="pista"${CE.tipo === 'pista' ? ' selected' : ''}>Pista</option></select></div>
    </div>

    <div class="ce-km">
      <label>Kilómetros</label>
      <div class="ce-seg" role="tablist" id="ce-km-seg">
        ${nueva ? '' : `<button type="button" role="tab" data-m="mantener" onclick="ceModoKm('mantener')">Dejarlos como están</button>`}
        <button type="button" role="tab" data-m="auto" onclick="ceModoKm('auto')">Automáticos · encajarla</button>
        <button type="button" role="tab" data-m="escribo" onclick="ceModoKm('escribo')">Los escribo</button>
        <button type="button" role="tab" data-m="sin" onclick="ceModoKm('sin')">Sin km</button>
      </div>
      <div class="ce-km-ayuda" id="ce-km-ayuda"></div>
      <div class="ce-km-escribo" id="ce-km-escribo" style="display:none">
        <div class="form-group"><label for="ce-ki">Km al empezar</label><input type="number" id="ce-ki" min="0" step="1" value="${esc(String(km.km_inicial))}" oninput="ceCambio('km')"></div>
        <div class="form-group"><label for="ce-kf">Km al terminar</label><input type="number" id="ce-kf" min="0" step="1" value="${esc(String(km.km_final))}" oninput="ceCambio('km')"></div>
      </div>
    </div>

    <div id="ce-prev" class="ce-prev"><p class="ce-calc">Calculando…</p></div>

    <div class="modal-actions">
      ${nueva ? '' : '<button type="button" class="btn btn-danger" style="margin-right:auto" onclick="ceBorrar()">Borrar clase</button>'}
      <button type="button" class="btn btn-gray" onclick="ceCerrar()">Cancelar</button>
      <button type="button" class="btn btn-primary" id="ce-guardar" onclick="ceGuardar()" disabled>${nueva ? 'Añadir clase' : 'Guardar cambios'}</button>
    </div>`;
  openModal('modal-clase-editor');
  ceMarcar();
  setTimeout(() => { const f = document.getElementById(nueva && !CE.alumno_id ? 'ce-alumno' : 'ce-hora'); if (f) f.focus(); }, 60);
}

// Lo que se ve según el estado: cantidad, chips, modo de km
function ceMarcar() {
  const c = CE.cantidad;
  const cant = document.getElementById('ce-cant');
  if (cant) {
    const nuevo = fmtClases(c) + (c > 1 ? ' clases' : ' clase');
    if (cant.textContent !== nuevo) { cant.textContent = nuevo; cant.classList.remove('ce-pop'); void cant.offsetWidth; cant.classList.add('ce-pop'); }
  }
  const h = document.getElementById('ce-horas'); if (h) h.textContent = `≈ ${ceHorasTxt(c)} al volante`;
  document.querySelectorAll('#ce-rapidas .ce-chip').forEach(b => b.classList.toggle('on', Math.abs(parseFloat(b.dataset.c) - c) < 1e-9));
  const menos = document.getElementById('ce-menos'), mas = document.getElementById('ce-mas');
  if (menos) menos.disabled = c <= 0.25; if (mas) mas.disabled = c >= CE_MAX;
  document.querySelectorAll('#ce-km-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === CE.km.modo));
  const esc_ = document.getElementById('ce-km-escribo'); if (esc_) esc_.style.display = CE.km.modo === 'escribo' ? '' : 'none';
  const ay = document.getElementById('ce-km-ayuda');
  if (ay) ay.textContent = {
    mantener: 'Los km de la sesión se quedan; si cambias el número de clases se reparten entre ellas.',
    auto: 'La clase se coloca sola donde le toca por día y hora, entre la anterior y la siguiente del coche.',
    escribo: 'Escribe el km del cuentakilómetros al empezar y al terminar la sesión entera.',
    sin: 'Se guarda sin km; luego se pueden repartir en Kilómetros.'
  }[CE.km.modo] || '';
}

function ceSumar(d) { ceFijar(Math.min(CE_MAX, Math.max(0.25, Math.round((CE.cantidad + d) * 4) / 4))); }
function ceFijar(c) { CE.cantidad = c; ceMarcar(); ceProgramar(); }
function ceModoKm(m) {
  CE.km.modo = m;
  if (m === 'escribo' && !ceNum('ce-ki') && CE.sesion && !CE.sesion.sin_km) {
    document.getElementById('ce-ki').value = CE.sesion.km_inicial; document.getElementById('ce-kf').value = CE.sesion.km_final;
  }
  CE.km.desplazar = false;
  ceMarcar(); ceProgramar();
}
function ceCambio(que) {
  if (que === 'fecha' || que === 'vehiculo' || que === 'alumno' || que === 'hora') CE.km.desplazar = false;
  // Cambiar el día, la hora o el coche de una clase existente: lo normal es que los km ya no encajen
  if (CE.modo === 'editar' && (que === 'fecha' || que === 'vehiculo') && CE.km.modo === 'mantener') {
    const nuevoDia = ceNum('ce-fecha') !== CE.sesion.fecha, nuevoCoche = parseInt(ceNum('ce-vehiculo')) !== CE.sesion.vehiculo_id;
    if (nuevoDia || nuevoCoche) { CE.km.modo = 'auto'; ceMarcar(); }
  }
  ceProgramar();
}
function ceProgramar() {
  clearTimeout(CE.temporizador);
  const b = document.getElementById('ce-guardar'); if (b) b.disabled = true;
  CE.temporizador = setTimeout(ceCalcular, 220);
}

function ceOp() {
  const km = { modo: CE.km.modo, desplazar: !!CE.km.desplazar };
  if (km.modo === 'escribo') { km.km_inicial = ceNum('ce-ki'); km.km_final = ceNum('ce-kf'); }
  const rango = getRangoPref();
  km.kmMin = rango.min; km.kmMax = rango.max;
  const op = {
    cantidad: CE.cantidad, fecha: ceNum('ce-fecha'), hora_inicio: ceNum('ce-hora').trim() || null,
    vehiculo_id: parseInt(ceNum('ce-vehiculo')) || null, profesor_id: ceNum('ce-profesor') || null, tipo: ceNum('ce-tipo') || 'circulacion',
    sucursal_id: getSucursalActual(), km
  };
  if (CE.modo === 'editar') op.practica_id = CE.practica_id; else op.alumno_id = parseInt(ceNum('ce-alumno')) || CE.alumno_id;
  return op;
}

async function ceCalcular() {
  if (!CE) return;
  const turno = ++CE.turno;
  const op = ceOp();
  if (CE.modo === 'nueva' && !op.alumno_id) { CE.prev = null; cePintarPrev(); return; }
  const prev = await window.api.proponerClase(op);
  if (!CE || turno !== CE.turno) return;
  CE.prev = prev;
  cePintarPrev();
}

function ceLado(x) {
  return `<b>${esc(x.alumno)}</b> (${esc(fechaCorta(x.fecha))}${x.hora_inicio ? ' ' + esc(x.hora_inicio) : ''})`;
}

function cePintarPrev() {
  const el = document.getElementById('ce-prev');
  const btn = document.getElementById('ce-guardar');
  if (!el) return;
  const P = CE.prev;
  if (!P) { el.innerHTML = '<p class="ce-calc">Elige el alumno para ver cómo queda.</p>'; if (btn) btn.disabled = true; return; }
  if (!P.ok) {
    el.innerHTML = `<div class="alert alert-err">${P.errores.map(esc).join('<br>')}</div>`;
    if (btn) btn.disabled = true;
    return;
  }
  const filas = P.filas.map(f => {
    const km = f.km_final > 0 ? `<span class="num-mono">${fmtMiles(f.km_inicial)} → ${fmtMiles(f.km_final)}</span> <span class="ce-kmn">${fmtMiles(f.km_final - f.km_inicial)} km</span>` : '<span class="ce-sinkm">sin km</span>';
    return `<div class="ce-fila${f.nueva ? ' nueva' : ''}"><span class="ce-fila-c">${fmtClases(f.peso)} ${f.peso > 1 ? 'clases' : 'clase'}${f.nueva ? ' <em>nueva</em>' : ''}</span><span class="ce-fila-h num-mono">${f.hora_inicio ? esc(f.hora_inicio) : '—'}</span><span>${km}</span></div>`;
  }).join('');
  const quitadas = P.borrar.length ? `<div class="ce-fila quitada"><span class="ce-fila-c">${P.borrar.length === 1 ? 'Se quita 1 práctica' : 'Se quitan ' + P.borrar.length + ' prácticas'}</span></div>` : '';

  // Dónde cae por km
  const c = P.contexto;
  let ctx = '';
  if (c) {
    const medio = c.anterior && c.siguiente ? `Va entre ${ceLado(c.anterior)} y ${ceLado(c.siguiente)}${c.hueco != null ? `: hay <b>${fmtMiles(c.hueco)} km</b> de hueco.` : '.'}`
      : c.anterior ? `Va a continuación de ${ceLado(c.anterior)}, la última clase del coche.`
        : c.siguiente ? `Va antes de ${ceLado(c.siguiente)}, la primera clase del coche.` : '';
    const como = { hueco: 'Cabe justa: ocupa esos km.', hueco_grande: 'Sobran km: se le ponen km típicos y el resto sigue siendo hueco.', despues: 'Sigue a continuación con km típicos.', antes: 'Se calcula hacia atrás con km típicos.', odometro: 'Parte del cuentakilómetros del coche.' }[c.metodo];
    if (medio || como) ctx = `<div class="ce-ctx">${medio} ${como || ''}</div>`;
  }
  let desplaz = '';
  const pideDesplazar = P.avisos.some(a => a.desplazable) || CE.km.desplazar;
  if (pideDesplazar && CE.km.modo === 'auto') {
    desplaz = `<label class="ce-desplazar"><input type="checkbox" ${CE.km.desplazar ? 'checked' : ''} onchange="ceDesplazar(this.checked)"><span><b>Desplazar las clases siguientes del coche</b> para hacerle sitio (el cuentakilómetros siempre sube; se puede deshacer en Kilómetros)</span></label>`;
  }
  const otras = P.otras.length
    ? `<details class="ce-otras"><summary>Se desplazan ${P.otras.length} ${P.otras.length === 1 ? 'clase siguiente' : 'clases siguientes'} (+${fmtMiles(P.contexto && P.contexto.desplazamiento || 0)} km)</summary>${P.otras.slice(0, 40).map(o => `<div class="ce-otra">${esc(o.alumno)} · ${esc(fechaCorta(o.fecha))} <span class="num-mono">${fmtMiles(o.antes.km_inicial)}→${fmtMiles(o.antes.km_final)} ➜ ${fmtMiles(o.despues.km_inicial)}→${fmtMiles(o.despues.km_final)}</span></div>`).join('')}${P.otras.length > 40 ? `<div class="ce-otra">… y ${P.otras.length - 40} más</div>` : ''}</details>` : '';
  const avisos = P.avisos.filter(a => a.tipo !== 'firma').map(a => `<div class="alert ${a.tipo === 'no_cabe' || a.tipo === 'solape' || a.tipo === 'abierta_despues' || a.tipo === 'sin_sitio' ? 'alert-warn' : 'alert-info'}" style="margin:8px 0 0">${esc(a.texto)}</div>`).join('');
  const firma = P.firma.borrar
    ? `<div class="ce-firma"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg><div><b>Se borra la firma del alumno.</b> Cambia de ${fmtClases(P.cantidad_antes)} a ${fmtClases(P.cantidad)} ${P.cantidad > 1 ? 'clases' : 'clase'}: el profesor tendrá que recogerla de nuevo en el móvil (le aparece como «Sin firmar»).</div></div>` : '';

  el.innerHTML = `<div class="ce-prev-tit">${CE.modo === 'nueva' ? 'Así quedaría' : 'Así quedará'} · ${esc(P.resumen)}</div>
    ${ctx}${filas}${quitadas}${desplaz}${otras}${avisos}${firma}`;
  if (btn) btn.disabled = false;
}

function ceDesplazar(v) { CE.km.desplazar = !!v; ceProgramar(); }

function ceCerrar() {
  if (!CE) return;
  clearTimeout(CE.temporizador);
  closeModal('modal-clase-editor');
  CE = null;
}

async function ceGuardar() {
  if (!CE || !CE.prev || !CE.prev.ok) return;
  const P = CE.prev;
  if (P.avisos.some(a => a.tipo === 'solape') && !await confirmar('Estos km se pisan con otra clase del coche.\n\n¿Guardar igualmente? Luego puedes arreglarlo en Kilómetros.', { textoAceptar: 'Guardar igualmente' })) return;
  if (P.firma.borrar && !await confirmar(`Al cambiar de ${fmtClases(P.cantidad_antes)} a ${fmtClases(P.cantidad)} ${P.cantidad > 1 ? 'clases' : 'clase'} se borra la firma del alumno.\n\nEl profesor tendrá que volver a recogerla en el móvil.\n\n¿Continuar?`, { textoAceptar: 'Cambiar y borrar la firma' })) return;
  const btn = document.getElementById('ce-guardar'); if (btn) btn.disabled = true;
  const r = await window.api.aplicarClase(P);
  if (!r.ok) {
    if (btn) btn.disabled = false;
    await avisar((r.errores || ['No se pudo guardar.']).join('\n'));
    ceProgramar();
    return;
  }
  const alTerminar = CE.alTerminar;
  const msg = CE.modo === 'nueva' ? 'Clase añadida' : 'Clase guardada';
  ceCerrar();
  if (typeof toastApp === 'function') toastApp(r.firmas_borradas ? `${msg} · el alumno debe volver a firmar` : msg);
  refrescarTrasClase();
  if (alTerminar) alTerminar(r);
}

async function ceBorrar() {
  if (!CE || CE.modo !== 'editar') return;
  const s = CE.sesion;
  const n = s.practica_ids.length;
  if (!await confirmar(`Se ${n === 1 ? 'borra la clase' : 'borran las ' + n + ' prácticas de esta sesión'} de ${s.alumno} del ${fechaCorta(s.fecha)}${n > 1 ? ` (${fmtClases(s.cantidad)} clases)` : ''}.\n\n¿Borrar?`, { peligro: true, textoAceptar: 'Borrar' })) return;
  const r = await window.api.quitarSesionClase(s.practica_id);
  if (!r.ok) { await avisar((r.errores || ['No se pudo borrar.']).join('\n')); return; }
  const alTerminar = CE.alTerminar;
  ceCerrar();
  if (typeof toastApp === 'function') toastApp('Clase borrada');
  refrescarTrasClase();
  if (alTerminar) alTerminar(r);
}

// Después de guardar, la pantalla que esté a la vista se vuelve a pintar
function refrescarTrasClase() {
  try {
    const activa = document.querySelector('.page.active');
    const id = activa ? activa.id : '';
    if (id === 'page-alumnos' && currentAlumnoId) loadPracticas();
    else if (id === 'page-practicas-global' && typeof fetchPracticasGlobal === 'function') fetchPracticasGlobal();
    else if (id === 'page-registro-rapido') loadRegistroRapido();
    else if (id === 'page-kilometros' && typeof kmRecargar === 'function') kmRecargar();
    else if (id === 'page-dashboard' && typeof loadDashboard === 'function') loadDashboard();
    else if (id === 'page-alumnos' && typeof loadAlumnos === 'function') loadAlumnos();
  } catch (e) { console.error(e); }
}

// ─── Compatibilidad con los botones de siempre ───────────────────────────────
function abrirNuevaPractica() {
  if (!currentAlumnoId) return;
  const a = fichaCache && fichaCache.alumno;
  abrirEditorClase({ alumno_id: currentAlumnoId, vehiculo_id: a ? a.vehiculo_id : currentAlumnoVehiculoId, profesor_id: a ? a.profesor_id : null });
}
function openEditPractica(id) { return abrirEditorClase({ practica_id: id }); }
