// ─── AJUSTES ─────────────────────────────────────────────────────────────────
// Preferencias (rango de km por defecto, dashboard personalizable), pantalla de
// Ajustes y comprobación/descarga de actualizaciones (auto-update).

// ─── PREFERENCIAS (rango de km por defecto) ──────────────────────────────────
const PREF_RANGO_KEY = 'kmalumnos_rango_km';

function getRangoPref() {
  try {
    const raw = localStorage.getItem(PREF_RANGO_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && !isNaN(p.min) && !isNaN(p.max)) return p;
    }
  } catch (e) {}
  return { min: 40, max: 45 };
}

// El rango también viaja a la nube (ajustes_empresa 'rango_km'): la web del
// móvil lo usa cuando el profesor cierra una clase sin escribir el km final.
function guardarRangoPref(min, max) {
  try { localStorage.setItem(PREF_RANGO_KEY, JSON.stringify({ min, max })); } catch (e) {}
  if (window.api.setRangoKm) window.api.setRangoKm({ min, max }).catch(() => {});
}

// Al arrancar y al abrir Ajustes: el de la nube manda (lo cambió otro PC); si
// la nube aún no lo tiene, se sube el de este PC para que lo use el móvil.
async function sincronizarRangoKm() {
  try {
    const remoto = await window.api.getRangoKm();
    if (remoto) { localStorage.setItem(PREF_RANGO_KEY, JSON.stringify(remoto)); return remoto; }
    const local = getRangoPref();
    await window.api.setRangoKm({ min: Math.round(local.min), max: Math.round(local.max) });
  } catch (e) {}
  return getRangoPref();
}

function aplicarRangoPref(idMin, idMax) {
  const pref = getRangoPref();
  const elMin = document.getElementById(idMin);
  const elMax = document.getElementById(idMax);
  if (elMin) elMin.value = pref.min;
  if (elMax) elMax.value = pref.max;
}

// Km automáticos del móvil (por cada 2 clases): ajuste compartido con la web
// (ajustes_empresa 'km_auto_movil'), sin copia en localStorage.
async function cargarKmAutoMovil() {
  try {
    const r = await window.api.getKmAutoMovil();
    const a = document.getElementById('pref-kmauto-min'), b = document.getElementById('pref-kmauto-max');
    if (a && r) a.value = r.min;
    if (b && r) b.value = r.max;
  } catch (e) {}
}

async function guardarKmAutoMovilDesdeAjustes() {
  const min = Math.round(parseFloat(document.getElementById('pref-kmauto-min').value));
  const max = Math.round(parseFloat(document.getElementById('pref-kmauto-max').value));
  if (!(min >= 1) || !(max >= min) || max > 999) { await cargarKmAutoMovil(); return; }
  try { await window.api.setKmAutoMovil({ min, max }); } catch (e) {}
  cargarKmAutoMovil();
}

function guardarRangoPrefDesdeAjustes() {
  const min = parseFloat(document.getElementById('pref-km-min').value) || 40;
  const max = parseFloat(document.getElementById('pref-km-max').value) || 45;
  guardarRangoPref(min, max);
}

// Minutos por clase/práctica: usado por la agenda (renderer/reservas.js) para
// calcular la duración de una reserva a partir del nº de prácticas que pide
// el modal, y por la web del móvil (90 min = 2 clases de 45). Se comparte por
// la nube (ajustes_empresa 'duracion_clase_min'); localStorage es su copia
// local para leerlo sin esperar (getDuracionClaseMin es síncrona).
const DURACION_CLASE_KEY = 'km_duracion_clase_min';

function getDuracionClaseMin() {
  try {
    const raw = localStorage.getItem(DURACION_CLASE_KEY);
    const n = parseInt(raw);
    if (!isNaN(n) && n >= 1) return n;
  } catch (e) {}
  return 45;
}

function guardarDuracionClaseMin(min) {
  try { localStorage.setItem(DURACION_CLASE_KEY, String(Math.max(1, parseInt(min) || 45))); } catch (e) {}
  if (window.api.setDuracionClase) window.api.setDuracionClase(getDuracionClaseMin()).catch(() => {});
}

// Al arrancar y al abrir Ajustes: el valor de la nube manda (lo cambió otro PC);
// si la nube aún no lo tiene, se sube el de este PC para que lo vea el móvil.
async function sincronizarDuracionClase() {
  try {
    const remota = await window.api.getDuracionClase();
    if (remota) { localStorage.setItem(DURACION_CLASE_KEY, String(remota)); return remota; }
    const local = parseInt(localStorage.getItem(DURACION_CLASE_KEY));
    if (local >= 10 && local <= 240) await window.api.setDuracionClase(local);
  } catch (e) {}
  return getDuracionClaseMin();
}

function guardarDuracionClaseDesdeAjustes() {
  const min = parseInt(document.getElementById('pref-duracion-clase').value) || 45;
  guardarDuracionClaseMin(min);
}

// Precio del combustible y consumo medio: usados por el análisis de coste
// de vehículos (renderer/vehiculos.js, getAnalisisVehiculos) para estimar el
// gasto en € a partir de los km ya registrados. Mismo patrón localStorage que
// DURACION_CLASE_KEY.
const PRECIO_COMBUSTIBLE_KEY = 'km_precio_combustible';
const CONSUMO_MEDIO_KEY = 'km_consumo_medio';

function getPrecioCombustible() {
  try {
    const raw = localStorage.getItem(PRECIO_COMBUSTIBLE_KEY);
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) return n;
  } catch (e) {}
  return 1.60;
}

function getConsumoMedio() {
  try {
    const raw = localStorage.getItem(CONSUMO_MEDIO_KEY);
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) return n;
  } catch (e) {}
  return 6.5;
}

