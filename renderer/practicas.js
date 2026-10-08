// ─── PRÁCTICAS ───────────────────────────────────────────────────────────────
// Prácticas de kilómetros de un alumno: listado, generación de km y CRUD.

// ─── FICHA DEL ALUMNO ────────────────────────────────────────────────────────
// Detalle de un alumno: cabecera con métricas y progreso hasta el permiso,
// km por clase, historial de prácticas (con edición/borrado), calendario de
// días de práctica, lo trabajado, próximas clases y observaciones del profesor.
// Todo sale de db.getFichaAlumno (una llamada). currentAlumnoId marca el alumno abierto.
let fichaCache = null;

function verPracticas(alumnoId, vehiculoId, nombre) {
  if (currentAlumnoId !== alumnoId) fdEditando = false;
  currentAlumnoId = alumnoId;
  currentAlumnoVehiculoId = vehiculoId;
  document.getElementById('practicas-titulo').textContent = nombre;
  document.getElementById('view-alumnos').style.display = 'none';
  document.getElementById('view-practicas').style.display = 'block';
  document.getElementById('content').scrollTop = 0;
  if (typeof navRegistrar === 'function') navRegistrar();
  loadPracticas();
}

function volverAlumnos() {
  currentAlumnoId = null;
  fichaCache = null;
  fdEditando = false;
  document.getElementById('view-alumnos').style.display = 'block';
  document.getElementById('view-practicas').style.display = 'none';
  if (typeof navRegistrar === 'function') navRegistrar();
  loadAlumnos();
}

// Añadir y editar clases: renderer/clase-editor.js (abrirNuevaPractica, openEditPractica).

async function abrirNuevaReservaAlumno() {
  if (!currentAlumnoId) return;
  await abrirNuevaReserva();
  const sel = document.getElementById('res-alumno');
  if (sel) sel.value = String(currentAlumnoId);
  const ficha = fichaCache && fichaCache.alumno;
  if (ficha) {
    const v = document.getElementById('res-vehiculo'); if (v && ficha.vehiculo_id) v.value = String(ficha.vehiculo_id);
    const pr = document.getElementById('res-profesor'); if (pr && ficha.profesor_id) pr.value = String(ficha.profesor_id);
  }
}

// Posición del alumno en el camino hasta el permiso (según su estado).
const FICHA_ESTADO_IDX = { matriculado: 0, en_teorica: 1, apto_teorico: 2, en_practicas: 3, activo: 3, presentado: 4, no_apto: 4, apto: 5, aprobado: 5 };

function fichaSvg(d, w, extra) {
  return `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra || ''}>${d}</svg>`;
}

