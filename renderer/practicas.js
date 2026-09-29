// ─── PRÁCTICAS ───────────────────────────────────────────────────────────────
// Prácticas de kilómetros de un alumno: listado, generación de km y CRUD.

// ─── FICHA DEL ALUMNO ────────────────────────────────────────────────────────
// Detalle de un alumno: cabecera con métricas y progreso hasta el permiso,
// km por clase, historial de prácticas (con edición/borrado), calendario de
// días de práctica, lo trabajado, próximas clases y observaciones del profesor.
// Todo sale de db.getFichaAlumno (una llamada). currentAlumnoId marca el alumno abierto.
let fichaCache = null;

function verPracticas(alumnoId, vehiculoId, nombre) {
  currentAlumnoId = alumnoId;
  currentAlumnoVehiculoId = vehiculoId;
  document.getElementById('practicas-titulo').textContent = nombre;
  document.getElementById('view-alumnos').style.display = 'none';
  document.getElementById('view-practicas').style.display = 'block';
  document.getElementById('content').scrollTop = 0;
  loadPracticas();
}

function volverAlumnos() {
  currentAlumnoId = null;
  fichaCache = null;
  document.getElementById('view-alumnos').style.display = 'block';
  document.getElementById('view-practicas').style.display = 'none';
  loadAlumnos();
}