function guardarCombustiblePrefDesdeAjustes() {
  const precio = parseFloat(document.getElementById('pref-precio-combustible').value);
  const consumo = parseFloat(document.getElementById('pref-consumo-medio').value);
  try {
    if (!isNaN(precio) && precio > 0) localStorage.setItem(PRECIO_COMBUSTIBLE_KEY, String(precio));
    if (!isNaN(consumo) && consumo > 0) localStorage.setItem(CONSUMO_MEDIO_KEY, String(consumo));
  } catch (e) {}
  if (typeof loadAnalisisVehiculos === 'function') loadAnalisisVehiculos();
}

// Política de cancelación de la Agenda: plazo mínimo (horas) y si hay
// devolución cuando se cancela dentro de plazo. Usado por renderer/reservas.js
// (cancelarReserva) solo como aviso informativo. Mismo patrón localStorage
// que DURACION_CLASE_KEY.
const CANCEL_PLAZO_KEY = 'km_cancel_plazo_horas';
const CANCEL_DEVOLUCION_KEY = 'km_cancel_devolucion';

function getCancelPlazoHoras() {
  try {
    const raw = localStorage.getItem(CANCEL_PLAZO_KEY);
    const n = parseInt(raw);
    if (!isNaN(n) && n >= 0) return n;
  } catch (e) {}
  return 24;
}

function setCancelPlazoHoras(horas) {
  try { localStorage.setItem(CANCEL_PLAZO_KEY, String(Math.max(0, parseInt(horas) || 24))); } catch (e) {}
}

function getCancelDevolucion() {
  try {
    const raw = localStorage.getItem(CANCEL_DEVOLUCION_KEY);
    if (raw !== null) return raw !== 'false';
  } catch (e) {}
  return true;
}

function setCancelDevolucion(valor) {
  try { localStorage.setItem(CANCEL_DEVOLUCION_KEY, String(!!valor)); } catch (e) {}
}

function guardarCancelacionPrefDesdeAjustes() {
  const plazo = document.getElementById('pref-cancel-plazo').value;
  const devolucion = document.getElementById('pref-cancel-devolucion').checked;
  setCancelPlazoHoras(plazo);
  setCancelDevolucion(devolucion);
}

// ─── COBROS: CONCEPTOS Y PRECIO POR CLASE ────────────────────────────────────
// Los conceptos (matrícula, tasa, soporte informático...) viven en la nube
// (ajustes_empresa 'conceptos_cobro', db/ajustes-empresa.js) y se comparten
// entre equipos y con la web. Antes solo existían los importes de matrícula y
// tasa en el localStorage de cada PC: se leen para proponer la lista inicial
// (conceptosCobroPorDefecto) y se guardan en cuanto alguno tiene importe.
const MATRICULA_IMPORTE_KEY = 'km_matricula_importe';
const TASA_IMPORTE_KEY = 'km_tasa_importe';
const CONCEPTOS_SUGERIDOS = ['Soporte informático', 'Material didáctico', 'Certificado médico', 'Gestión de expediente', 'Renovación de matrícula'];
let conceptosCobroCache = [];

function _importeLocal(clave) {
  try {
    const n = parseFloat(localStorage.getItem(clave));
    if (!isNaN(n) && n >= 0) return n;
  } catch (e) {}
  return 0;
}

function conceptosCobroPorDefecto() {
  const tasa = _importeLocal(TASA_IMPORTE_KEY);
  return [
    { id: 'matricula', nombre: 'Matrícula', tipo: 'matricula', importe: _importeLocal(MATRICULA_IMPORTE_KEY), alta: true },
    { id: 'tasa', nombre: 'Tasa de tráfico (DGT)', tipo: 'tasa', importe: tasa, alta: tasa > 0 }
  ];
}

// Lista vigente; la primera vez, con importes heredados de este PC, la guarda.
async function getConceptosCobroUI() {
  const guardados = await window.api.getConceptosCobro();
  if (Array.isArray(guardados)) return guardados;
  const def = conceptosCobroPorDefecto();
  return def.some(c => c.importe > 0) ? window.api.setConceptosCobro(def) : def;
}

const fmtEur = n => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

async function renderCobrosUI() {
  conceptosCobroCache = await getConceptosCobroUI();
  const tbody = document.querySelector('#tabla-conceptos-cobro tbody');
  if (tbody) {
    tbody.innerHTML = conceptosCobroCache.length ? conceptosCobroCache.map((c, i) => `<tr>
      <td><input type="text" value="${esc(c.nombre)}" maxlength="60" onchange="editarConceptoCobroUI(${i}, 'nombre', this.value)" placeholder="Nombre del concepto"></td>
      <td class="col-num"><input type="number" min="0" step="0.01" value="${c.importe}" style="width:110px" onchange="editarConceptoCobroUI(${i}, 'importe', this.value)"></td>
      <td><label class="interruptor" title="Cargarlo solo a cada alumno nuevo"><input type="checkbox" ${c.alta ? 'checked' : ''} onchange="editarConceptoCobroUI(${i}, 'alta', this.checked)"><i></i></label></td>
      <td><button type="button" class="btn btn-ghost btn-sm" title="Quitar ${esc(c.nombre)}" onclick="quitarConceptoCobroUI(${i})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></td>
    </tr>`).join('') : '<tr><td colspan="4" class="empty">Sin conceptos. Añade al menos la matrícula.</td></tr>';
  }
  const sug = document.getElementById('conceptos-sugeridos');
  const faltan = CONCEPTOS_SUGERIDOS.filter(n => !conceptosCobroCache.some(c => c.nombre.toLowerCase() === n.toLowerCase()));
  if (sug) sug.innerHTML = faltan.length ? `<span>Ideas:</span>${faltan.map(n => `<button type="button" class="btn btn-sm btn-outline" onclick="anadirConceptoCobroUI(this.dataset.nombre)" data-nombre="${esc(n)}">+ ${esc(n)}</button>`).join('')}` : '';
  await pintarTarifas('#tabla-tarifas-ajustes tbody', 'aj-tarifa', 'ajustes-tarifa-toast');
  pintarSelectNuevoPermiso();
}

