// ─── PRÁCTICAS (VISTA GLOBAL) ─────────────────────────────────────────────────
// Listado de TODAS las prácticas de todos los alumnos juntas, con filtros por
// fecha/alumno/vehículo/profesor/tipo (resueltos en backend vía
// getTodasPracticas) y buscador de texto + orden de columnas en cliente sobre
// practicasGlobalCache (mismo patrón que deudasCache/renderDeudasTabla en pagos.js).
// No toca la vista de prácticas por alumno (renderer/practicas.js).

async function loadPracticasGlobal() {
  await Promise.all([poblarSelectsPracticasGlobal(), cargarProcedencias()]);
  await fetchPracticasGlobal();
  cuadreAvisoPracticas();
}

// Rellena los <select> de alumno/vehículo/profesor conservando la selección actual.
async function poblarSelectsPracticasGlobal() {
  const [alumnos, vehiculos, profesores] = await Promise.all([
    window.api.getAlumnos(getSucursalActual()), window.api.getVehiculos(getSucursalActual()), window.api.getProfesores(getSucursalActual())
  ]);

  const selAlumno = document.getElementById('pg-alumno');
  const selVehiculo = document.getElementById('pg-vehiculo');
  const selProfesor = document.getElementById('pg-profesor');
  if (selAlumno) {
    const actual = selAlumno.value;
    selAlumno.innerHTML = '<option value="">Todos los alumnos</option>' +
      opcionesAlumnosHTML(alumnos);
    if ([...selAlumno.options].some(o => o.value === actual)) selAlumno.value = actual;
  }
  if (selVehiculo) {
    const actual = selVehiculo.value;
    // Los coches retirados quedan aparte, al final: sus clases antiguas se pueden seguir filtrando
    const opcionCoche = v => `<option value="${v.id}">${esc(v.nombre)}${v.matricula ? ' (' + esc(v.matricula) + ')' : ''}</option>`;
    const enUso = [...vehiculos].filter(v => v.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const retirados = [...vehiculos].filter(v => v.activo === false).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    selVehiculo.innerHTML = '<option value="">Todos los vehículos</option>' + enUso.map(opcionCoche).join('') +
      (retirados.length ? `<optgroup label="Retirados">${retirados.map(opcionCoche).join('')}</optgroup>` : '');
    if ([...selVehiculo.options].some(o => o.value === actual)) selVehiculo.value = actual;
  }
  // Los permisos de los alumnos que hay (B, A2, CAP…), sin mezclar con los que nadie tiene
  const selPermiso = document.getElementById('pg-permiso');
  if (selPermiso) {
    const actual = selPermiso.value;
    const permisos = [...new Set(alumnos.map(a => a.permiso).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    selPermiso.innerHTML = '<option value="">Todos los permisos</option>' + permisos.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    if ([...selPermiso.options].some(o => o.value === actual)) selPermiso.value = actual;
  }
  if (selProfesor) {
    const actual = selProfesor.value;
    selProfesor.innerHTML = '<option value="">Todos los profesores</option>' +
      [...profesores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    if ([...selProfesor.options].some(o => o.value === actual)) selProfesor.value = actual;
  }
}

// Pide al backend las prácticas ya filtradas por fecha/alumno/vehículo/profesor/tipo
// (el buscador de texto y el orden de columnas se aplican después, en cliente).
async function fetchPracticasGlobal() {
  const filtros = {
    desde: document.getElementById('pg-desde')?.value || undefined,
    hasta: document.getElementById('pg-hasta')?.value || undefined,
    alumno_id: document.getElementById('pg-alumno')?.value || undefined,
    vehiculo_id: document.getElementById('pg-vehiculo')?.value || undefined,
    profesor_id: document.getElementById('pg-profesor')?.value || undefined,
    tipo: document.getElementById('pg-tipo')?.value || undefined,
    permiso: document.getElementById('pg-permiso')?.value || undefined,
    sucursal_id: getSucursalActual() || undefined,
  };
  practicasGlobalCache = await window.api.getTodasPracticas(filtros);
  renderPracticasGlobalTabla();
}

function limpiarFiltrosPracticasGlobal() {
  ['pg-desde', 'pg-hasta', 'pg-alumno', 'pg-vehiculo', 'pg-profesor', 'pg-permiso', 'pg-tipo', 'pg-buscar', 'pg-procedencia'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  pgReiniciarPaginas();
  fetchPracticasGlobal();
}

function ordenarPracticasGlobal(col) {
  if (practicasGlobalSort.col === col) {
    practicasGlobalSort.dir *= -1;
  } else {
    practicasGlobalSort.col = col;
    practicasGlobalSort.dir = 1;
  }
  pgReiniciarPaginas();
  renderPracticasGlobalTabla();
}

function actualizarIndicadoresOrdenPracticasGlobal() {
  document.querySelectorAll('#tabla-practicas-global thead th[data-sort]').forEach(th => {
    const ind = th.querySelector('.sort-ind');
    if (!ind) return;
    if (th.dataset.sort === practicasGlobalSort.col) {
      ind.innerHTML = practicasGlobalSort.dir === 1 ? SVG_SORT_ASC : SVG_SORT_DESC;
      th.classList.add('sort-active');
    } else {
      ind.innerHTML = '';
      th.classList.remove('sort-active');
    }
  });
}

// ── Pestañas (Todas / Hoy / Esta semana / Sin km / En curso), paginación y filas desplegables ──
let pgTab = 'todas';
let pgPagina = 1;
// Con lo traído de otros programas separado, cada grupo pagina por su cuenta
let pgPaginasGrupo = {};
const PG_TAM_PAGINA = 25;
function pgReiniciarPaginas() { pgPagina = 1; pgPaginasGrupo = {}; }
function irPaginaGrupoPG(clave, n) { pgPaginasGrupo[String(clave).toLowerCase()] = n; renderPracticasGlobalTabla(); }
const pgAbiertas = new Set();

function inicioSemanaISO() {
  const n = new Date();
  const lunes = new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7));
  return `${lunes.getFullYear()}-${String(lunes.getMonth() + 1).padStart(2, '0')}-${String(lunes.getDate()).padStart(2, '0')}`;
}
const PG_PREDICADOS = {
  todas: () => true,
  hoy: p => p.fecha === hoyISO(),
  semana: p => p.fecha >= inicioSemanaISO(),
  sinkm: p => p.sin_km && !p.en_curso,
  curso: p => p.en_curso || p.sin_cerrar
};

function cambiarTabPracticasGlobal(tab) {
  pgTab = tab;
  pgReiniciarPaginas();
  renderPracticasGlobalTabla();
}

function irPaginaPracticasGlobal(n) {
  pgPagina = n;
  renderPracticasGlobalTabla();
}

function togglePracticaGlobal(id) {
  if (pgAbiertas.has(id)) pgAbiertas.delete(id); else pgAbiertas.add(id);
  renderPracticasGlobalTabla();
}

async function editarPracticaGlobal(id) {
  const p = practicasGlobalCache.find(x => x.id === id);
  if (!p) return;
  await openEditPractica(p.id);
}

function verFichaDesdePracticas(alumnoId, vehiculoId, nombre) {
  navegarA('alumnos');
  setTimeout(() => verPracticas(alumnoId, vehiculoId, nombre), 60);
}

function detallePracticaGlobal(p) {
  let km;
  if (p.en_curso) km = '<span class="pill pill-dark"><span class="pill-dot"></span>En curso — el km final se fija al terminar</span>';
  else if (p.sin_cerrar) km = '<span class="pill pill-warn">Sin cerrar: falta el km final (empezó en el km ' + fmtMiles(p.km_inicial) + ')</span>';
  else if (p.sin_km) km = '<span class="pill pill-warn">Sin kilómetros: se rellenan en Kilómetros</span>';
  else {
    km = `<div class="num-mono" style="font-size:16px"><b>${fmtMiles(p.km_inicial)}</b> → <b>${fmtMiles(p.km_final)}</b> <span style="color:var(--text-muted);font-weight:400">· ${fmtDec(p.km_recorridos)} km</span></div>`;
    const c = p.continuidad;
    if (p.km_incoherente) {
      km += `<div class="cont-aviso">Los km de esta clase no encajan con los de alrededor (${esc(p.km_incoherente)}). <a href="#" onclick="cuadreIrA(${p.vehiculo_id});return false">Cuadrar km de este coche</a></div>`;
    } else if (c) {
      const cuando = `${esc(c.alumno)}${c.hora_inicio ? ', ' + esc(c.hora_inicio) : ''}`;
      if (c.diferencia === 0) km += `<div class="cont-ok">${svgMini('ficha').replace(SVG_MINI.ficha, '<path d="M5 12.5l4.5 4.5L19 7.5"/>')} Km inicial igual al final anterior (${cuando}).</div>`;
      else if (c.pequeno) km += `<div class="cont-suave">El coche hizo ${fmtMiles(c.diferencia)} km entre las dos clases (anterior: ${cuando}, km ${fmtMiles(c.km_final_anterior)}).</div>`;
      else if (c.companeros) km += `<div class="cont-suave">Hueco de ${fmtMiles(c.diferencia)} km: clases de compañeros que no están en la app (Cuadrar km → modo avanzado).</div>`;
      else if (c.diferencia > 0 && typeof kmOcultarHuecos === 'function' && kmOcultarHuecos()) { /* «Ocultar huecos»: sin aviso */ }
      else if (c.revisado) km += `<div class="cont-suave">Hueco de ${fmtMiles(c.diferencia)} km dado por revisado (otro uso del coche o clases fuera de la app). <a href="#" onclick="cuadreRevisarDesdeLista('${c.clave_hueco}', false);return false">Volver a avisar</a></div>`;
      else km += `<div class="cont-aviso">${c.diferencia > 0 ? `Hueco de ${fmtMiles(c.diferencia)} km` : `Se solapa ${fmtMiles(-c.diferencia)} km`} respecto al final anterior (${cuando}: ${fmtMiles(c.km_final_anterior)}). `
        + `<a href="#" onclick="cuadreIrA(${p.vehiculo_id});return false">Cuadrar km de este coche</a>${c.diferencia > 0 ? ` · <a href="#" onclick="cuadreRevisarDesdeLista('${c.clave_hueco}', true);return false">Dar por revisado</a>` : ` · <a href="#" onclick="cuadreIrA(${p.vehiculo_id}, ${p.id});return false">Encajar esta clase a continuación de la anterior</a>`}</div>`;
    }
  }
  return `<div class="pg-detalle">
    <div><div class="eyebrow">Kilometraje</div>${km}</div>
    <div><div class="eyebrow">Observación del profesor</div><div class="pg-obs">${p.nota ? esc(p.nota) : '<span style="color:var(--text-faint)">Sin observaciones</span>'}</div>
      ${p.zonas && p.zonas.length ? `<div class="eyebrow" style="margin-top:10px">Zonas recorridas</div><div>${esc(p.zonas.join(' · '))}</div>` : ''}</div>
    <div><div class="eyebrow">Firma del alumno</div>${p.en_curso || p.sin_km || p.sin_cerrar ? '<span style="color:var(--text-faint)">—</span>' : (p.firmada ? '<span class="pill pill-ok">Firmada</span>' : '<span class="pill pill-line">Sin firmar</span>')}</div>
    <div class="pg-detalle-acc">
      <button class="btn btn-outline btn-sm" onclick="verClasePractica(${p.id})">${svgMini('ficha')} Ver clase${p.firmada ? ' y firma' : ''}</button>
      <button class="btn btn-outline btn-sm" onclick="editarPracticaGlobal(${p.id})">${svgMini('editar')} Editar</button>
      <button class="btn btn-outline btn-sm" onclick="verFichaDesdePracticas(${p.alumno_id},${p.vehiculo_id || 'null'},'${esc(p.alumno_nombre)}')">${svgMini('ficha')} Ficha del alumno</button>
      ${p.vehiculo_id && !p.en_curso && !p.sin_cerrar && !p.sin_km ? `<button class="btn btn-outline btn-sm" onclick="cuadreIrA(${p.vehiculo_id}, ${p.id})" title="Esta clase empieza donde terminó la anterior del coche y las siguientes se recalculan con el baremo">${svgMini('editar')} Encajar km desde aquí</button>` : ''}
    </div>
  </div>`;
}

function renderPracticasGlobalTabla() {
  const tbody = document.querySelector('#tabla-practicas-global tbody');
  const buscarFiltro = (document.getElementById('pg-buscar')?.value || '').trim().toLowerCase();

  // Procedencia: traídas de otro programa o dadas con AulaMovil (renderer/procedencia.js)
  pintarFiltroProcedencia('pg-procedencia', practicasGlobalCache.map(p => p.procedencia));
  const procFiltro = document.getElementById('pg-procedencia')?.value || '';
  const base = practicasGlobalCache.filter(p => (!buscarFiltro || p.alumno_nombre.toLowerCase().includes(buscarFiltro)) && coincideProcedenciaUI(p.procedencia, procFiltro));
  document.querySelectorAll('#pg-tabs button').forEach(btn => {
    const t = btn.dataset.tab;
    const nombres = { todas: 'Todas', hoy: 'Hoy', semana: 'Esta semana', sinkm: 'Sin km', curso: 'En curso' };
    btn.innerHTML = `${nombres[t]} <span class="seg-n">· ${base.filter(PG_PREDICADOS[t]).length}</span>`;
    btn.setAttribute('aria-pressed', t === pgTab ? 'true' : 'false');
  });
  let filtradas = base.filter(PG_PREDICADOS[pgTab]);

  const { col, dir } = practicasGlobalSort;
  filtradas = [...filtradas].sort((a, b) => {
    if (col === 'km') return (a.km_recorridos - b.km_recorridos) * dir;
    if (col === 'fecha') return (a.fecha.localeCompare(b.fecha) || (a.hora_inicio || '').localeCompare(b.hora_inicio || '') || a.id - b.id) * dir;
    let va = '', vb = '';
    if (col === 'alumno') { va = a.alumno_nombre || ''; vb = b.alumno_nombre || ''; }
    else if (col === 'vehiculo') { va = a.vehiculo_nombre || ''; vb = b.vehiculo_nombre || ''; }
    else if (col === 'profesor') { va = a.profesor_nombre || ''; vb = b.profesor_nombre || ''; }
    else if (col === 'tipo') { va = a.tipo || ''; vb = b.tipo || ''; }
    return va.localeCompare(vb, 'es', { numeric: true }) * dir;
  });
  actualizarIndicadoresOrdenPracticasGlobal();

  // Resumen de la cabecera: rango de fechas, nº de prácticas, km y horas al volante (sobre lo filtrado)
  const kmTotales = filtradas.reduce((sum, p) => sum + p.km_recorridos, 0);
  const minutos = filtradas.filter(p => !p.en_curso).length * getDuracionClaseMin();
  const fechas = filtradas.map(p => p.fecha).sort();
  const rango = fechas.length ? (fechas[0] === fechas[fechas.length - 1] ? diaMes(fechas[0]) : `${diaMes(fechas[0])} – ${diaMes(fechas[fechas.length - 1])}`) : '';
  const resumen = document.getElementById('pg-resumen');
  if (resumen) resumen.textContent = filtradas.length
    ? [rango, `${fmtMiles(filtradas.length)} ${filtradas.length === 1 ? 'práctica' : 'prácticas'}`, `${fmtMiles(kmTotales)} km`, `${Math.round(minutos / 60)} h al volante`].filter(Boolean).join(' · ')
    : 'No hay prácticas con estos filtros';

  const pie = document.getElementById('pg-pie');
  if (!filtradas.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty">No hay prácticas que coincidan con los filtros</td></tr>';
    if (pie) pie.innerHTML = '';
    return;
  }

  // Separadas por procedencia (Ajustes → Datos de otros programas): un grupo
  // plegable por programa, cada uno con sus páginas
  if (separarProcedencia() && practicasGlobalCache.some(p => p.procedencia)) {
    let html = '';
    for (const g of gruposProcedencia(filtradas)) {
      if (!g.items.length) continue;
      html += cabeceraGrupoProcedencia('practicas', g, g.items.length, 10, ['clase', 'clases'], { femenino: true });
      if (grupoProcPlegado('practicas', g.clave)) continue;
      const k = String(g.clave).toLowerCase();
      const pags = Math.max(1, Math.ceil(g.items.length / PG_TAM_PAGINA));
      const pag = Math.min(pgPaginasGrupo[k] || 1, pags);
      html += g.items.slice((pag - 1) * PG_TAM_PAGINA, pag * PG_TAM_PAGINA).map(filaPracticaGlobalHTML).join('');
      if (pags > 1) {
        const arg = esc(String(g.clave).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
        const desde = (pag - 1) * PG_TAM_PAGINA + 1, hasta = Math.min(pag * PG_TAM_PAGINA, g.items.length);
        html += `<tr class="grupo-proc-pag"><td colspan="10"><span>${desde}–${hasta} de ${fmtMiles(g.items.length)}</span><span class="paginador"><button class="btn btn-outline btn-sm btn-icon" ${pag <= 1 ? 'disabled' : ''} onclick="irPaginaGrupoPG('${arg}', ${pag - 1})" aria-label="Página anterior">‹</button> Página ${pag} de ${pags} <button class="btn btn-outline btn-sm btn-icon" ${pag >= pags ? 'disabled' : ''} onclick="irPaginaGrupoPG('${arg}', ${pag + 1})" aria-label="Página siguiente">›</button></span></td></tr>`;
      }
    }
    tbody.innerHTML = html;
    if (pie) pie.innerHTML = `<span>${fmtMiles(filtradas.length)} ${filtradas.length === 1 ? 'práctica' : 'prácticas'}, separadas por procedencia</span><span>Ajustes → Datos de otros programas</span>`;
    return;
  }

  const paginas = Math.max(1, Math.ceil(filtradas.length / PG_TAM_PAGINA));
  if (pgPagina > paginas) pgPagina = paginas;
  const visibles = filtradas.slice((pgPagina - 1) * PG_TAM_PAGINA, pgPagina * PG_TAM_PAGINA);
  tbody.innerHTML = visibles.map(filaPracticaGlobalHTML).join('');

  if (pie) {
    const desde = (pgPagina - 1) * PG_TAM_PAGINA + 1, hasta = desde + visibles.length - 1;
    pie.innerHTML = `<span>Mostrando ${desde}–${hasta} de ${filtradas.length} ${filtradas.length === 1 ? 'práctica' : 'prácticas'}</span>` +
      (paginas > 1 ? `<span class="paginador"><button class="btn btn-outline btn-sm btn-icon" ${pgPagina <= 1 ? 'disabled' : ''} onclick="irPaginaPracticasGlobal(${pgPagina - 1})" aria-label="Página anterior">‹</button> Página ${pgPagina} de ${paginas} <button class="btn btn-outline btn-sm btn-icon" ${pgPagina >= paginas ? 'disabled' : ''} onclick="irPaginaPracticasGlobal(${pgPagina + 1})" aria-label="Página siguiente">›</button></span>` : '');
  }
}

// Una clase de la lista (y su detalle desplegado si está abierta)
function filaPracticaGlobalHTML(p) {
  const guion = '<span style="color:var(--text-faint)">—</span>';
  const chev = abierta => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${abierta ? '<path d="m6 15 6-6 6 6"/>' : '<path d="m6 9 6 6 6-6"/>'}</svg>`;
  const abierta = pgAbiertas.has(p.id);
  const fechaTxt = p.fecha === hoyISO() ? 'Hoy' : fechaCorta(p.fecha).replace(/^./, c => c.toUpperCase());
  // Una clase de pista sin km no tiene que tenerlos: guion, no «Sin km»
  const kmIni = p.sin_km_pista ? guion : (p.en_curso || p.sin_cerrar || !p.sin_km ? fmtMiles(p.km_inicial) : '<span style="color:var(--warn-fg-soft);font-style:italic">Sin km</span>');
  const kmFin = p.en_curso || p.sin_km_pista ? guion : (p.sin_cerrar ? '<span style="color:var(--warn-fg-soft);font-style:italic">Sin cerrar</span>' : (p.sin_km ? '<span style="color:var(--warn-fg-soft);font-style:italic">Sin km</span>' : fmtMiles(p.km_final)));
  const kmRec = p.en_curso ? '<span class="pill pill-dark"><span class="pill-dot"></span>En curso</span>' : (p.sin_km || p.sin_km_pista || p.sin_cerrar ? guion : `<b>${fmtDec(p.km_recorridos)}</b>`);
  const c = p.continuidad;
  let aviso = '';
  if (p.km_incoherente) aviso = `<div class="pg-hueco" title="${esc(p.km_incoherente)}">km que no encajan</div>`;
  else if (c && c.diferencia !== 0) {
    if (c.diferencia > 0 && (c.pequeno || c.revisado || c.companeros)) aviso = `<div class="pg-hueco pg-hueco-suave" title="${c.companeros ? 'Clases de compañeros que no están en la app' : c.revisado ? 'Hueco dado por revisado' : 'El coche hizo estos km entre las dos clases'}">+${fmtMiles(c.diferencia)} km${c.companeros ? ' · compañeros' : c.revisado ? ' · revisado' : ''}</div>`;
    else aviso = `<div class="pg-hueco" title="Respecto al final de la práctica anterior de este coche">${c.diferencia > 0 ? '+' + fmtMiles(c.diferencia) + ' km sin asignar' : 'solapa ' + fmtMiles(-c.diferencia) + ' km'}</div>`;
  }
  return `<tr class="fila-pg${abierta ? ' abierta' : ''}" onclick="togglePracticaGlobal(${p.id})"${p.sin_km && !p.en_curso ? ' style="background:var(--warn-bg-soft)"' : ''}>
    <td>${esc(fechaTxt)}<div class="al-sub">${fmtFecha(p.fecha)}</div></td>
    <td class="num-mono">${p.hora_inicio ? esc(p.hora_inicio) : guion}</td>
    <td><b>${esc(p.alumno_nombre)}</b>${p.clase_n || p.procedencia ? `<div class="al-sub">${p.clase_n ? 'Clase ' + p.clase_n : ''}${etiquetaProcedencia(p.procedencia)}</div>` : ''}</td>
    <td>${esc(p.profesor_nombre)}</td>
    <td>${p.vehiculo_matricula ? placaHTML(p.vehiculo_matricula) : esc(p.vehiculo_nombre)}</td>
    <td class="col-num num-mono">${kmIni}${aviso}</td>
    <td class="col-num num-mono">${kmFin}</td>
    <td class="col-num num-mono">${kmRec}</td>
    <td>${p.tipo === 'pista' ? 'Pista' : 'Circulación'}</td>
    <td class="pg-chev">${chev(abierta)}</td>
  </tr>${abierta ? `<tr class="fila-detalle"><td colspan="10">${detallePracticaGlobal(p)}</td></tr>` : ''}`;
}

// Dar por revisado (o volver a avisar) un hueco desde el detalle de una clase
async function cuadreRevisarDesdeLista(clave, revisado) {
  await window.api.marcarHuecoKmRevisado(clave, revisado);
  await fetchPracticasGlobal();
  cuadreAvisoPracticas();
}