function pintarCabeceraFicha(f) {
  const a = f.alumno;
  const nombreCompleto = [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ');
  document.getElementById('practicas-titulo').textContent = nombreCompleto;
  const estado = a.estado || 'activo';
  const idx = estado === 'baja' ? -1 : (FICHA_ESTADO_IDX[estado] ?? 3);
  const m = f.metricas;
  const minutos = m.clases * getDuracionClaseMin();
  const horas = `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')}`;

  const linea1 = [a.n_registro ? `Nº ${esc(a.n_registro)}` : '', `Permiso ${esc(a.permiso)}`, a.fecha_alta ? 'Alta el ' + fmtFecha(a.fecha_alta) : '', a.profesor_nombre ? 'Profesor: ' + esc(a.profesor_nombre) : ''].filter(Boolean).join(' · ');
  const contacto = [
    a.telefono ? `<span class="ficha-dato">${fichaSvg('<path d="M5 3.5h3.5l2 5-2.5 1.5a11 11 0 0 0 6 6l1.5-2.5 5 2V19a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z"/>', 16)}${esc(a.telefono)}</span>` : '',
    a.email ? `<span class="ficha-dato">${fichaSvg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>', 16)}${esc(a.email)}</span>` : '',
    a.dni ? `<span class="ficha-dato">${fichaSvg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.6-2.3 3-2.3s2.5.8 3 2.3M15 10h3M15 13h3"/>', 16)}DNI ••••${esc(String(a.dni).slice(-4))}</span>` : '',
    a.vehiculo_matricula ? `<span class="ficha-dato">${placaHTML(a.vehiculo_matricula)}${esc(a.vehiculo_nombre || '')}</span>` : ''
  ].filter(Boolean).join('');

  const bono = a.bono && a.bono.total > 0
    ? `<div class="ficha-metrica"><dd>${a.bono.usadas} / ${a.bono.total}</dd><dt>Clases del bono</dt></div>`
    : `<div class="ficha-metrica"><dd>${fmtClases(m.clases)}</dd><dt>${m.clases > 0 && m.clases <= 1 ? 'Clase' : 'Clases'}</dt></div>`;

  // Pasos del camino hasta el permiso
  const ex = f.proximoExamen;
  const pasos = [
    { tit: 'Matrícula', sub: a.fecha_alta ? fmtFecha(a.fecha_alta) : 'Alumno dado de alta', est: 'hecho' },
    { tit: 'Examen teórico', sub: idx >= 3 ? 'Aprobado' : (idx === 2 ? 'Apto teórico' : (idx === 1 ? 'En teórica' : 'Pendiente')), est: idx >= 2 ? 'hecho' : (idx === 1 ? 'actual' : 'pend') },
    { tit: 'Prácticas', sub: `${fmtClases(m.clases)} ${m.clases > 0 && m.clases <= 1 ? 'clase' : 'clases'} · ${fmtMiles(m.km)} km${m.clases_previas ? ` <span title="Clases hechas antes de usar la app (punto de partida)">(${fmtClases(m.clases_previas)} anteriores)</span>` : ''}`, est: idx >= 4 ? 'hecho' : (idx >= 2 ? 'actual' : 'pend') },
    { tit: 'Examen práctico', sub: idx >= 5 ? 'Aprobado' : (ex ? fechaCorta(ex.fecha) : (idx === 4 ? 'Presentado' : 'Sin fecha')), est: idx >= 5 ? 'hecho' : (idx === 4 ? 'actual' : 'pend'), bandera: true },
    { tit: `Permiso ${esc(a.permiso)}`, sub: idx >= 5 ? 'Obtenido' : 'Tras aprobar el práctico', est: idx >= 5 ? 'hecho' : 'pend', ultimo: true }
  ];
  const paso = (p, i) => {
    const conectorSolido = p.est === 'hecho';
    const nodo = p.est === 'hecho'
      ? `<span class="paso-nodo paso-hecho">${fichaSvg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16, 'style="stroke-width:2.6"')}</span>`
      : p.est === 'actual'
        ? '<span class="paso-nodo paso-actual"><span></span></span>'
        : `<span class="paso-nodo paso-pend">${p.bandera ? fichaSvg('<path d="M6 21V4M6 4h11l-2.5 4 2.5 4H6"/>', 14, 'style="stroke-width:2.4"') : ''}</span>`;
    return `<li${p.est === 'actual' ? ' aria-current="step"' : ''}><div class="paso-linea">${nodo}${p.ultimo ? '' : `<span class="paso-conector${conectorSolido ? ' solido' : ''}"></span>`}</div><div class="paso-txt"><span class="paso-tit">${p.tit}</span><span class="paso-sub">${p.sub}</span></div></li>`;
  };

  document.getElementById('ficha-cab').innerHTML = `
    <div class="ficha-cab-fila">
      <span class="avatar-ini avatar-ini-lg" aria-hidden="true" data-ini="${esc(iniciales(nombreCompleto))}">${esc(iniciales(nombreCompleto))}</span>
      <div class="ficha-quien">
        <h1>${esc(nombreCompleto)}${estado === 'baja' ? ' <span class="pill pill-err" style="vertical-align:middle">Baja</span>' : estado === 'inactivo' ? ' <span class="pill pill-line" style="vertical-align:middle">Inactivo</span>' : ''}${a.procedencia ? ' ' + etiquetaProcedencia(a.procedencia, { larga: true }) : ''}</h1>
        <span class="ficha-linea">${linea1}</span>
        <div class="ficha-contacto">${contacto}</div>
        ${(f.otros_expedientes || []).length ? `<div class="ficha-expedientes" title="La misma persona con otro permiso o curso: cada uno es un expediente con su nº">Otros expedientes: ${f.otros_expedientes.map(x =>
          `<button type="button" class="pill pill-line ficha-exp" onclick="verPracticas(${x.id},${x.vehiculo_id || 'null'},'${esc(x.nombre)}')">${x.n_registro ? 'Nº ' + esc(x.n_registro) + ' · ' : ''}${esc(x.permiso)}${x.estado ? ' · ' + esc(ESTADO_ALUMNO_TEXTO[x.estado] || x.estado) : ''}</button>`).join(' ')}</div>` : ''}
      </div>
      <dl class="ficha-metricas">
        ${bono}
        <div class="ficha-metrica"><dd>${fmtMiles(m.km)} km</dd><dt>Recorridos</dt></div>
        <div class="ficha-metrica"><dd>${horas}</dd><dt>Al volante</dt></div>
        <div class="ficha-metrica"><dd>${fmtDec(m.mediaKm)} km</dd><dt>Media por clase</dt></div>
      </dl>
    </div>
    <ol class="ficha-pasos" aria-label="Camino hasta el permiso">${pasos.map(paso).join('')}</ol>`;
}

function pintarKmClase(f) {
  const cont = document.getElementById('ficha-kmclase');
  const conKm = f.practicas.filter(p => !p.enCurso && p.km > 0);
  if (!conKm.length) {
    cont.innerHTML = '<div class="card-head"><h2>Km por clase</h2></div><div class="vacio-panel">Todavía no hay clases con kilómetros.</div>';
    return;
  }
  const AL = 150;
  const max = Math.max(...conKm.map(p => p.km));
  const paso = [5, 10, 20, 50, 100].find(x => max / x <= 4) || 100;
  const yMax = Math.ceil(max / paso) * paso;
  const px = v => Math.round((v / yMax) * AL);
  let ticks = '', lineas = '';
  for (let v = 0; v <= yMax; v += paso) { ticks += `<span style="bottom:${px(v)}px">${v}</span>`; if (v > 0) lineas += `<span class="dia-grid" style="bottom:${px(v)}px"></span>`; }
  const hoy = hoyISO();
  // Con muchas clases: menos separación y solo algunas etiquetas (cada `cada`).
  const n = conKm.length;
  const hueco = n > 80 ? 1 : n > 40 ? 2 : 5;
  const cada = Math.max(1, Math.ceil(n / 30));
  const barras = conKm.map((p, i) => {
    const ultima = i === conKm.length - 1;
    const tip = `${fechaCorta(p.fecha)} · ${p.km} km${p.fecha === hoy ? ' · hoy' : ''}`;
    return `<button type="button" class="dia-bar km-bar" aria-label="${esc(tip)}" style="padding:0;border:none;background:transparent;cursor:default">
      ${ultima ? `<span class="dia-hoy-lbl" style="bottom:${px(p.km) + 2}px">${p.km} km${p.fecha === hoy ? ' · hoy' : ''}</span>` : ''}
      <span class="${ultima ? 'dia-hoy' : 'dia-fill'}" style="height:${Math.max(px(p.km), 2)}px"></span>
      <span class="dia-tip" style="bottom:${px(p.km) + 26}px" role="tooltip">${esc(tip)}</span></button>`;
  }).join('');
  const etiquetas = conKm.map((p, i) => `<span class="${i % cada === 0 || i === n - 1 ? '' : 'km-x-oculta'}">${p.n}</span>`).join('');
  cont.innerHTML = `<div class="card-head" style="flex-direction:column;align-items:flex-start;gap:2px"><h2>Km por clase</h2><span class="card-note">${conKm.length} ${conKm.length === 1 ? 'clase' : 'clases'} · media de ${fmtDec(f.metricas.mediaKm)} km · pasa el ratón por una barra para ver la fecha</span></div>
    <div class="dia-chart" style="margin-top:10px"><div class="dia-y" style="height:${AL}px" aria-hidden="true">${ticks}</div>
    <div class="dia-main"><div class="dia-plot" style="height:${AL}px;justify-content:space-between;gap:${hueco}px">${lineas}${barras}</div><div class="dia-x km-x" aria-hidden="true" style="gap:${hueco}px">${etiquetas}</div></div></div>`;
}

// ─── FIRMA DEL ALUMNO (prueba de la clase, llega desde el móvil) ────────────
function celdaFirma(p) {
  if (p.enCurso || p.sinKm || p.sinCerrar) return '<span style="color:var(--text-faint)">—</span>';
  return p.firmada
    ? `<button type="button" class="pill pill-ok firma-pill" onclick="verClasePractica(${p.id})" title="Ver la firma y el detalle de la clase">${fichaSvg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 12)} Firmada</button>`
    : `<button type="button" class="pill pill-line firma-pill" onclick="verClasePractica(${p.id})" title="Ver el detalle de la clase">Sin firmar</button>`;
}

async function verClasePractica(id) {
  const p = await window.api.getPracticaDetalle(id);
  if (!p) return;
  let modal = document.getElementById('modal-clase');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'overlay'; modal.id = 'modal-clase';
    modal.innerHTML = '<div class="modal modal-ancho" role="dialog" aria-modal="true" aria-labelledby="clase-tit"><div id="clase-cuerpo"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-clase'); });
  }
  const fila = (etq, val) => `<div class="clase-dato"><span>${etq}</span><b>${val}</b></div>`;
  const dur = p.hora_inicio && p.hora_fin ? (() => { const m = t => t.split(':').map(Number).reduce((h, x) => h * 60 + x); return Math.max(1, m(p.hora_fin) - m(p.hora_inicio)); })() : null;
  document.getElementById('clase-cuerpo').innerHTML = `
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3 id="clase-tit" style="margin:0">Clase nº ${p.clase_n} · ${esc(p.alumno_nombre)}</h3>
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-clase')">Cerrar</button>
    </div>
    <div class="clase-grid">
      ${fila('Fecha', esc(fechaCorta(p.fecha).replace(/^./, c => c.toUpperCase())) + ' ' + p.fecha.slice(0, 4))}
      ${fila('Horario', `<span class="num-mono">${esc(p.hora_inicio || '—')}${p.hora_fin ? ' – ' + esc(p.hora_fin) : ''}</span>${dur ? ` <small>(${dur} min)</small>` : ''}`)}
      ${fila('Profesor', esc(p.profesor_nombre || '—'))}
      ${fila('Vehículo', p.matricula ? placaHTML(p.matricula) : esc(p.vehiculo_nombre || '—'))}
      ${fila('Km', p.km_final > 0 ? `<span class="num-mono">${fmtMiles(p.km_inicial)} → ${fmtMiles(p.km_final)}</span> · ${fmtMiles(p.km)} km` : '—')}
      ${fila('Tipo', p.tipo === 'pista' ? 'Pista' : 'Circulación')}
      ${p.zonas.length ? fila('Zonas recorridas', esc(p.zonas.join(' · '))) : ''}
      ${p.trabajado.length ? fila('Qué se trabajó', esc(p.trabajado.join(' · '))) : ''}
      ${p.nota ? fila('Observación', esc(p.nota)) : ''}
    </div>
    <div class="clase-firma-tit">Firma del alumno</div>
    ${p.firma
      ? `<div class="clase-firma"><img src="${p.firma}" alt="Firma de ${esc(p.alumno_nombre)}"></div>
         <p class="aj-intro" style="margin-top:8px">Firmada en el móvil al terminar la clase. Se guarda en la ficha del alumno y se imprime en la «Ficha de clases prácticas».</p>`
      : `<div class="alert alert-warn">Esta clase no tiene firma. ${p.origen === 'web-remote' ? 'El alumno puede firmarla más tarde desde el móvil (Historial → la clase → «Firmar ahora»).' : 'Se registró desde el ordenador; las firmas se recogen en el móvil al terminar cada clase.'}</div>`}`;
  openModal('modal-clase');
}