async function guardarConceptosCobroUI(lista, msg) {
  conceptosCobroCache = await window.api.setConceptosCobro(lista);
  await renderCobrosUI();
  if (msg) showToast('conceptos-toast', msg, 'ok');
}

function editarConceptoCobroUI(i, campo, valor) {
  const lista = conceptosCobroCache.map(c => ({ ...c }));
  if (!lista[i]) return;
  if (campo === 'importe') {
    const n = parseFloat(valor);
    if (isNaN(n) || n < 0) { showToast('conceptos-toast', 'Introduce un importe válido (0 o más).', 'err'); renderCobrosUI(); return; }
    lista[i].importe = n;
  } else if (campo === 'nombre') {
    const t = String(valor || '').trim();
    if (!t) { showToast('conceptos-toast', 'El concepto necesita un nombre.', 'err'); renderCobrosUI(); return; }
    if (lista.some((c, j) => j !== i && c.nombre.toLowerCase() === t.toLowerCase())) { showToast('conceptos-toast', `Ya hay un concepto llamado «${t}».`, 'err'); renderCobrosUI(); return; }
    lista[i].nombre = t;
  } else if (campo === 'alta') {
    lista[i].alta = !!valor;
  }
  guardarConceptosCobroUI(lista, 'Guardado. Llega a los demás equipos y al móvil en la próxima sincronización.');
}

async function anadirConceptoCobroUI(nombre) {
  let t = typeof nombre === 'string' ? nombre : await pedirTexto('¿Cómo se llama? Luego pones su importe en la tabla.', { titulo: 'Nuevo concepto de cobro', placeholder: 'Ej. Soporte informático', textoAceptar: 'Añadir' });
  t = String(t || '').trim();
  if (!t) return;
  if (conceptosCobroCache.some(c => c.nombre.toLowerCase() === t.toLowerCase())) { showToast('conceptos-toast', `«${t}» ya está en la lista.`, 'err'); return; }
  const lista = [...conceptosCobroCache, { id: 'c' + Date.now().toString(36), nombre: t, tipo: 'cargo', importe: 0, alta: true }];
  await guardarConceptosCobroUI(lista, `Añadido «${t}». Pon su importe.`);
  const inputs = document.querySelectorAll('#tabla-conceptos-cobro tbody input[type=number]');
  const ultimo = inputs[inputs.length - 1];
  if (ultimo) { ultimo.focus(); ultimo.select(); }
}

async function quitarConceptoCobroUI(i) {
  const c = conceptosCobroCache[i];
  if (!c) return;
  if (!await confirmar(`¿Quitar «${c.nombre}» de los conceptos de cobro? Los cargos ya anotados a los alumnos no se tocan.`, { textoAceptar: 'Quitar' })) return;
  guardarConceptosCobroUI(conceptosCobroCache.filter((_, j) => j !== i), `Quitado «${c.nombre}».`);
}

// Permisos habituales que aún no tienen fila en la tabla de precio por clase.
const PERMISOS_HABITUALES = ['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C1', 'C', 'CE', 'D1', 'D', 'DE'];
function pintarSelectNuevoPermiso() {
  const sel = document.getElementById('tarifa-nuevo-permiso');
  if (!sel) return;
  const yaEstan = new Set([...document.querySelectorAll('#tabla-tarifas-ajustes tbody tr[data-permiso]')].map(tr => tr.dataset.permiso));
  const libres = PERMISOS_HABITUALES.filter(p => !yaEstan.has(p));
  sel.hidden = !libres.length;
  sel.innerHTML = '<option value="">+ Precio de otro permiso…</option>' + libres.map(p => `<option value="${p}">${p}</option>`).join('');
}
async function anadirPermisoTarifaUI(sel) {
  const permiso = sel.value;
  if (!permiso) return;
  const extra = [...document.querySelectorAll('#tabla-tarifas-ajustes tbody tr[data-permiso]')].map(tr => tr.dataset.permiso);
  await pintarTarifas('#tabla-tarifas-ajustes tbody', 'aj-tarifa', 'ajustes-tarifa-toast', [...extra, permiso]);
  pintarSelectNuevoPermiso();
  document.getElementById(`aj-tarifa-${permiso}-circulacion`)?.focus();
}

// % de IVA para el libro de ventas (tarea D5, exportación contable): usado
// por renderer/informes.js (loadLibroVentas) para desglosar base/cuota de
// los pagos ya registrados. Mismo patrón localStorage que DURACION_CLASE_KEY.
const IVA_PORCENTAJE_KEY = 'km_iva_porcentaje';

function getIvaPorcentaje() {
  try {
    const raw = localStorage.getItem(IVA_PORCENTAJE_KEY);
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) return n;
  } catch (e) {}
  return 21;
}

function guardarIvaPorcentaje(iva) {
  try {
    const n = parseFloat(iva);
    localStorage.setItem(IVA_PORCENTAJE_KEY, String((!isNaN(n) && n >= 0) ? n : 21));
  } catch (e) {}
}

function guardarIvaPrefDesdeAjustes() {
  guardarIvaPorcentaje(document.getElementById('pref-iva').value);
}