// El alta de una práctica vive en un modal (botón "Añadir práctica" de la ficha).
function abrirNuevaPractica() {
  if (!currentAlumnoId) return;
  document.getElementById('p-fecha').value = hoyISO();
  document.getElementById('p-ki').value = '';
  document.getElementById('p-kf').value = '';
  document.getElementById('p-hora-inicio').value = '';
  document.getElementById('km-preview').classList.add('hidden');
  aplicarRangoPref('p-min', 'p-max');
  openModal('modal-practica-nueva');
}

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

  const linea1 = [`Permiso ${esc(a.permiso)}`, a.fecha_alta ? 'Alta el ' + fmtFecha(a.fecha_alta) : '', a.profesor_nombre ? 'Profesor: ' + esc(a.profesor_nombre) : ''].filter(Boolean).join(' · ');
  const contacto = [
    a.telefono ? `<span class="ficha-dato">${fichaSvg('<path d="M5 3.5h3.5l2 5-2.5 1.5a11 11 0 0 0 6 6l1.5-2.5 5 2V19a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z"/>', 16)}${esc(a.telefono)}</span>` : '',
    a.email ? `<span class="ficha-dato">${fichaSvg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>', 16)}${esc(a.email)}</span>` : '',
    a.dni ? `<span class="ficha-dato">${fichaSvg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.6-2.3 3-2.3s2.5.8 3 2.3M15 10h3M15 13h3"/>', 16)}DNI ••••${esc(String(a.dni).slice(-4))}</span>` : '',
    a.vehiculo_matricula ? `<span class="ficha-dato">${placaHTML(a.vehiculo_matricula)}${esc(a.vehiculo_nombre || '')}</span>` : ''
  ].filter(Boolean).join('');

  const bono = a.bono && a.bono.total > 0
    ? `<div class="ficha-metrica"><dd>${a.bono.usadas} / ${a.bono.total}</dd><dt>Clases del bono</dt></div>`
    : `<div class="ficha-metrica"><dd>${m.clases}</dd><dt>${m.clases === 1 ? 'Clase' : 'Clases'}</dt></div>`;

  // Pasos del camino hasta el permiso
  const ex = f.proximoExamen;
  const pasos = [
    { tit: 'Matrícula', sub: a.fecha_alta ? fmtFecha(a.fecha_alta) : 'Alumno dado de alta', est: 'hecho' },
    { tit: 'Examen teórico', sub: idx >= 3 ? 'Aprobado' : (idx === 2 ? 'Apto teórico' : (idx === 1 ? 'En teórica' : 'Pendiente')), est: idx >= 2 ? 'hecho' : (idx === 1 ? 'actual' : 'pend') },
    { tit: 'Prácticas', sub: `${m.clases} ${m.clases === 1 ? 'clase' : 'clases'} · ${fmtMiles(m.km)} km`, est: idx >= 4 ? 'hecho' : (idx >= 2 ? 'actual' : 'pend') },
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
      <span class="avatar-ini avatar-ini-lg" aria-hidden="true">${esc(iniciales(nombreCompleto))}</span>
      <div class="ficha-quien">
        <h1>${esc(nombreCompleto)}${estado === 'baja' ? ' <span class="pill pill-err" style="vertical-align:middle">Baja</span>' : ''}</h1>
        <span class="ficha-linea">${linea1}</span>
        <div class="ficha-contacto">${contacto}</div>
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
  const barras = conKm.map((p, i) => {
    const ultima = i === conKm.length - 1;
    const tip = `${fechaCorta(p.fecha)} · ${p.km} km${p.fecha === hoy ? ' · hoy' : ''}`;
    return `<button type="button" class="dia-bar km-bar" aria-label="${esc(tip)}" style="padding:0;border:none;background:transparent;cursor:default">
      ${ultima ? `<span class="dia-hoy-lbl" style="bottom:${px(p.km) + 2}px">${p.km} km${p.fecha === hoy ? ' · hoy' : ''}</span>` : ''}
      <span class="${ultima ? 'dia-hoy' : 'dia-fill'}" style="height:${Math.max(px(p.km), 2)}px"></span>
      <span class="dia-tip" style="bottom:${px(p.km) + 26}px" role="tooltip">${esc(tip)}</span></button>`;
  }).join('');
  const etiquetas = conKm.map(p => `<span>${p.n}</span>`).join('');
  cont.innerHTML = `<div class="card-head" style="flex-direction:column;align-items:flex-start;gap:2px"><h2>Km por clase</h2><span class="card-note">${conKm.length} ${conKm.length === 1 ? 'clase' : 'clases'} · media de ${fmtDec(f.metricas.mediaKm)} km · pasa el ratón por una barra para ver la fecha</span></div>
    <div class="dia-chart" style="margin-top:10px"><div class="dia-y" style="height:${AL}px" aria-hidden="true">${ticks}</div>
    <div class="dia-main"><div class="dia-plot" style="height:${AL}px;justify-content:space-between">${lineas}${barras}</div><div class="dia-x km-x" aria-hidden="true">${etiquetas}</div></div></div>`;
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
  tbody.innerHTML = practicas.slice().reverse().map(p => {
    const kmCell = p.enCurso
      ? '<span class="pill pill-dark"><span class="pill-dot"></span>En curso</span>'
      : (p.sinCerrar ? `<span class="pill pill-warn" title="La práctica se abrió desde el móvil y no se cerró">Sin cerrar · km ${fmt(p.km_inicial)}</span>`
        : (p.sinKm ? '<span style="color:var(--warn-fg-soft);font-style:italic">Sin km</span>' : `${fmt(p.km_inicial)} → ${fmt(p.km_final)}`));
    const diffCell = p.enCurso || p.sinKm || p.sinCerrar ? guion : `<b>${fmtDec(p.km)}</b>`;
    const profesorIdArg = p.profesor_id != null ? p.profesor_id : 'null';
    const horaArg = p.hora_inicio ? `'${p.hora_inicio}'` : 'null';
    return `<tr${p.sinKm ? ' style="background:var(--warn-bg-soft)"' : ''}>
      <td class="num-mono">${p.n}</td>
      <td>${esc(p.fecha === hoyISO() ? 'Hoy, ' + diaMes(p.fecha) : fechaCorta(p.fecha).replace(/^./, c => c.toUpperCase()))}</td>
      <td class="num-mono">${p.hora_inicio ? esc(p.hora_inicio) : guion}</td>
      <td>${p.matricula ? placaHTML(p.matricula) : (p.vehiculo_nombre ? esc(p.vehiculo_nombre) : guion)}</td>
      <td class="col-num num-mono">${kmCell}</td>
      <td class="col-num num-mono">${diffCell}</td>
      <td>${p.profesor_nombre ? esc(p.profesor_nombre) : guion}</td>
      <td>${p.tipo === 'pista' ? 'Pista' : 'Circulación'}</td>
      <td class="acciones-fila">
        <button class="btn btn-gray btn-sm btn-icon" title="Editar práctica" aria-label="Editar práctica" onclick="openEditPractica(${p.id},'${p.fecha}',${p.km_inicial},${p.km_final},${profesorIdArg},'${p.tipo}',${horaArg})">${fichaSvg('<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>', 13)}</button>
        <button class="btn btn-gray btn-sm btn-icon btn-borrar" title="Borrar práctica" aria-label="Borrar práctica" onclick="deletePractica(${p.id})">${fichaSvg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>', 13)}</button>
      </td>
    </tr>`;
  }).join('');
  actualizarAvisoDuplicados();
}

async function generarKmPractica() {
  if (!currentAlumnoId) return;
  const min = parseFloat(document.getElementById('p-min').value) || 40;
  const max = parseFloat(document.getElementById('p-max').value) || 45;

  // Obtener km de partida: última práctica del alumno o km del vehículo
  let kmBase = 0;
  const ultima = await window.api.getUltimaPractica(currentAlumnoId);
  if (ultima) {
    kmBase = ultima.km_final;
  } else if (currentAlumnoVehiculoId) {
    const vehiculos = await window.api.getVehiculos();
    const v = vehiculos.find(x => x.id === currentAlumnoVehiculoId);
    if (v) kmBase = v.km_actual;
  }

  const result = await window.api.generarKm(kmBase, min, max);
  document.getElementById('p-ki').value = result.km_inicial;
  document.getElementById('p-kf').value = result.km_final;

  const preview = document.getElementById('km-preview');
  preview.textContent = `Generado: ${fmt(result.km_inicial)} → ${fmt(result.km_final)}  (+${result.diff} km)`;
  preview.classList.remove('hidden');
}

