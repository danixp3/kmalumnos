// ─── PROCEDENCIA (datos traídos de otro programa) ────────────────────────────
// Lo que entra desde «Traer de otro programa» o desde Ariauto lleva el nombre
// del programa en `procedencia` (db/procedencia.js); lo creado aquí, nada.
// Aquí: la etiqueta que se ve junto al nombre, el filtro «Procedencia», los
// grupos plegables («Creados en AulaMovil» / «Traídos de Ariauto») de Alumnos y
// Prácticas, y Ajustes → Datos de otros programas (separar sí/no, renombrar o
// quitar la etiqueta). Separar y lo plegado se recuerdan en este PC.

const NOMBRE_APP_PROC = 'AulaMovil';
const PROC_SEPARAR_KEY = 'km_separar_procedencia';
const PROC_PLEGADOS_KEY = 'km_procedencia_plegados';
const PROC_APP = '__app';      // clave del grupo «creados aquí»
const PROC_OTROS = '__otros';  // filtro «traídos de cualquier programa»
let procedenciasInfo = null;   // getProcedencias(): fechas y recuentos por programa

const ICONO_PROC = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v10M7.5 9.5 12 14l4.5-4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>';

function separarProcedencia() {
  try { return localStorage.getItem(PROC_SEPARAR_KEY) !== '0'; } catch (e) { return true; }
}

const mismaProc = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// '' todo · '__app' creados aquí · '__otros' traídos de cualquier programa · nombre = ese programa
function coincideProcedenciaUI(valor, filtro) {
  if (!filtro) return true;
  if (filtro === PROC_APP) return !valor;
  if (filtro === PROC_OTROS) return !!valor;
  return mismaProc(valor, filtro);
}

// Etiqueta junto al nombre. Vacía si es de aquí (lo normal no se marca).
function etiquetaProcedencia(valor, { larga = false } = {}) {
  if (!valor) return '';
  return `<span class="tag-proc" title="Traído de ${esc(valor)} (programa anterior)">${ICONO_PROC}${larga ? 'Traído de ' : ''}${esc(valor)}</span>`;
}

// Fecha en que se trajeron los datos de un programa (registro compartido)
function fechaProcedencia(nombre) {
  const p = procedenciasInfo && (procedenciasInfo.programas || []).find(x => mismaProc(x.nombre, nombre));
  return p && p.desde ? p.desde : null;
}

async function cargarProcedencias() {
  try { procedenciasInfo = await window.api.getProcedencias(); } catch (e) { procedenciasInfo = procedenciasInfo || { app: {}, programas: [] }; }
  return procedenciasInfo;
}

/**
 * <option> del filtro «Procedencia» con los programas que aparecen en `valores`.
 * `corto`: textos breves para los desplegables con su etiqueta delante
 * («Procedencia [Cualquiera ▾]»).
 */
function opcionesFiltroProcedencia(valores, actual, { corto = false } = {}) {
  const programas = [];
  for (const v of valores) if (v && !programas.some(x => mismaProc(x, v))) programas.push(v);
  programas.sort((a, b) => a.localeCompare(b, 'es'));
  const op = (v, t) => `<option value="${esc(v)}"${String(actual || '') === v ? ' selected' : ''}>${esc(t)}</option>`;
  return op('', corto ? 'Cualquiera' : 'Cualquier procedencia') + op(PROC_APP, corto ? NOMBRE_APP_PROC : `Creados en ${NOMBRE_APP_PROC}`) +
    (programas.length > 1 ? op(PROC_OTROS, corto ? 'Traídos (todos)' : 'Traídos de otro programa') : '') +
    programas.map(p => op(p, corto ? p : `Traídos de ${p}`)).join('');
}

// Muestra el filtro solo si hay algo traído de otro programa (si no, estorba)
function pintarFiltroProcedencia(selId, valores) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const hay = valores.some(Boolean);
  const actual = sel.value;
  sel.innerHTML = opcionesFiltroProcedencia(valores, actual, { corto: !!sel.closest('.filtro-inline') });
  if ([...sel.options].some(o => o.value === actual)) sel.value = actual; else sel.value = '';
  // En la línea de filtros va dentro de su etiqueta («Procedencia ▾»): se oculta entera
  const caja = sel.closest('.filtro-inline') || sel;
  caja.hidden = !hay && !sel.value;
}

/**
 * Reparte `items` por procedencia: primero lo creado aquí y después cada
 * programa (por la fecha en que se trajo). [{ clave, nombre, items }]
 */
function gruposProcedencia(items, valorDe = x => x.procedencia) {
  const app = { clave: PROC_APP, nombre: NOMBRE_APP_PROC, items: [] };
  const otros = new Map();
  for (const it of items) {
    const v = valorDe(it);
    if (!v) { app.items.push(it); continue; }
    const k = String(v).toLowerCase();
    if (!otros.has(k)) otros.set(k, { clave: v, nombre: v, items: [] });
    otros.get(k).items.push(it);
  }
  const fecha = g => (typeof fechaProcedencia === 'function' && fechaProcedencia(g.nombre)) || '9999';
  return [app, ...[...otros.values()].sort((a, b) => fecha(a).localeCompare(fecha(b)) || a.nombre.localeCompare(b.nombre, 'es'))];
}