// Datos del centro (DGT), cabecera del impreso oficial de formación práctica
// (ficha DGT, ver window.api.generarFichaDGT / fichas-dgt.js). Mismo patrón
// localStorage que el resto de preferencias de arriba (getPrecioCombustible):
// objeto JSON con try/catch, {} por defecto si no hay nada guardado o el
// contenido no es válido.
const CENTRO_DATOS_KEY = 'km_centro_datos';

function getCentroDatos() {
  try {
    const raw = localStorage.getItem(CENTRO_DATOS_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && typeof c === 'object') return c;
    }
  } catch (e) {}
  return {};
}

// Clave guardada → casilla de Ajustes (id «centro-…»)
const CENTRO_CAMPOS = { numero: 'numero', seccion: 'seccion', digito_control: 'digito', denominacion: 'denominacion', razon_social: 'razon_social',
  cif: 'cif', titular: 'titular', direccion: 'direccion', codigo_postal: 'cp', poblacion: 'poblacion', provincia: 'provincia', telefono: 'telefono',
  email: 'email', jefatura: 'jefatura', centro_examen: 'centro_examen' };

function guardarCentroDatosDesdeAjustes() {
  const centro = {
    ...Object.fromEntries(Object.entries(CENTRO_CAMPOS).map(([k, id]) => [k, document.getElementById('centro-' + id)?.value.trim() || ''])),
    // Preferencia ficha DGT: rellenar la fecha del documento (pie "a __ de __
    // de __"); por defecto true, false = se deja en blanco para rellenar a mano.
    rellenar_fecha: document.getElementById('centro-rellenar-fecha')?.checked !== false
  };
  try { localStorage.setItem(CENTRO_DATOS_KEY, JSON.stringify(centro)); } catch (e) {}
}

const PREF_DASHBOARD_KEY = 'kmalumnos_dashboard_stats';
const PREF_DASHBOARD_DEFAULT = {
  vehiculos: true, alumnos: true, practicas: true,
  practicasHoy: false, kmMes: false, totalAdeudado: false, alumnosConDeuda: false,
  // Gráficos configurables (renderer/graficos.js): km y prácticas por mes activos
  // por defecto, el resto apagado para no saturar la pantalla de entrada.
  graficoKmMes: true, graficoPracticasMes: true,
  graficoPorProfesor: false, graficoPorVehiculo: false, graficoIngresos: false
};

function getDashboardPref() {
  try {
    const raw = localStorage.getItem(PREF_DASHBOARD_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') return { ...PREF_DASHBOARD_DEFAULT, ...p };
    }
  } catch (e) {}
  return { ...PREF_DASHBOARD_DEFAULT };
}

function guardarDashboardPref(p) {
  try { localStorage.setItem(PREF_DASHBOARD_KEY, JSON.stringify(p)); } catch (e) {}
}

function guardarDashboardPrefDesdeAjustes() {
  const p = {
    vehiculos: document.getElementById('pref-dash-vehiculos').checked,
    alumnos: document.getElementById('pref-dash-alumnos').checked,
    practicas: document.getElementById('pref-dash-practicas').checked,
    practicasHoy: document.getElementById('pref-dash-practicas-hoy').checked,
    kmMes: document.getElementById('pref-dash-km-mes').checked,
    totalAdeudado: document.getElementById('pref-dash-total-adeudado').checked,
    alumnosConDeuda: document.getElementById('pref-dash-alumnos-deuda').checked,
    graficoKmMes: document.getElementById('pref-dash-grafico-km-mes').checked,
    graficoPracticasMes: document.getElementById('pref-dash-grafico-practicas-mes').checked,
    graficoPorProfesor: document.getElementById('pref-dash-grafico-profesor').checked,
    graficoPorVehiculo: document.getElementById('pref-dash-grafico-vehiculo').checked,
    graficoIngresos: document.getElementById('pref-dash-grafico-ingresos').checked
  };
  guardarDashboardPref(p);
}


// ─── AJUSTES ──────────────────────────────────────────────────────────────────
async function loadAjustes() {
  ajustesInicio(); // siempre se entra por los cuadros (el buscador abre luego la sección)
  aplicarRangoPref('pref-km-min', 'pref-km-max');
  sincronizarRangoKm().then(() => aplicarRangoPref('pref-km-min', 'pref-km-max')).catch(() => {});
  cargarKmAutoMovil();
  const elDuracionClase = document.getElementById('pref-duracion-clase');
  if (elDuracionClase) elDuracionClase.value = await sincronizarDuracionClase();
  const elPrecioCombustible = document.getElementById('pref-precio-combustible');
  if (elPrecioCombustible) elPrecioCombustible.value = getPrecioCombustible();
  const elConsumoMedio = document.getElementById('pref-consumo-medio');
  if (elConsumoMedio) elConsumoMedio.value = getConsumoMedio();
  const elCancelPlazo = document.getElementById('pref-cancel-plazo');
  if (elCancelPlazo) elCancelPlazo.value = getCancelPlazoHoras();
  const elCancelDevolucion = document.getElementById('pref-cancel-devolucion');
  if (elCancelDevolucion) elCancelDevolucion.checked = getCancelDevolucion();
  const elIva = document.getElementById('pref-iva');
  if (elIva) elIva.value = getIvaPorcentaje();
  const centroDatos = getCentroDatos();
  for (const [k, id] of Object.entries(CENTRO_CAMPOS)) { const el = document.getElementById('centro-' + id); if (el) el.value = centroDatos[k] || ''; }
  const elCentroRellenarFecha = document.getElementById('centro-rellenar-fecha');
  if (elCentroRellenarFecha) elCentroRellenarFecha.checked = centroDatos.rellenar_fecha !== false;
  const dashPref = getDashboardPref();
  document.getElementById('pref-dash-vehiculos').checked = dashPref.vehiculos;
  document.getElementById('pref-dash-alumnos').checked = dashPref.alumnos;
  document.getElementById('pref-dash-practicas').checked = dashPref.practicas;
  document.getElementById('pref-dash-practicas-hoy').checked = dashPref.practicasHoy;
  document.getElementById('pref-dash-km-mes').checked = dashPref.kmMes;
  document.getElementById('pref-dash-total-adeudado').checked = dashPref.totalAdeudado;
  document.getElementById('pref-dash-alumnos-deuda').checked = dashPref.alumnosConDeuda;
  document.getElementById('pref-dash-grafico-km-mes').checked = dashPref.graficoKmMes;
  document.getElementById('pref-dash-grafico-practicas-mes').checked = dashPref.graficoPracticasMes;
  document.getElementById('pref-dash-grafico-profesor').checked = dashPref.graficoPorProfesor;
  document.getElementById('pref-dash-grafico-vehiculo').checked = dashPref.graficoPorVehiculo;
  document.getElementById('pref-dash-grafico-ingresos').checked = dashPref.graficoIngresos;
  refrescarEstadoCuenta();
  aplicarPermisosPorRol();
  const v = await window.api.getVersion();
  const el = document.getElementById('ajustes-version');
  if (el) el.textContent = 'v' + v;
  const s = await window.api.getSyncStatus();
  updateSyncBar(s || 'offline');
  loadUltimoBackup();
}

