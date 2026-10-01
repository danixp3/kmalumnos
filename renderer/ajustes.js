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

function guardarRangoPref(min, max) {
  try { localStorage.setItem(PREF_RANGO_KEY, JSON.stringify({ min, max })); } catch (e) {}
}

function aplicarRangoPref(idMin, idMax) {
  const pref = getRangoPref();
  const elMin = document.getElementById(idMin);
  const elMax = document.getElementById(idMax);
  if (elMin) elMin.value = pref.min;
  if (elMax) elMax.value = pref.max;
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

// Importe por defecto de matrícula y tasa (tarea D2, cargos automáticos):
// precargan el modal de "Añadir cargo/descuento" cuando se pulsan los
// botones rápidos "Añadir matrícula"/"Añadir tasa" en la ficha económica del
// alumno (renderer/alumnos.js). Mismo patrón localStorage que
// DURACION_CLASE_KEY.
const MATRICULA_IMPORTE_KEY = 'km_matricula_importe';
const TASA_IMPORTE_KEY = 'km_tasa_importe';

function getMatriculaImporte() {
  try {
    const raw = localStorage.getItem(MATRICULA_IMPORTE_KEY);
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) return n;
  } catch (e) {}
  return 0;
}

function getTasaImporte() {
  try {
    const raw = localStorage.getItem(TASA_IMPORTE_KEY);
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) return n;
  } catch (e) {}
  return 0;
}

function guardarCargosPrefDesdeAjustes() {
  const matricula = parseFloat(document.getElementById('pref-matricula').value);
  const tasa = parseFloat(document.getElementById('pref-tasa').value);
  try {
    if (!isNaN(matricula) && matricula >= 0) localStorage.setItem(MATRICULA_IMPORTE_KEY, String(matricula));
    if (!isNaN(tasa) && tasa >= 0) localStorage.setItem(TASA_IMPORTE_KEY, String(tasa));
  } catch (e) {}
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

function guardarCentroDatosDesdeAjustes() {
  const centro = {
    numero: document.getElementById('centro-numero')?.value.trim() || '',
    seccion: document.getElementById('centro-seccion')?.value.trim() || '',
    digito_control: document.getElementById('centro-digito')?.value.trim() || '',
    denominacion: document.getElementById('centro-denominacion')?.value.trim() || '',
    direccion: document.getElementById('centro-direccion')?.value.trim() || '',
    codigo_postal: document.getElementById('centro-cp')?.value.trim() || '',
    poblacion: document.getElementById('centro-poblacion')?.value.trim() || '',
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
  const elMatricula = document.getElementById('pref-matricula');
  if (elMatricula) elMatricula.value = getMatriculaImporte();
  const elTasa = document.getElementById('pref-tasa');
  if (elTasa) elTasa.value = getTasaImporte();
  const elIva = document.getElementById('pref-iva');
  if (elIva) elIva.value = getIvaPorcentaje();
  const centroDatos = getCentroDatos();
  const elCentroNumero = document.getElementById('centro-numero');
  if (elCentroNumero) elCentroNumero.value = centroDatos.numero || '';
  const elCentroSeccion = document.getElementById('centro-seccion');
  if (elCentroSeccion) elCentroSeccion.value = centroDatos.seccion || '';
  const elCentroDigito = document.getElementById('centro-digito');
  if (elCentroDigito) elCentroDigito.value = centroDatos.digito_control || '';
  const elCentroDenominacion = document.getElementById('centro-denominacion');
  if (elCentroDenominacion) elCentroDenominacion.value = centroDatos.denominacion || '';
  const elCentroDireccion = document.getElementById('centro-direccion');
  if (elCentroDireccion) elCentroDireccion.value = centroDatos.direccion || '';
  const elCentroCp = document.getElementById('centro-cp');
  if (elCentroCp) elCentroCp.value = centroDatos.codigo_postal || '';
  const elCentroPoblacion = document.getElementById('centro-poblacion');
  if (elCentroPoblacion) elCentroPoblacion.value = centroDatos.poblacion || '';
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
  { id: 'cobros', titulo: 'Cobros', desc: 'Importes de matrícula y tasa, IVA' },
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
    if (id === 'cobros') return `Matrícula ${Number(getMatriculaImporte()).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € · IVA ${getIvaPorcentaje()} %`;
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
  const cont = document.getElementById('content');
  if (cont) cont.scrollTop = 0;
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

// ─── AUTO-UPDATE ──────────────────────────────────────────────────────────────
function checkUpdates() {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.textContent = 'Buscando...';
  bar.style.pointerEvents = 'none';
  window.api.checkForUpdates();
}

window.api.onUpdateNotAvailable(() => {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.textContent = '✓ Ya tienes la última versión';
  bar.style.color = 'rgba(16,185,129,.7)';
  bar.style.pointerEvents = '';
  setTimeout(() => {
    label.textContent = 'Buscar actualizaciones';
    bar.style.color = '';
  }, 3000);
});

// Cuando el usuario acepta descargar
window.api.onUpdateDownloadStart((version) => {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.innerHTML = `<span style="display:flex;align-items:center;gap:6px">⬇ v${version} <span id="update-pct">0%</span></span>`;
  bar.style.color = 'rgba(99,102,241,.8)';
  bar.style.pointerEvents = 'none';
  
  // Mostrar barra de progreso
  showUpdateProgress(0);
});

window.api.onUpdateDownloadProgress((pct) => {
  const pctEl = document.getElementById('update-pct');
  if (pctEl) pctEl.textContent = `${pct}%`;
  showUpdateProgress(pct);
});

function showUpdateProgress(pct) {
  let progressBar = document.getElementById('update-progress-bar');
  if (!progressBar) {
    const bar = document.getElementById('update-bar');
    progressBar = document.createElement('div');
    progressBar.id = 'update-progress-bar';
    progressBar.style.cssText = 'position:absolute;bottom:0;left:0;height:3px;background:var(--accent);border-radius:0 2px 2px 0;transition:width .2s';
    bar.style.position = 'relative';
    bar.appendChild(progressBar);
  }
  progressBar.style.width = `${pct}%`;
  if (pct >= 100) {
    setTimeout(() => { if (progressBar) progressBar.remove(); }, 500);
  }
}

window.api.onUpdateDownloaded(() => {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.textContent = '✓ Descargada — clic para instalar';
  bar.style.color = 'rgba(16,185,129,.8)';
  bar.style.pointerEvents = '';
  bar.onclick = async () => {
    if (await confirmar('¿Instalar la actualización ahora?\n\nLa aplicación se cerrará y reiniciará.')) {
      window.api.installUpdate();
    }
  };
});

window.api.onUpdateError((msg) => {
  const label = document.getElementById('update-label');
  const bar   = document.getElementById('update-bar');
  label.textContent = '✕ Error al actualizar';
  bar.style.color = 'rgba(239,68,68,.7)';
  bar.style.pointerEvents = '';
  setTimeout(() => {
    label.textContent = 'Buscar actualizaciones';
    bar.style.color = '';
  }, 4000);
});

