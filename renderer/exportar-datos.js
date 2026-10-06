// ─── EXPORTAR TODOS LOS DATOS ────────────────────────────────────────────────
// Pestaña «Exportar» de Importar y exportar: se eligen los tipos de datos
// (alumnos, clases, profesores, coches, pagos, exámenes, jornada…), las fechas
// y el formato (Excel con una hoja por tipo, CSV o copia completa en JSON).
// También «Exportar sus datos» desde la ficha de un alumno (derecho de acceso).
// Datos: db/exportar.js (catalogoExportacion, datosExportacion) → IPC
// exportar-datos (main.js escribe el archivo y lo anota en el historial).

const EXP_GRUPOS = [
  { titulo: 'Personas y coches', claves: ['alumnos', 'profesores', 'vehiculos', 'interesados'] },
  { titulo: 'Clases y agenda', claves: ['practicas', 'reservas', 'examenes', 'tasas'] },
  { titulo: 'Dinero', claves: ['pagos', 'cargos', 'tarifas', 'bonos'] },
  { titulo: 'Centro', claves: ['jornadas', 'vencimientos', 'sucursales', 'historial'] }
];
const EXP_ELEGIDOS_KEY = 'km_exportar_elegidos';
let expCatalogo = [];

async function loadExportarDatos() {
  const cont = document.getElementById('exp-conjuntos');
  if (!cont) return;
  try { expCatalogo = await window.api.catalogoExportacion(); } catch (e) { expCatalogo = []; }
  let elegidos = null;
  try { elegidos = JSON.parse(localStorage.getItem(EXP_ELEGIDOS_KEY) || 'null'); } catch (e) { elegidos = null; }
  const porClave = new Map(expCatalogo.map(c => [c.clave, c]));
  cont.innerHTML = EXP_GRUPOS.map(g => `<fieldset class="exp-grupo"><legend>${g.titulo}</legend>${g.claves.map(k => {
    const c = porClave.get(k);
    if (!c) return '';
    const marcado = elegidos ? elegidos.includes(k) : c.total > 0;
    return `<label class="exp-op${c.total ? '' : ' exp-vacio'}"><input type="checkbox" value="${k}"${marcado ? ' checked' : ''} onchange="expGuardarElegidos()">
      <span>${esc(c.titulo)}</span><small class="num-mono">${fmtMiles(c.total)}</small></label>`;
  }).join('')}</fieldset>`).join('');
  expPintarFormato();
}

function expElegidos() {
  return [...document.querySelectorAll('#exp-conjuntos input:checked')].map(x => x.value);
}
function expGuardarElegidos() {
  try { localStorage.setItem(EXP_ELEGIDOS_KEY, JSON.stringify(expElegidos())); } catch (e) { /* sin almacenamiento */ }
  expPintarResumen();
}
function expMarcarTodos(si) {
  // «Todo» = todo lo que tiene datos; «Nada» = ninguno
  document.querySelectorAll('#exp-conjuntos input').forEach(x => { x.checked = si && !x.closest('.exp-vacio'); });
  expGuardarElegidos();
}

function expFormato() {
  const el = document.querySelector('input[name="exp-formato"]:checked');
  return el ? el.value : 'xlsx';
}
function expPintarFormato() {
  const json = expFormato() === 'json';
  // La copia JSON lleva siempre todo (es para guardar o pasar a otro programa)
  document.getElementById('exp-conjuntos').classList.toggle('exp-desactivado', json);
  document.getElementById('exp-fechas').classList.toggle('exp-desactivado', json);
  document.getElementById('exp-firmas-wrap').hidden = !json;
  expPintarResumen();
}
function expPintarResumen() {
  const el = document.getElementById('exp-resumen');
  if (!el) return;
  if (expFormato() === 'json') { el.textContent = 'Copia completa: todas las tablas tal cual, para guardarla o pasarla a otro programa.'; return; }
  const sel = new Set(expElegidos());
  const total = expCatalogo.filter(c => sel.has(c.clave)).reduce((n, c) => n + c.total, 0);
  const desde = document.getElementById('exp-desde').value, hasta = document.getElementById('exp-hasta').value;
  el.textContent = sel.size
    ? `${sel.size} ${sel.size === 1 ? 'tabla' : 'tablas'} · hasta ${fmtMiles(total)} filas${desde || hasta ? ' (las fechas acotan clases, pagos, exámenes, jornada…)' : ''}`
    : 'Elige al menos un tipo de datos.';
}