// ─── AJUSTES POR SECCIONES (cuadros de acceso) ───────────────────────────────
// La página abre con un cuadro por sección; al pulsar uno se muestra solo esa
// sección (sus tarjetas, que ya existían, agrupadas en .aj-seccion). El buscador
// global abre la sección que contiene su destino (ajustesAbrirSeccionDe).
const AJ_ICO = {
  cuenta: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="m9 15 2 2 4-4"/>',
  clases: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  zonas: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  cobros: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 12h5"/><path d="M16 9.5a4 4 0 1 0 0 5.2"/>',
  vehiculos: '<path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  panel: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  menu: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  centro: '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>',
  copias: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  actualizaciones: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  puesta: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>'
};
const AJ_SECCIONES = [
  { id: 'puesta', titulo: 'Puesta en marcha', desc: 'Empieza con tus datos reales: km de los coches y clases ya hechas', pagina: 'puesta-en-marcha' },
  { id: 'cuenta', titulo: 'Cuenta y sincronización', desc: 'Cuenta de empresa, nube y equipo' },
  { id: 'clases', titulo: 'Clases y kilómetros', desc: 'Rango de km, duración de clase y cancelaciones' },
  { id: 'zonas', titulo: 'Zonas de prácticas', desc: 'Lo que el profesor marca en el móvil como zonas recorridas' },
  { id: 'menu', titulo: 'Menú lateral', desc: 'Elige qué funciones se ven en el menú' },
  { id: 'panel', titulo: 'Panel principal', desc: 'Tarjetas y gráficos del Panel' },
  { id: 'cobros', titulo: 'Cobros', desc: 'Matrícula y otros conceptos, precio por clase, IVA' },
  { id: 'vehiculos', titulo: 'Combustible', desc: 'Precio y consumo para estimar costes' },
  { id: 'centro', titulo: 'Datos del centro (DGT)', desc: 'Cabecera de la ficha oficial de prácticas' },
  { id: 'copias', titulo: 'Copias de seguridad', desc: 'Guardar y restaurar todos los datos' },
  { id: 'actualizaciones', titulo: 'Actualizaciones y ayuda', desc: 'Versión instalada y tutorial' }
];

async function estadoCuadroAjustes(id) {
  try {
    if (id === 'cuenta') { const e = await window.api.getEstadoCuenta(); return e && e.conectado ? (e.email ? 'Conectada · ' + e.email : 'Conectada') : 'Sin iniciar sesión'; }
    if (id === 'clases') { const r = getRangoPref(); return `${r.min}–${r.max} km por práctica · ${getDuracionClaseMin()} min por clase`; }
    if (id === 'zonas') { const z = await window.api.getZonasPractica(); return z.length ? `${z.length} ${z.length === 1 ? 'zona' : 'zonas'}: ${z.slice(0, 3).join(', ')}${z.length > 3 ? '…' : ''}` : 'Sin zonas (la web no las pide)'; }
    if (id === 'menu') { const n = getMenuOculto().length; return n ? `${n} ${n === 1 ? 'función oculta' : 'funciones ocultas'}` : 'Se ve todo'; }
    if (id === 'panel') { const p = getDashboardPref(); const n = Object.values(p).filter(Boolean).length; return `${n} elementos visibles`; }
    if (id === 'cobros') { const l = await getConceptosCobroUI(); const alta = l.filter(c => c.alta && c.importe > 0); return alta.length ? 'Al alta: ' + alta.map(c => `${c.nombre} ${fmtEur(c.importe)}`).join(' · ') : 'Nada se cobra al dar de alta'; }
    if (id === 'vehiculos') return `${Number(getPrecioCombustible()).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €/L · ${fmtDec(getConsumoMedio())} L/100 km`;
    if (id === 'centro') { const c = getCentroDatos(); return c.denominacion || c.numero ? (c.denominacion || 'Nº ' + c.numero) : 'Sin rellenar'; }
    if (id === 'actualizaciones') return 'Versión ' + (await window.api.getVersion());
  } catch (e) { /* un estado que no se puede leer no impide ver el cuadro */ }
  return '';
}