// ── Grupos plegables (se recuerda qué está cerrado, por pantalla) ──
function _procPlegados() {
  try { const v = JSON.parse(localStorage.getItem(PROC_PLEGADOS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}
function grupoProcPlegado(pantalla, clave) {
  return (_procPlegados()[pantalla] || []).some(k => mismaProc(k, clave));
}
// Repintar la pantalla al abrir/cerrar un grupo
const PROC_REPINTAR = {
  alumnos: () => renderAlumnosTabla(),
  practicas: () => renderPracticasGlobalTabla()
};
function plegarGrupoProcedencia(pantalla, clave) {
  const todos = _procPlegados();
  const lista = todos[pantalla] || [];
  todos[pantalla] = lista.some(k => mismaProc(k, clave)) ? lista.filter(k => !mismaProc(k, clave)) : [...lista, clave];
  try { localStorage.setItem(PROC_PLEGADOS_KEY, JSON.stringify(todos)); } catch (e) { /* sin almacenamiento: solo esta vez */ }
  if (PROC_REPINTAR[pantalla]) PROC_REPINTAR[pantalla]();
}

/**
 * Fila de cabecera de un grupo dentro de una tabla: «▾ Traídos de Ariauto ·
 * 2.800 alumnos · traídos el 08/10/2026». Pulsar abre o cierra el grupo.
 */
function cabeceraGrupoProcedencia(pantalla, grupo, n, colspan, [uno, varios] = ['registro', 'registros'], { femenino = false } = {}) {
  const plegado = grupoProcPlegado(pantalla, grupo.clave);
  const deAqui = grupo.clave === PROC_APP;
  const fecha = deAqui ? null : fechaProcedencia(grupo.nombre);
  const o = femenino ? 'a' : 'o';
  const titulo = deAqui ? `Cread${o}s en ${NOMBRE_APP_PROC}` : `Traíd${o}s de ${esc(grupo.nombre)}`;
  const chev = `<svg class="grupo-proc-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
  const claveJs = esc(String(grupo.clave).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  return `<tr class="grupo-proc${deAqui ? ' grupo-proc-app' : ''}${plegado ? ' plegado' : ''}"><td colspan="${colspan}">
    <button type="button" class="grupo-proc-btn" aria-expanded="${!plegado}" onclick="plegarGrupoProcedencia('${pantalla}', '${claveJs}')" title="${plegado ? 'Abrir' : 'Cerrar'} este grupo">
      ${chev}${deAqui ? '' : ICONO_PROC}<b>${titulo}</b><span class="grupo-proc-n">${fmtMiles(n)} ${n === 1 ? uno : varios}</span>${fecha ? `<span class="grupo-proc-fecha">traíd${o}s el ${esc(fmtFecha(fecha))}</span>` : ''}
    </button></td></tr>`;
}

// ── Ajustes → Datos de otros programas ──
const PROC_NOMBRES = {
  alumnos: ['alumno', 'alumnos'], practicas: ['clase', 'clases'], profesores: ['profesor', 'profesores'], vehiculos: ['coche', 'coches'],
  presentaciones: ['examen', 'exámenes'], pagos: ['pago', 'pagos'], cargos: ['cargo', 'cargos'], tasas: ['tasa', 'tasas'], vencimientos: ['caducidad', 'caducidades']
};
const procCuenta = (n, t) => `${fmtMiles(n)} ${n === 1 ? PROC_NOMBRES[t][0] : PROC_NOMBRES[t][1]}`;

async function estadoProcedenciaAjustes() {
  const info = await cargarProcedencias();
  const n = (info.programas || []).length;
  if (!n) return 'Todavía no has traído datos de otro programa';
  return `${n === 1 ? info.programas[0].nombre : n + ' programas'} · ${separarProcedencia() ? 'separados' : 'mezclados'} en las listas`;
}

async function renderProcedenciaUI() {
  const cont = document.getElementById('proc-ajustes');
  if (!cont) return;
  const chk = document.getElementById('proc-separar');
  if (chk) chk.checked = separarProcedencia();
  const info = await cargarProcedencias();
  const progs = info.programas || [];
  const resumen = (cuenta) => Object.keys(PROC_NOMBRES).filter(t => cuenta[t]).map(t => procCuenta(cuenta[t], t)).join(' · ');
  const app = info.app || {};
  const filaApp = `<div class="proc-fila proc-fila-app"><div class="proc-fila-txt"><b>Creados en ${NOMBRE_APP_PROC}</b>
      <small>${resumen(app) || 'Nada todavía'}</small></div></div>`;
  if (!progs.length) {
    cont.innerHTML = filaApp + `<div class="vacio-panel" style="margin-top:12px">Todavía no has traído datos de otro programa.
      <small>Cuando lo hagas desde «Traer de otro programa», todo lo que llegue (alumnos, clases, exámenes, pagos…) quedará marcado con el nombre de ese programa.</small>
      <button type="button" class="btn btn-outline btn-sm" style="margin-top:10px" onclick="navegarA('migracion')">Traer de otro programa</button></div>`;
    return;
  }
  const arg = n => esc(String(n).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  cont.innerHTML = filaApp + progs.map(p => `<div class="proc-fila">
      <div class="proc-fila-txt"><b>${etiquetaProcedencia(p.nombre)}</b>${p.desde ? `<span class="proc-fecha">traídos el ${esc(fmtFecha(p.desde))}${p.ultima && p.ultima !== p.desde ? ` (último, ${esc(fmtFecha(p.ultima))})` : ''}</span>` : ''}
        <small>${resumen(p.cuenta)}</small></div>
      <div class="proc-fila-acc">
        ${p.cuenta.alumnos ? `<button type="button" class="btn btn-outline btn-sm" onclick="verAlumnosDeProcedencia('${arg(p.nombre)}')">Ver sus alumnos</button>` : ''}
        <button type="button" class="btn btn-gray btn-sm" onclick="renombrarProcedenciaUI('${arg(p.nombre)}')">Cambiar nombre</button>
        <button type="button" class="btn btn-gray btn-sm" onclick="quitarProcedenciaUI('${arg(p.nombre)}')" title="Pasan a contar como creados en ${NOMBRE_APP_PROC}. No se borra nada.">Quitar la etiqueta</button>
      </div></div>`).join('');
}

function cambiarSepararProcedencia(on) {
  try { localStorage.setItem(PROC_SEPARAR_KEY, on ? '1' : '0'); } catch (e) { /* sin almacenamiento: solo esta vez */ }
  showToast('proc-toast', on
    ? 'Listo: en Alumnos y Prácticas lo traído de otros programas sale aparte, en grupos que se abren y cierran.'
    : 'Listo: lo traído de otros programas sale mezclado con lo demás (sigue llevando su etiqueta y el filtro «Procedencia»).', 'ok');
}

async function renombrarProcedenciaUI(nombre) {
  const nuevo = await pedirTexto(`Nuevo nombre para «${nombre}» (por ejemplo, el nombre del programa que usabais):`, { titulo: 'Cambiar nombre', valor: nombre, textoAceptar: 'Cambiar' });
  if (nuevo == null) return;
  const limpio = String(nuevo).replace(/\s+/g, ' ').trim();
  if (!limpio || limpio === nombre) return;
  if (/^(aulamovil|aula movil)$/i.test(limpio)) { showToast('proc-toast', `Para que cuenten como creados en ${NOMBRE_APP_PROC} usa «Quitar la etiqueta».`, 'warn'); return; }
  const r = await window.api.renombrarProcedencia(nombre, limpio);
  if (!r || !r.ok) { showToast('proc-toast', (r && r.error) || 'No se pudo cambiar el nombre.', 'err'); return; }
  showToast('proc-toast', `«${nombre}» ahora se llama «${limpio}» (${fmtMiles(r.total)} registros).`, 'ok');
  renderProcedenciaUI();
}

async function quitarProcedenciaUI(nombre) {
  const ok = await confirmar(`Todo lo traído de «${nombre}» dejará de llevar su etiqueta y contará como creado en ${NOMBRE_APP_PROC}: ya no saldrá aparte ni se podrá filtrar como «traído».\n\nNo se borra nada: alumnos, clases y demás se quedan como están.`, { titulo: 'Quitar la etiqueta', textoAceptar: 'Quitar la etiqueta' });
  if (!ok) return;
  const r = await window.api.renombrarProcedencia(nombre, '');
  if (!r || !r.ok) { showToast('proc-toast', (r && r.error) || 'No se pudo quitar la etiqueta.', 'err'); return; }
  showToast('proc-toast', `Quitada la etiqueta «${nombre}» de ${fmtMiles(r.total)} registros.`, 'ok');
  renderProcedenciaUI();
}

// Desde Ajustes: la lista de alumnos con el filtro de ese programa (en «Todos»)
function verAlumnosDeProcedencia(nombre) {
  navegarA('alumnos');
  setTimeout(() => {
    const sel = document.getElementById('f-alumnos-procedencia');
    if (sel) {
      if (![...sel.options].some(o => o.value === nombre)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(nombre)}">Traídos de ${esc(nombre)}</option>`);
      sel.hidden = false;
      sel.value = nombre;
    }
    if (typeof cambiarTabAlumnos === 'function') cambiarTabAlumnos('todos'); else renderAlumnosTabla();
  }, 80);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { coincideProcedenciaUI, gruposProcedencia, opcionesFiltroProcedencia, PROC_APP, PROC_OTROS };
}