function pintarCalendarioFicha(f) {
  const cont = document.getElementById('ficha-dias');
  const hoy = hoyISO();
  const [hy, hm] = hoy.split('-').map(Number);
  const hechas = new Set(f.dias.hechas), prog = new Set(f.dias.programadas), exa = new Set(f.dias.examenes);
  const meses = [];
  for (let i = -2; i <= 1; i++) meses.push(new Date(hy, hm - 1 + i, 1));
  const nombreMes = d => { const t = d.toLocaleDateString('es-ES', { month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const mini = d => {
    const y = d.getFullYear(), m = d.getMonth();
    const primero = (new Date(y, m, 1).getDay() + 6) % 7;
    const ndias = new Date(y, m + 1, 0).getDate();
    let celdas = '';
    for (let i = 0; i < primero; i++) celdas += '<span></span>';
    for (let dia = 1; dia <= ndias; dia++) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      let cls = '';
      if (exa.has(iso)) cls = 'cal-examen'; else if (hechas.has(iso)) cls = 'cal-hecha'; else if (prog.has(iso)) cls = 'cal-prog';
      if (iso === hoy) cls += ' cal-hoy';
      celdas += `<span class="${cls}">${dia}</span>`;
    }
    return `<div class="cal-mes"><b>${nombreMes(d)}</b><div class="cal-sem"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="cal-dias">${celdas}</div></div>`;
  };
  const rango = `${MESES_CORTOS[meses[0].getMonth()]} – ${MESES_CORTOS[meses[3].getMonth()]} ${meses[3].getFullYear()}`;
  cont.innerHTML = `<div class="card-head"><h2>Días de práctica</h2><span class="card-note">${rango}</span></div>
    <div class="cal-grid">${meses.map(mini).join('')}</div>
    <div class="cal-leyenda"><span><i class="cal-l cal-hecha"></i>Práctica hecha</span><span><i class="cal-l cal-prog"></i>Programada</span><span><i class="cal-l cal-examen"></i>Examen práctico</span></div>`;
}

function pintarTrabajadoFicha(f) {
  const cont = document.getElementById('ficha-trabajado');
  if (!f.trabajado.length) { cont.style.display = 'none'; return; }
  cont.style.display = '';
  const n = f.practicasConTrabajado;
  cont.innerHTML = `<div class="card-head"><h2>Qué ha practicado</h2><span class="card-note">clases en las que salió</span></div>` +
    f.trabajado.map(t => `<div class="trab-fila"><span>${esc(t.nombre)}</span><span class="trab-barra"><i style="width:${Math.round((t.veces / n) * 100)}%"></i></span><b class="num-mono">${t.veces}/${n}</b></div>`).join('');
}

function pintarProximasFicha(f) {
  const cont = document.getElementById('ficha-proximas');
  const a = f.alumno;
  const filas = f.proximasClases.map(c => {
    const fp = parteFecha(c.fecha);
    return `<div class="prox-fila"><div class="prox-fecha"><small>${DIAS_CORTOS[fp.dow].toUpperCase()}</small><b>${fp.d}</b></div>
      <div><div class="prox-tit">${c.hora_inicio ? esc(c.hora_inicio) + ' · ' : ''}${esc(c.nota || 'Práctica')}</div><div class="prox-sub">${fp.d} de ${new Date(fp.y, fp.m - 1, 1).toLocaleDateString('es-ES', { month: 'long' })}${c.estado === 'solicitada' ? ' · solicitada' : ''}</div></div></div>`;
  }).join('');
  let examen = '';
  if (f.proximoExamen) {
    const fp = parteFecha(f.proximoExamen.fecha);
    examen = `<div class="prox-fila prox-examen"><div class="prox-fecha"><small>${DIAS_CORTOS[fp.dow].toUpperCase()}</small><b>${fp.d}</b></div>
      <div><div class="prox-tit">${fichaSvg('<path d="M6 21V4M6 4h11l-2.5 4 2.5 4H6"/>', 14)} Examen ${esc(TIPO_EXAMEN_TXT[f.proximoExamen.tipo] || f.proximoExamen.tipo).toLowerCase()}</div><div class="prox-sub">${fp.d} de ${new Date(fp.y, fp.m - 1, 1).toLocaleDateString('es-ES', { month: 'long' })}${f.proximoExamen.profesor ? ' · ' + esc(f.proximoExamen.profesor) : ''}</div></div></div>`;
  }
  let pie = '';
  if (f.proximoExamen && a.bono && a.bono.total > 0) {
    const antes = f.proximasClases.filter(c => c.fecha <= f.proximoExamen.fecha).length;
    const alExamen = a.num_practicas + antes;
    const quedan = Math.max(0, a.bono.total - a.bono.usadas - antes);
    pie = `<div class="prox-pie">Llegará al examen con ${alExamen} clases; le quedarán ${quedan} del bono.</div>`;
  }
  cont.innerHTML = `<div class="card-head"><h2>Próximas clases</h2><span class="card-note">${[a.profesor_nombre, a.vehiculo_matricula].filter(Boolean).map(esc).join(' · ')}</span></div>` +
    ((filas || examen) ? filas + examen + pie : '<div class="vacio-panel">No hay clases programadas.<small>Usa «Programar clase» para reservar la siguiente.</small></div>');
}

function pintarObservacionesFicha(f) {
  const cont = document.getElementById('ficha-obs');
  const filas = f.observaciones.map(o =>
    `<div class="obs-fila"><div class="obs-cuando"><b>${esc(fechaCorta(o.fecha).replace(/^./, c => c.toUpperCase()))}</b><small>Clase ${o.n}</small></div><div class="obs-texto">${esc(o.nota)}</div></div>`
  ).join('');
  cont.innerHTML = `<div class="card-head"><h2>Observaciones del profesor</h2><button type="button" class="btn btn-outline btn-sm" onclick="anadirObservacionFicha()">${fichaSvg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 14)}Añadir</button></div>` +
    (filas || '<div class="vacio-panel">Aún no hay observaciones.<small>Se guardan en la última clase del alumno.</small></div>');
}

async function anadirObservacionFicha() {
  if (!fichaCache || !fichaCache.practicas.length) { avisar('Este alumno aún no tiene ninguna práctica a la que asociar la observación.'); return; }
  const ultima = fichaCache.practicas[fichaCache.practicas.length - 1];
  const texto = await pedirTexto(`Observación para la clase ${ultima.n} (${fechaCorta(ultima.fecha)})`, { textoAceptar: 'Guardar' });
  if (texto == null || !String(texto).trim()) return;
  const previa = (ultima.nota || '').trim();
  await window.api.setNotaPractica(ultima.id, previa ? previa + ' ' + String(texto).trim() : String(texto).trim());
  loadPracticas();
}

async function loadPracticas() {
  if (!currentAlumnoId) return;
  const f = await window.api.getFichaAlumno(currentAlumnoId);
  if (!f) { volverAlumnos(); return; }
  fichaCache = f;
  currentAlumnoVehiculoId = f.alumno.vehiculo_id || null;
  pintarCabeceraFicha(f);
  // «Editar datos» desde la lista: se abre editando
  if (fdAbrirEditando) { fdAbrirEditando = false; editarDatosFicha(); } else pintarDatosFicha(f);
  pintarKmClase(f);
  pintarCalendarioFicha(f);
  pintarTrabajadoFicha(f);
  pintarProximasFicha(f);
  pintarObservacionesFicha(f);

  const practicas = f.practicas;
  document.getElementById('ficha-historial-nota').textContent = practicas.length
    ? `${practicas.length} ${practicas.length === 1 ? 'práctica' : 'prácticas'}` : '';
  const tbody = document.querySelector('#tabla-practicas tbody');
  if (!practicas.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">No hay prácticas registradas para este alumno</td></tr>';
    document.getElementById('dup-aviso')?.classList.add('hidden');
    return;
  }
  const guion = '<span style="color:var(--text-faint)">—</span>';
  // Con lo traído de otros programas separado: una línea marca dónde empiezan
  // las clases de cada procedencia (las de antes, traídas; las de después, de aquí)
  const separar = separarProcedencia() && practicas.some(p => p.procedencia);
  let procPrevia;
  tbody.innerHTML = practicas.slice().reverse().map(p => {
    let sep = '';
    if (separar && (p.procedencia || null) !== procPrevia) {
      procPrevia = p.procedencia || null;
      sep = `<tr class="fila-sep-proc${p.procedencia ? '' : ' fila-sep-app'}"><td colspan="9">${p.procedencia ? `${ICONO_PROC} Clases traídas de <b>${esc(p.procedencia)}</b>` : `Clases dadas con <b>${NOMBRE_APP_PROC}</b>`}</td></tr>`;
    }
    const kmCell = p.enCurso
      ? '<span class="pill pill-dark"><span class="pill-dot"></span>En curso</span>'
      : (p.sinCerrar ? `<span class="pill pill-warn" title="La práctica se abrió desde el móvil y no se cerró">Sin cerrar · km ${fmt(p.km_inicial)}</span>`
        : (p.sinKm ? '<span style="color:var(--warn-fg-soft);font-style:italic">Sin km</span>' : `${fmt(p.km_inicial)} → ${fmt(p.km_final)}`));
    const diffCell = p.enCurso || p.sinKm || p.sinCerrar ? guion : `<b>${fmtDec(p.km)}</b>`;
    return sep + `<tr${p.sinKm ? ' style="background:var(--warn-bg-soft)"' : ''}>
      <td class="num-mono">${p.n}</td>
      <td>${esc(p.fecha === hoyISO() ? 'Hoy, ' + diaMes(p.fecha) : fechaCorta(p.fecha).replace(/^./, c => c.toUpperCase()))}${p.tipo === 'pista' ? ' <span class="pill pill-line" style="font-size:11px;padding:1px 7px">Pista</span>' : ''}${p.fraccion > 0 && p.fraccion < 1 ? ` <span class="pill pill-line" style="font-size:11px;padding:1px 7px" title="Fracción de clase: se cobra en proporción">${fmtClases(p.fraccion)} clase</span>` : ''}${p.procedencia && !separar ? ' ' + etiquetaProcedencia(p.procedencia) : ''}</td>
      <td class="num-mono">${p.hora_inicio ? esc(p.hora_inicio) : guion}</td>
      <td>${p.matricula ? placaHTML(p.matricula) : (p.vehiculo_nombre ? esc(p.vehiculo_nombre) : guion)}</td>
      <td class="col-num num-mono">${kmCell}</td>
      <td class="col-num num-mono">${diffCell}</td>
      <td>${p.profesor_nombre ? esc(p.profesor_nombre) : guion}</td>
      <td>${celdaFirma(p)}</td>
      <td class="acciones-fila">
        <button class="btn btn-gray btn-sm btn-icon" title="Editar práctica" aria-label="Editar práctica" onclick="openEditPractica(${p.id})">${fichaSvg('<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>', 13)}</button>
        <button class="btn btn-gray btn-sm btn-icon btn-borrar" title="Borrar práctica" aria-label="Borrar práctica" onclick="deletePractica(${p.id})">${fichaSvg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>', 13)}</button>
      </td>
    </tr>`;
  }).join('');
  actualizarAvisoDuplicados();
  if (typeof comprobarTutorial === 'function') comprobarTutorial('ficha'); // primera vez que se abre una ficha
}

async function deletePractica(id) {
  if (!await confirmar('¿Borrar esta práctica?', { peligro: true, textoAceptar: 'Borrar' })) return;
  await window.api.deletePractica(id);
  loadPracticas();
}

// ─── DUPLICADOS ──────────────────────────────────────────────────────────────
let _dupGrupos = [];

async function actualizarAvisoDuplicados() {
  const aviso = document.getElementById('dup-aviso');
  if (!aviso || !currentAlumnoId) return;
  _dupGrupos = await window.api.getPracticasDuplicadas(currentAlumnoId);
  if (!_dupGrupos.length) { aviso.classList.add('hidden'); return; }
  const nSobrantes = _dupGrupos.reduce((s, g) => s + (g.practicas.length - 1), 0);
  document.getElementById('dup-aviso-texto').innerHTML =
    `⚠️ Este alumno tiene <strong>${_dupGrupos.length}</strong> grupo(s) de prácticas duplicadas (${nSobrantes} repetida(s) sobrante(s)).`;
  aviso.classList.remove('hidden');
}

function revisarDuplicados() {
  if (!_dupGrupos.length) return;
  const cont = document.getElementById('dup-lista');
  cont.innerHTML = _dupGrupos.map((g, gi) => {
    const filas = g.practicas.map((p, pi) => {
      const sinKm = p.km_inicial === 0 && p.km_final === 0;
      const km = sinKm ? 'Sin km' : `${fmt(p.km_inicial)} → ${fmt(p.km_final)}`;
      const extra = [p.hora_inicio, p.profesor_nombre, p.vehiculo_nombre].filter(Boolean).map(esc).join(' · ');
      const conserva = pi === 0;
      return `<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;cursor:pointer">
        <input type="checkbox" class="dup-chk" value="${p.id}" ${conserva ? '' : 'checked'}>
        <span>${fmtFecha(p.fecha)} — ${km}${extra ? ` <span style="color:var(--placeholder)">(${extra})</span>` : ''}${conserva ? ' <span style="color:#16a34a;font-weight:600">· se conserva</span>' : ''}</span>
      </label>`;
    }).join('');
    return `<div class="card" style="margin-bottom:10px;padding:10px 12px">
      <div style="font-weight:600;margin-bottom:6px">Grupo ${gi + 1}: ${fmtFecha(g.fecha)} · ${g.practicas.length} iguales</div>
      ${filas}
    </div>`;
  }).join('');
  openModal('modal-duplicados');
}

async function borrarDuplicadosSeleccionados() {
  const ids = Array.from(document.querySelectorAll('#dup-lista .dup-chk:checked')).map(c => parseInt(c.value));
  if (!ids.length) { alert('No has marcado ninguna práctica para borrar.'); return; }
  if (!await confirmar(`¿Borrar ${ids.length} práctica(s) duplicada(s)? Se sincroniza con la nube.`, { peligro: true, textoAceptar: 'Borrar' })) return;
  await window.api.eliminarPracticasDuplicadas(ids);
  closeModal('modal-duplicados');
  loadPracticas();
}