function ajustesInicio() {
  const cuadros = document.getElementById('aj-cuadros');
  if (!cuadros) return;
  document.querySelectorAll('#page-ajustes .aj-seccion').forEach(sec => { sec.hidden = true; });
  cuadros.hidden = false;
  document.getElementById('aj-titulo').textContent = 'Ajustes';
  document.getElementById('aj-subtitulo').textContent = 'Elige qué quieres configurar';
  document.getElementById('aj-miga').classList.add('hidden');
  document.getElementById('aj-volver').classList.add('hidden');
  cuadros.innerHTML = AJ_SECCIONES.map(x => `
    <button type="button" class="aj-cuadro${x.pagina ? ' aj-cuadro-destacado' : ''}" onclick="${x.pagina ? `navegarA('${x.pagina}')` : `ajustesAbrir('${x.id}')`}" data-aj-cuadro="${x.id}">
      <span class="aj-cuadro-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${AJ_ICO[x.id]}</svg></span>
      <span class="aj-cuadro-txt"><b>${esc(x.titulo)}</b><small>${esc(x.desc)}</small><em data-aj-estado="${x.id}"></em></span>
      <svg class="aj-cuadro-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>`).join('');
  AJ_SECCIONES.forEach(async x => {
    const t = await estadoCuadroAjustes(x.id);
    const el = cuadros.querySelector(`[data-aj-estado="${x.id}"]`);
    if (el) el.textContent = t;
  });
}

function ajustesAbrir(id) {
  const sec = document.querySelector(`#page-ajustes .aj-seccion[data-aj-seccion="${id}"]`);
  if (!sec) return;
  const def = AJ_SECCIONES.find(x => x.id === id) || { titulo: 'Ajustes', desc: '' };
  document.getElementById('aj-cuadros').hidden = true;
  document.querySelectorAll('#page-ajustes .aj-seccion').forEach(x => { x.hidden = x !== sec; });
  document.getElementById('aj-titulo').textContent = def.titulo;
  document.getElementById('aj-subtitulo').textContent = def.desc;
  document.getElementById('aj-miga').classList.remove('hidden');
  document.getElementById('aj-volver').classList.remove('hidden');
  if (id === 'zonas') renderZonasUI();
  if (id === 'menu') renderPersonalizarMenu();
  if (id === 'cobros') renderCobrosUI();
  const cont = document.getElementById('content');
  if (cont) cont.scrollTop = 0;
}

// Atajo desde otras pantallas (pago sin precio por clase, alta sin matrícula...).
function irAjustesCobros() {
  navegarA('ajustes');
  ajustesAbrir('cobros');
}

// El buscador global apunta a una tarjeta concreta: se abre su sección.
function ajustesAbrirSeccionDe(el) {
  const sec = el && el.closest ? el.closest('#page-ajustes .aj-seccion') : null;
  if (sec && sec.hidden) ajustesAbrir(sec.dataset.ajSeccion);
}

// ─── ZONAS DE PRÁCTICAS (se comparten con la web del móvil) ─────────────────
const ZONAS_SUGERIDAS = ['Centro', 'Casco urbano', 'Polígono', 'Autovía', 'Carretera', 'Circuito de examen', 'Rotondas', 'Zona escolar', 'Aparcamiento', 'Noche'];
let zonasCache = [];

async function renderZonasUI() {
  zonasCache = await window.api.getZonasPractica();
  const lista = document.getElementById('zonas-lista');
  if (!lista) return;
  lista.innerHTML = zonasCache.length
    ? zonasCache.map((z, i) => `<span class="zona-chip"><span class="zona-orden">
        <button type="button" title="Subir" onclick="moverZonaUI(${i},-1)" ${i === 0 ? 'disabled' : ''}>‹</button>
        <button type="button" title="Bajar" onclick="moverZonaUI(${i},1)" ${i === zonasCache.length - 1 ? 'disabled' : ''}>›</button></span>
        ${esc(z)}<button type="button" class="zona-quitar" title="Quitar ${esc(z)}" onclick="quitarZonaUI(${i})">×</button></span>`).join('')
    : '<p class="zonas-vacio">Todavía no hay zonas. Mientras no añadas ninguna, la web del móvil no muestra el apartado «Zonas recorridas».</p>';
  const sug = document.getElementById('zonas-sugeridas');
  const faltan = ZONAS_SUGERIDAS.filter(z => !zonasCache.some(x => x.toLowerCase() === z.toLowerCase()));
  if (sug) sug.innerHTML = faltan.length ? `<span>Sugerencias:</span>${faltan.map(z => `<button type="button" class="btn btn-sm btn-outline" onclick="anadirZonaUI('${z.replace(/'/g, "\\'")}')">+ ${esc(z)}</button>`).join('')}` : '';
}