async function exportarDatosUI() {
  const formato = expFormato();
  const conjuntos = expElegidos();
  const res = document.getElementById('exp-resultado');
  if (formato !== 'json' && !conjuntos.length) { showToast('exp-resultado', 'Elige al menos un tipo de datos.', 'warn'); return; }
  const desde = document.getElementById('exp-desde').value || null;
  const hasta = document.getElementById('exp-hasta').value || null;
  if (desde && hasta && desde > hasta) { showToast('exp-resultado', 'La fecha «desde» es posterior a «hasta».', 'warn'); return; }
  const btn = document.getElementById('exp-boton');
  btn.disabled = true;
  try {
    const r = await window.api.exportarDatos({ formato, conjuntos, desde, hasta, sucursalId: typeof getSucursalActual === 'function' ? getSucursalActual() : null, conFirmas: document.getElementById('exp-firmas').checked });
    if (r.canceled) { res.classList.add('hidden'); return; }
    if (!r.ok) { res.className = 'alert alert-err'; res.textContent = r.msg || 'No se pudo exportar.'; res.classList.remove('hidden'); return; }
    res.className = 'alert alert-ok';
    const que = formato === 'csv' ? `${r.tablas} archivos CSV en la carpeta` : formato === 'json' ? 'Copia guardada en' : `${r.tablas} ${r.tablas === 1 ? 'hoja' : 'hojas'} de Excel en`;
    res.innerHTML = `Exportado: ${fmtMiles(r.total)} filas. ${que} <b>${esc(r.path)}</b> <button type="button" class="btn btn-sm btn-outline" style="margin-left:8px" onclick="window.api.mostrarExportado(${esc(JSON.stringify(r.path))})">Ver en la carpeta</button>`;
    res.classList.remove('hidden');
  } catch (e) {
    res.className = 'alert alert-err'; res.textContent = 'Error: ' + (e.message || e); res.classList.remove('hidden');
  } finally { btn.disabled = false; }
}

function nombreAlumnoFicha() {
  const a = typeof fichaCache !== 'undefined' && fichaCache ? fichaCache.alumno : null;
  return a ? [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ') : 'alumno';
}
function exportarDatosAlumnoActual() {
  if (typeof currentAlumnoId === 'undefined' || !currentAlumnoId) return;
  exportarDatosAlumnoUI(currentAlumnoId, nombreAlumnoFicha());
}

// Ficha del alumno → «Exportar sus datos» (lo que pide un alumno al ejercer su
// derecho de acceso o portabilidad): Excel con todo lo suyo o JSON.
async function exportarDatosAlumnoUI(alumnoId, nombre) {
  const formato = await elegirFormatoExportacionAlumno(nombre);
  if (!formato) return;
  const r = await window.api.exportarDatos({ formato, alumnoId, nombreBase: `datos_${nombre || 'alumno'}` });
  if (r.canceled) return;
  if (!r.ok) { await avisar(r.msg || 'No se pudo exportar.'); return; }
  if (await confirmar(`Datos de ${nombre} guardados (${fmtMiles(r.total)} registros) en:\n${r.path}\n\nEntrégaselos por un medio seguro (en mano o cifrados). La exportación queda anotada en el historial.`, { titulo: 'Datos exportados', textoAceptar: 'Ver en la carpeta', textoCancelar: 'Cerrar' })) {
    window.api.mostrarExportado(r.path);
  }
}

function elegirFormatoExportacionAlumno(nombre) {
  return new Promise(resolve => {
    let ov = document.getElementById('modal-exportar-alumno');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'overlay'; ov.id = 'modal-exportar-alumno';
      ov.innerHTML = '<div class="modal" style="max-width:460px" role="dialog" aria-modal="true" aria-labelledby="exp-al-tit"></div>';
      document.body.appendChild(ov);
    }
    const fin = v => { closeModal('modal-exportar-alumno'); resolve(v); };
    ov.firstElementChild.innerHTML = `<div class="modal-header"><h3 id="exp-al-tit">Exportar los datos de ${esc(nombre)}</h3></div>
      <p style="font-size:13px;color:var(--text-muted);line-height:1.5;margin:4px 0 14px">Todo lo que la app guarda de este alumno: ficha, clases, pagos, exámenes, tasas, bonos, agenda y caducidades. Sirve para atender su derecho de acceso o de portabilidad.</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button type="button" class="btn btn-primary" data-f="xlsx">Excel (para leerlo)</button>
        <button type="button" class="btn btn-outline" data-f="json">JSON (para pasarlo a otro programa)</button>
      </div>
      <div class="modal-actions" style="display:flex;justify-content:flex-end;margin-top:16px"><button type="button" class="btn btn-gray" data-f="">Cancelar</button></div>`;
    ov.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => fin(b.dataset.f || null)));
    openModal('modal-exportar-alumno');
  });
}