async function addPractica() {
  if (!currentAlumnoId) return;
  const fecha = document.getElementById('p-fecha').value;
  const kiRaw = document.getElementById('p-ki').value;
  const kfRaw = document.getElementById('p-kf').value;

  if (!fecha) { alert('Selecciona una fecha.'); return; }

  const vid = currentAlumnoVehiculoId;
  if (!vid) { alert('El alumno no tiene un vehículo asignado. Asígnale uno primero.'); return; }

  // Si los km están vacíos se guardan como 0,0 para rellenar luego
  let ki = parseFloat(kiRaw);
  let kf = parseFloat(kfRaw);
  const sinKm = isNaN(ki) || isNaN(kf);

  if (!sinKm && kf <= ki) { alert('El km final debe ser mayor que el km inicial.'); return; }

  if (sinKm) { ki = 0; kf = 0; }

  const tipo = document.getElementById('p-tipo')?.value || 'circulacion';
  const horaInicio = document.getElementById('p-hora-inicio')?.value || null;
  await window.api.addPractica(currentAlumnoId, vid, fecha, ki, kf, null, tipo, getSucursalActual(), horaInicio);
  document.getElementById('p-ki').value = '';
  document.getElementById('p-kf').value = '';
  document.getElementById('p-hora-inicio').value = '';
  document.getElementById('km-preview').classList.add('hidden');
  closeModal('modal-practica-nueva');
  loadPracticas();
}

async function deletePractica(id) {
  if (!await confirmar('¿Borrar esta práctica?', { peligro: true, textoAceptar: 'Borrar' })) return;
  await window.api.deletePractica(id);
  loadPracticas();
}

async function openEditPractica(id, fecha, ki, kf, profesorId, tipo, horaInicio) {
  document.getElementById('edit-p-id').value = id;
  document.getElementById('edit-p-fecha').value = fecha;
  document.getElementById('edit-p-ki').value = ki;
  document.getElementById('edit-p-kf').value = kf;
  document.getElementById('edit-p-tipo').value = tipo || 'circulacion';
  document.getElementById('edit-p-hora-inicio').value = horaInicio || '';
  await llenarSelectProfesores('edit-p-profesor', profesorId);
  openModal('modal-practica');
}

async function savePractica() {
  const id = parseInt(document.getElementById('edit-p-id').value);
  const fecha = document.getElementById('edit-p-fecha').value;
  const ki = parseFloat(document.getElementById('edit-p-ki').value);
  const kf = parseFloat(document.getElementById('edit-p-kf').value);
  const profesorId = document.getElementById('edit-p-profesor').value;
  const tipo = document.getElementById('edit-p-tipo').value || 'circulacion';
  const horaInicio = document.getElementById('edit-p-hora-inicio').value || null;
  if (!fecha || isNaN(ki) || isNaN(kf)) { alert('Rellena todos los campos.'); return; }
  if (kf <= ki) { alert('El km final debe ser mayor que el inicial.'); return; }

  // Validación cruzada: comprobar solapamiento con otras prácticas del mismo vehículo
  const vid = currentAlumnoVehiculoId;
  if (vid) {
    const conflictos = await window.api.validarSolapamiento(vid, fecha, ki, kf, id);
    if (conflictos.length) {
      const detalle = conflictos.map(c =>
        `• ${c.alumno} — ${fmtFecha(c.fecha)}: ${fmt(c.km_inicial)} → ${fmt(c.km_final)}`
      ).join('\n');
      const continuar = await confirmar(
        `Estos km se solapan con ${conflictos.length} práctica(s) del mismo vehículo:\n\n${detalle}\n\n¿Guardar igualmente?`
      );
      if (!continuar) return;
    }
  }

  await window.api.updatePractica(id, fecha, ki, kf, profesorId, tipo, horaInicio);
  closeModal('modal-practica');
  // Si venimos de la pestaña Conflictos (Kilómetros), recargar esa vista; si no, las prácticas del alumno
  const kilometrosPage = document.getElementById('page-kilometros');
  const conflictosTab = document.getElementById('tab-kilometros-conflictos');
  const practicasGlobalPage = document.getElementById('page-practicas-global');
  if (kilometrosPage && kilometrosPage.classList.contains('active') && conflictosTab && conflictosTab.classList.contains('active')) {
    loadSolapamientos();
  } else if (practicasGlobalPage && practicasGlobalPage.classList.contains('active')) {
    fetchPracticasGlobal();
  } else {
    loadPracticas();
  }
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