async function guardarZonasUI(nueva, msg) {
  zonasCache = await window.api.setZonasPractica(nueva);
  renderZonasUI();
  showToast('zonas-toast', msg + ' Llegará a la web del móvil en la próxima sincronización.', 'ok');
}
async function anadirZonaUI(nombre) {
  const input = document.getElementById('zona-nueva');
  const z = String(nombre != null ? nombre : (input ? input.value : '')).trim();
  if (!z) { if (input) input.focus(); return; }
  if (zonasCache.some(x => x.toLowerCase() === z.toLowerCase())) { showToast('zonas-toast', `«${z}» ya está en la lista.`, 'warn'); return; }
  if (input && nombre == null) input.value = '';
  await guardarZonasUI([...zonasCache, z], `Zona «${z}» añadida.`);
}
async function quitarZonaUI(i) {
  const z = zonasCache[i];
  await guardarZonasUI(zonasCache.filter((_, k) => k !== i), `Zona «${z}» quitada.`);
}
async function moverZonaUI(i, d) {
  const j = i + d; if (j < 0 || j >= zonasCache.length) return;
  const nueva = zonasCache.slice(); [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
  await guardarZonasUI(nueva, 'Orden guardado.');
}

// ─── ACTUALIZACIONES ──────────────────────────────────────────────────────────
// Ventanas propias (nada de cuadros de Windows), en dos pasos:
//   1. Hay versión nueva → «¿Descargarla?» (con las novedades). Se descarga
//      mientras se sigue trabajando; el progreso va en una pastilla abajo.
//   2. Ya descargada → «¿Instalar ahora?». Si no, se instala sola al cerrar la
//      app y la pastilla queda con «Instalar» por si se quiere antes.
// El proceso principal (main.js → ACTUALIZACIONES) busca, descarga e instala;
// `estadoActualizacion()` da la fase actual por si el aviso llegó antes de
// que la pantalla terminara de cargar.
let updPreguntada = new Set();   // versiones ya preguntadas solas en esta sesión
let updManual = false;           // la búsqueda la lanzó el usuario desde Ajustes
let updEstado = { fase: 'nada' };

const UPD_ICONO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const UPD_ICONO_OK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

const updMB = bytes => bytes ? `${Math.max(1, Math.round(bytes / 1048576))} MB` : '';

function updModal() {
  let ov = document.getElementById('modal-actualizacion');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'overlay'; ov.id = 'modal-actualizacion';
    ov.innerHTML = '<div class="modal modal-upd" role="dialog" aria-modal="true" aria-labelledby="upd-titulo"></div>';
    document.body.appendChild(ov);
  }
  document.body.appendChild(ov); // siempre por encima de lo que haya abierto
  return ov;
}

// Paso 1: hay versión nueva. manual = la pidió el usuario (se enseña aunque
// ya se hubiera dicho «Ahora no» al arrancar).
function mostrarActualizacionDisponible(e, manual) {
  if (!e || e.fase !== 'disponible') return;
  if (!manual && updPreguntada.has(e.version)) return;
  updPreguntada.add(e.version);
  const ov = updModal();
  ov.firstElementChild.innerHTML = `
    <div class="modal-header">
      <div class="modal-header-icon">${UPD_ICONO}</div>
      <h3 id="upd-titulo">Hay una versión nueva de AulaMovil</h3>
    </div>
    <div class="upd-versiones">
      <span class="upd-version-nueva">Versión ${esc(e.version)}</span>
      ${e.actual ? `<span>tienes la ${esc(e.actual)}</span>` : ''}
      ${e.tamano ? `<span>${updMB(e.tamano)}</span>` : ''}
    </div>
    ${e.notas ? `<div class="upd-notas-tit">Novedades</div><div class="upd-notas">${esc(e.notas)}</div>` : ''}
    <p class="upd-texto">Se descarga mientras sigues trabajando. Cuando termine, te preguntará si quieres instalarla.</p>
    <div class="modal-actions upd-acciones">
      <button class="btn btn-gray" type="button" onclick="cerrarActualizacion()">Ahora no</button>
      <button class="btn btn-primary" type="button" id="upd-aceptar" onclick="descargarActualizacionUI()">${UPD_ICONO.replace(/18/g, '14')} Descargar</button>
    </div>`;
  ov.classList.add('open');
  setTimeout(() => document.getElementById('upd-aceptar')?.focus(), 30);
}

// Paso 2: ya descargada.
function mostrarActualizacionLista(e) {
  if (!e || e.fase !== 'descargada') return;
  const ov = updModal();
  ov.firstElementChild.innerHTML = `
    <div class="modal-header">
      <div class="modal-header-icon upd-icono-ok">${UPD_ICONO_OK}</div>
      <h3 id="upd-titulo">Actualización lista para instalar</h3>
    </div>
    <p class="upd-texto">La versión <strong>${esc(e.version || '')}</strong> ya está descargada. Al instalarla, AulaMovil se cierra unos segundos y se vuelve a abrir sola; lo que tengas guardado se conserva.</p>
    <p class="upd-texto upd-texto-suave">Si estás escribiendo algo, guárdalo antes. Si eliges «Más tarde», se instalará sola la próxima vez que cierres la aplicación.</p>
    <div class="modal-actions upd-acciones">
      <button class="btn btn-gray" type="button" onclick="cerrarActualizacion(); pintarPastillaUpd()">Más tarde</button>
      <button class="btn btn-primary" type="button" id="upd-aceptar" onclick="instalarActualizacionUI()">Instalar ahora</button>
    </div>`;
  ov.classList.add('open');
  setTimeout(() => document.getElementById('upd-aceptar')?.focus(), 30);
}

function cerrarActualizacion() {
  document.getElementById('modal-actualizacion')?.classList.remove('open');
}

async function descargarActualizacionUI() {
  cerrarActualizacion();
  const r = await window.api.descargarActualizacion();
  if (!r || !r.ok) refrescarEstadoUpd();
}

async function instalarActualizacionUI() {
  const btn = document.getElementById('upd-aceptar') || document.getElementById('upd-pastilla-instalar');
  if (btn) { btn.disabled = true; btn.textContent = 'Instalando…'; }
  const r = await window.api.installUpdate();
  if (!r || !r.ok) { if (btn) { btn.disabled = false; btn.textContent = 'Instalar ahora'; } refrescarEstadoUpd(); }
}

// Pastilla flotante (abajo a la derecha): progreso de la descarga y, ya
// descargada, acceso a «Instalar».
function pintarPastillaUpd() {
  let el = document.getElementById('upd-pastilla');
  const e = updEstado;
  if (e.fase !== 'descargando' && e.fase !== 'descargada') { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'upd-pastilla'; el.className = 'upd-pastilla'; el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  if (e.fase === 'descargando') {
    const pct = Math.max(0, Math.min(100, e.pct || 0));
    el.innerHTML = `<span class="upd-pastilla-icono">${UPD_ICONO.replace(/18/g, '15')}</span>
      <span class="upd-pastilla-texto">Descargando la versión ${esc(e.version || '')}<b>${pct}%</b></span>
      <span class="upd-pastilla-barra"><span style="width:${pct}%"></span></span>`;
  } else {
    el.innerHTML = `<span class="upd-pastilla-icono upd-icono-ok">${UPD_ICONO_OK.replace(/18/g, '15')}</span>
      <span class="upd-pastilla-texto">Versión ${esc(e.version || '')} lista</span>
      <button type="button" class="btn btn-primary btn-sm" id="upd-pastilla-instalar" onclick="instalarActualizacionUI()">Instalar</button>
      <button type="button" class="upd-pastilla-cerrar" title="Ocultar (se instalará al cerrar la app)" aria-label="Ocultar" onclick="document.getElementById('upd-pastilla').remove()">×</button>`;
  }
}

// Botón de Ajustes → Actualizaciones
function pintarBotonUpd(texto, color) {
  const label = document.getElementById('update-label');
  const bar = document.getElementById('update-bar');
  if (!label || !bar) return;
  label.textContent = texto;
  bar.style.color = color || '';
}

async function refrescarEstadoUpd() {
  try { updEstado = await window.api.estadoActualizacion() || { fase: 'nada' }; } catch (e) { return; }
  pintarPastillaUpd();
  if (updEstado.fase === 'descargada') pintarBotonUpd(`Versión ${updEstado.version} lista — instalar`, 'rgba(16,185,129,.8)');
  else if (updEstado.fase === 'disponible') pintarBotonUpd(`Versión ${updEstado.version} disponible — descargar`, '');
  return updEstado;
}

async function checkUpdates() {
  const e = await refrescarEstadoUpd();
  // Ya hay una versión nueva en marcha: se enseña su paso en vez de buscar otra vez
  if (e && e.fase === 'descargada') return mostrarActualizacionLista(e);
  if (e && e.fase === 'disponible') return mostrarActualizacionDisponible(e, true);
  if (e && e.fase === 'descargando') return;
  updManual = true;
  pintarBotonUpd('Buscando...');
  document.getElementById('update-bar').style.pointerEvents = 'none';
  window.api.checkForUpdates();
}

window.api.onUpdateAvailable((e) => {
  updEstado = e || { fase: 'nada' };
  const bar = document.getElementById('update-bar');
  if (bar) bar.style.pointerEvents = '';
  pintarBotonUpd(`Versión ${updEstado.version} disponible — descargar`, '');
  mostrarActualizacionDisponible(updEstado, updManual);
  updManual = false;
});

window.api.onUpdateNotAvailable(() => {
  const bar = document.getElementById('update-bar');
  if (bar) bar.style.pointerEvents = '';
  if (!updManual) return;
  updManual = false;
  pintarBotonUpd('✓ Ya tienes la última versión', 'rgba(16,185,129,.7)');
  setTimeout(() => pintarBotonUpd('Buscar actualizaciones'), 3000);
});

window.api.onUpdateDownloadStart((version) => {
  updEstado = { ...updEstado, fase: 'descargando', version: version || updEstado.version, pct: 0 };
  pintarBotonUpd(`Descargando la versión ${updEstado.version}…`, 'rgba(99,102,241,.8)');
  pintarPastillaUpd();
});

window.api.onUpdateDownloadProgress((pct) => {
  if (updEstado.fase !== 'descargando') updEstado = { ...updEstado, fase: 'descargando' };
  updEstado.pct = pct;
  pintarBotonUpd(`Descargando la versión ${updEstado.version || ''}… ${pct}%`, 'rgba(99,102,241,.8)');
  pintarPastillaUpd();
});

window.api.onUpdateDownloaded((e) => {
  updEstado = e || { ...updEstado, fase: 'descargada' };
  const bar = document.getElementById('update-bar');
  if (bar) bar.style.pointerEvents = '';
  pintarBotonUpd(`Versión ${updEstado.version} lista — instalar`, 'rgba(16,185,129,.8)');
  pintarPastillaUpd();
  mostrarActualizacionLista(updEstado);
});

window.api.onUpdateError((msg) => {
  const descargando = updEstado.fase === 'descargando';
  const manual = updManual;
  updManual = false;
  const bar = document.getElementById('update-bar');
  if (bar) bar.style.pointerEvents = '';
  refrescarEstadoUpd();
  pintarBotonUpd('✕ Error al actualizar', 'rgba(239,68,68,.7)');
  setTimeout(() => refrescarEstadoUpd().then(e => { if (!e || e.fase === 'nada') pintarBotonUpd('Buscar actualizaciones'); }), 4000);
  if (descargando || manual) {
    avisar(`No se pudo ${descargando ? 'descargar' : 'comprobar'} la actualización. Comprueba la conexión a Internet y vuelve a intentarlo desde Ajustes → Actualizaciones (o la próxima vez que abras la app).${msg ? `\n\nDetalle: ${msg}` : ''}`,
      { titulo: 'Actualización' });
  }
});

// Por si el aviso llegó antes de que la pantalla estuviera lista
refrescarEstadoUpd().then(e => {
  if (!e) return;
  if (e.fase === 'disponible') mostrarActualizacionDisponible(e, false);
  else if (e.fase === 'descargada') mostrarActualizacionLista(e);
});
