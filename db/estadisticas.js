// ─── ESTADÍSTICAS DEL DASHBOARD Y TIMELINE DE VEHÍCULO ───────────────────────
// Resumen general, tarjetas opcionales del dashboard y timeline de prácticas
// de un vehículo (con detección de huecos/solapamientos frente a la anterior).

const { load, filtrarPorSucursal, esPracticaEnCurso, esPracticaSinCerrar } = require('./core');
const { getSolapamientos } = require('./km-algoritmos');
const { getDeudas } = require('./pagos');
const { getEstadisticasAprobados } = require('./convocatorias');

// sucursalId opcional: sin argumento (o "Todas las sucursales" en el
// selector) cuenta todo, igual que antes de sucursales.
function getResumen(sucursalId) {
  const d = load();
  const vehiculos = filtrarPorSucursal(d.vehiculos, sucursalId);
  const alumnos = filtrarPorSucursal(d.alumnos, sucursalId);
  const practicas = filtrarPorSucursal(d.practicas, sucursalId);
  const sinKm = practicas.filter(p => p.km_inicial === 0 && p.km_final === 0).length;
  // Contar solapamientos (no filtrado por sucursal: fuera del alcance de esta
  // funcionalidad, la detección de conflictos es global)
  const conflictos = getSolapamientos();
  return {
    vehiculos: vehiculos.length,
    alumnos: alumnos.length,
    practicas: practicas.length,
    sinKm,
    solapamientos: conflictos.length
  };
}

/**
 * Estadísticas opcionales del dashboard (tarjetas activables por el usuario).
 * `hoy` es opcional 'YYYY-MM-DD'; por defecto la fecha local de hoy.
 * `sucursalId` opcional: sin argumento cuenta todas las sucursales.
 */
function getStatsDashboard(hoy, sucursalId) {
  const d = load();
  if (!hoy) {
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    hoy = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  const mesActual = hoy.slice(0, 7);
  const practicas = filtrarPorSucursal(d.practicas, sucursalId);

  const practicasHoy = practicas.filter(p => p.fecha === hoy).length;

  const kmMesRaw = practicas
    .filter(p => p.fecha && p.fecha.slice(0, 7) === mesActual)
    .reduce((sum, p) => sum + Math.max(0, (p.km_final || 0) - (p.km_inicial || 0)), 0);
  const kmMes = Math.round(kmMesRaw * 10) / 10;

  // El dinero en este proyecto se guarda en euros con decimales (no céntimos
  // enteros): getDeudas().saldo ya viene en euros, igual que fmt() lo pinta
  // en loadDeudas() sin dividir entre 100.
  const deudas = getDeudas(sucursalId).filter(dd => dd.saldo > 0);
  const totalAdeudado = deudas.reduce((sum, dd) => sum + dd.saldo, 0);
  const alumnosConDeuda = deudas.length;

  return { practicasHoy, kmMes, totalAdeudado, alumnosConDeuda };
}

/**
 * Estadísticas por profesor (pantalla Profesores). `desde`/`hasta` opcionales
 * 'YYYY-MM-DD': si se pasan, filtran por fecha de la práctica (inclusive,
 * comparación de strings ISO). Devuelve una entrada por CADA profesor no
 * borrado (incluidos los que no tienen prácticas en el rango, con todo a
 * 0/null), ordenadas por num_practicas descendente. Solo lectura, no marca sync.
 */
function getStatsProfesores(desde, hasta) {
  const d = load();
  const alumnosBorrados = new Set(d.alumnos.filter(a => a.deleted).map(a => a.id));

  const practicasValidas = d.practicas.filter(p =>
    !p.deleted &&
    !alumnosBorrados.has(p.alumno_id) &&
    (!desde || p.fecha >= desde) &&
    (!hasta || p.fecha <= hasta)
  );

  return d.profesores
    .filter(p => !p.deleted)
    .map(p => {
      const propias = practicasValidas.filter(x => x.profesor_id === p.id);
      const kmTotales = propias
        .filter(x => !(x.km_inicial === 0 && x.km_final === 0))
        .reduce((sum, x) => sum + (x.km_final - x.km_inicial), 0);
      const numAlumnos = new Set(propias.map(x => x.alumno_id)).size;
      const practicasPista = propias.filter(x => x.tipo === 'pista').length;
      const practicasCirculacion = propias.filter(x => x.tipo !== 'pista').length;
      const ultimaPractica = propias.reduce((max, x) => (!max || x.fecha > max) ? x.fecha : max, null);
      return {
        id: p.id,
        nombre: p.nombre,
        num_practicas: propias.length,
        km_totales: Math.round(kmTotales * 10) / 10,
        num_alumnos: numAlumnos,
        practicas_pista: practicasPista,
        practicas_circulacion: practicasCirculacion,
        ultima_practica: ultimaPractica,
      };
    })
    .sort((a, b) => b.num_practicas - a.num_practicas);
}

/**
 * Datos agregados para los gráficos configurables del dashboard, en una sola
 * llamada. `meses` (por defecto 12) es el nº de meses hacia atrás desde el
 * mes actual (incluido), en formato 'YYYY-MM'; los meses sin actividad
 * aparecen igualmente, con los valores a 0. `sucursalId` opcional: sin
 * argumento agrega todas las sucursales. Solo lectura, no marca sync.
 */
function getDatosGraficos(meses, sucursalId) {
  const n = meses || 12;
  const d = load();

  const pad = x => String(x).padStart(2, '0');
  const hoyDate = new Date();
  const listaMeses = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(hoyDate.getFullYear(), hoyDate.getMonth() - i, 1);
    listaMeses.push(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`);
  }

  const practicasValidas = filtrarPorSucursal(d.practicas, sucursalId).filter(p => !p.deleted);
  const alumnosSucursal = filtrarPorSucursal(d.alumnos, sucursalId);
  const idsAlumnosSucursal = sucursalId ? new Set(alumnosSucursal.map(a => a.id)) : null;
  const pagosValidos = d.pagos
    .filter(p => !p.deleted)
    .filter(p => !idsAlumnosSucursal || idsAlumnosSucursal.has(p.alumno_id));
  // Las prácticas sin km (ambos a 0) no aportan kilómetros al total.
  const conKm = p => !(p.km_inicial === 0 && p.km_final === 0);

  const kmPorMes = listaMeses.map(mes => {
    const km = practicasValidas
      .filter(p => p.fecha && p.fecha.slice(0, 7) === mes && conKm(p))
      .reduce((sum, p) => sum + Math.max(0, (p.km_final || 0) - (p.km_inicial || 0)), 0);
    return { mes, km: Math.round(km * 10) / 10 };
  });

  const practicasPorMes = listaMeses.map(mes => {
    const delMes = practicasValidas.filter(p => p.fecha && p.fecha.slice(0, 7) === mes);
    const pista = delMes.filter(p => p.tipo === 'pista').length;
    const circulacion = delMes.length - pista;
    return { mes, total: delMes.length, pista, circulacion };
  });

  const ingresosPorMes = listaMeses.map(mes => {
    const cobrado = pagosValidos
      .filter(p => p.fecha && p.fecha.slice(0, 7) === mes)
      .reduce((sum, p) => sum + p.cantidad, 0);
    return { mes, cobrado: Math.round(cobrado * 100) / 100 };
  });

  const porProfesor = filtrarPorSucursal(d.profesores, sucursalId)
    .filter(p => !p.deleted)
    .map(p => {
      const propias = practicasValidas.filter(x => x.profesor_id === p.id);
      const km = propias.filter(conKm).reduce((sum, x) => sum + (x.km_final - x.km_inicial), 0);
      return { nombre: p.nombre, num_practicas: propias.length, km: Math.round(km * 10) / 10 };
    })
    .sort((a, b) => b.num_practicas - a.num_practicas);

  const porVehiculo = filtrarPorSucursal(d.vehiculos, sucursalId)
    .filter(v => !v.deleted)
    .map(v => {
      const propias = practicasValidas.filter(x => x.vehiculo_id === v.id);
      const km = propias.filter(conKm).reduce((sum, x) => sum + (x.km_final - x.km_inicial), 0);
      return { nombre: v.nombre, num_practicas: propias.length, km: Math.round(km * 10) / 10 };
    })
    .sort((a, b) => b.num_practicas - a.num_practicas);

  return { kmPorMes, practicasPorMes, porProfesor, porVehiculo, ingresosPorMes };
}

/**
 * Devuelve todas las prácticas de un vehículo ordenadas por km_inicial,
 * con datos de alumno y flag de solapamiento con la anterior.
 */
function getTimelineVehiculo(vehiculo_id) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return [];

  const practicas = d.practicas
    .filter(p => p.vehiculo_id === vid)
    .sort((a, b) => {
      // Las sin km van al final
      const aSinKm = a.km_inicial === 0 && a.km_final === 0;
      const bSinKm = b.km_inicial === 0 && b.km_final === 0;
      if (aSinKm && !bSinKm) return 1;
      if (!aSinKm && bSinKm) return -1;
      if (aSinKm && bSinKm) return a.fecha.localeCompare(b.fecha);
      return a.km_inicial - b.km_inicial || a.fecha.localeCompare(b.fecha);
    });

  return practicas.map((p, i) => {
    const alumno = d.alumnos.find(a => a.id === p.alumno_id);
    const sinKm = p.km_inicial === 0 && p.km_final === 0;
    // Detectar hueco o solapamiento con la práctica anterior con km
    let gap = null; // null=ok, >0=hueco, <0=solapa
    if (!sinKm && i > 0) {
      const prevConKm = practicas.slice(0, i).reverse().find(x => !(x.km_inicial === 0 && x.km_final === 0));
      if (prevConKm) {
        const diff = Math.round((p.km_inicial - prevConKm.km_final) * 10) / 10;
        if (diff !== 0) gap = diff;
      }
    }
    return {
      ...p,
      alumno_nombre: alumno ? alumno.nombre : '?',
      sin_km: sinKm,
      gap
    };
  });
}

// ─── SEMÁFORO DE EXAMEN ───────────────────────────────────────────────────
// Heurística v1, determinista y explicable (sin IA externa): a partir del
// historial de prácticas de cada alumno, estima si está listo para el examen
// práctico. Umbrales ajustables — heurística v1, ajustable.
const SEMAFORO_MIN_PRACTICAS_VERDE = 20;
const SEMAFORO_MAX_DIAS_SIN_PRACTICA_VERDE = 21;
const SEMAFORO_MIN_PRACTICAS_AMBAR = 10; // por debajo de esto, directo a rojo

// Calcula el nivel/motivo de un alumno a partir de sus prácticas no
// borradas. Recibe el array ya filtrado (evita recalcular filtros por
// alumno cuando se procesan todos a la vez).
// `previas` = punto de partida del alumno (clases/km hechos antes de usar la
// app): cuentan igual que las registradas para decidir si está listo.
function _calcularSemaforo(practicasAlumno, previas = {}) {
  const nPracticas = practicasAlumno.length + (previas.clases_previas > 0 ? previas.clases_previas : 0);
  const kmTotalesRaw = practicasAlumno
    .filter(p => p.km_inicial > 0 && p.km_final > 0)
    .reduce((sum, p) => sum + (p.km_final - p.km_inicial), 0) + (previas.km_previos > 0 ? previas.km_previos : 0);
  const kmTotales = Math.round(kmTotalesRaw * 10) / 10;

  let diasDesdeUltima = null;
  const ultimaFecha = practicasAlumno.reduce((max, p) => (p.fecha && (!max || p.fecha > max)) ? p.fecha : max, null);
  if (ultimaFecha) {
    const [y, m, dd] = ultimaFecha.split('-').map(Number);
    const msPorDia = 24 * 60 * 60 * 1000;
    const hoy = new Date();
    const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const ultimaUTC = Date.UTC(y, m - 1, dd);
    diasDesdeUltima = Math.round((hoyUTC - ultimaUTC) / msPorDia);
  }

  let nivel, motivo;
  if (nPracticas === 0) {
    nivel = 'rojo';
    motivo = 'sin prácticas';
  } else if (nPracticas < SEMAFORO_MIN_PRACTICAS_AMBAR) {
    nivel = 'rojo';
    motivo = `${nPracticas} prácticas — faltan clases`;
  } else if (nPracticas >= SEMAFORO_MIN_PRACTICAS_VERDE && diasDesdeUltima !== null && diasDesdeUltima <= SEMAFORO_MAX_DIAS_SIN_PRACTICA_VERDE) {
    nivel = 'verde';
    motivo = `${nPracticas} prácticas, al día`;
  } else if (nPracticas >= SEMAFORO_MIN_PRACTICAS_VERDE) {
    nivel = 'ambar';
    motivo = `${nPracticas} prácticas, última hace ${diasDesdeUltima} días — repasar`;
  } else {
    nivel = 'ambar';
    motivo = `${nPracticas} prácticas — casi listo`;
  }

  return { nivel, motivo, nPracticas, kmTotales, diasDesdeUltima };
}

/**
 * Semáforo de examen de TODOS los alumnos no borrados (v1: heurística
 * determinista, sin IA). Solo lectura, no marca sync. Evita N+1: una sola
 * pasada por las prácticas, agrupadas por alumno.
 */
function getSemaforoExamen() {
  const d = load();
  const alumnos = d.alumnos.filter(a => !a.deleted);
  const practicasPorAlumno = new Map();
  for (const p of d.practicas) {
    if (p.deleted) continue;
    if (!practicasPorAlumno.has(p.alumno_id)) practicasPorAlumno.set(p.alumno_id, []);
    practicasPorAlumno.get(p.alumno_id).push(p);
  }

  return alumnos.map(a => {
    const propias = practicasPorAlumno.get(a.id) || [];
    const { nivel, motivo, nPracticas, kmTotales, diasDesdeUltima } = _calcularSemaforo(propias, a);
    return { alumno_id: a.id, nombre: a.nombre, nivel, motivo, nPracticas, kmTotales, diasDesdeUltima };
  });
}

/**
 * Semáforo de examen de un solo alumno. Devuelve null si el alumno no
 * existe o está borrado.
 */
function getSemaforoAlumno(alumno_id) {
  const d = load();
  const aid = parseInt(alumno_id);
  const a = d.alumnos.find(x => x.id === aid && !x.deleted);
  if (!a) return null;
  const propias = d.practicas.filter(p => p.alumno_id === aid && !p.deleted);
  const { nivel, motivo, nPracticas, kmTotales, diasDesdeUltima } = _calcularSemaforo(propias, a);
  return { alumno_id: a.id, nombre: a.nombre, nivel, motivo, nPracticas, kmTotales, diasDesdeUltima };
}

// ─── ALUMNOS EN RIESGO DE ABANDONO ────────────────────────────────────────
// Heurística v1, determinista y explicable: alumnos que ya empezaron a dar
// clases pero llevan tiempo sin venir. Umbral ajustable — heurística v1,
// ajustable. Los alumnos con 0 prácticas no cuentan como riesgo (son "sin
// empezar", otra categoría distinta).
const RIESGO_DIAS_INACTIVIDAD = 30;

/**
 * Alumnos en riesgo de abandono (>= 1 práctica no borrada y la más reciente
 * hace más de RIESGO_DIAS_INACTIVIDAD días). Solo lectura, no marca sync.
 * Ordenado por diasSinPractica descendente (los más "fríos" primero).
 */
function getAlumnosEnRiesgo() {
  const d = load();
  const alumnos = d.alumnos.filter(a => !a.deleted);
  const practicasPorAlumno = new Map();
  for (const p of d.practicas) {
    if (p.deleted) continue;
    if (!practicasPorAlumno.has(p.alumno_id)) practicasPorAlumno.set(p.alumno_id, []);
    practicasPorAlumno.get(p.alumno_id).push(p);
  }

  const msPorDia = 24 * 60 * 60 * 1000;
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const enRiesgo = [];
  for (const a of alumnos) {
    const propias = practicasPorAlumno.get(a.id) || [];
    const nPracticas = propias.length;
    if (nPracticas === 0) continue; // "sin empezar", no es riesgo de abandono

    const ultimaFecha = propias.reduce((max, p) => (p.fecha && (!max || p.fecha > max)) ? p.fecha : max, null);
    if (!ultimaFecha) continue; // fechas ausentes/raras: no se puede calcular, se descarta sin romper

    const partes = ultimaFecha.split('-').map(Number);
    if (partes.length !== 3 || partes.some(Number.isNaN)) continue; // fecha rara, se descarta
    const [y, m, dd] = partes;
    const ultimaUTC = Date.UTC(y, m - 1, dd);
    const diasSinPractica = Math.round((hoyUTC - ultimaUTC) / msPorDia);
    if (!Number.isFinite(diasSinPractica) || diasSinPractica <= RIESGO_DIAS_INACTIVIDAD) continue;

    enRiesgo.push({ alumno_id: a.id, nombre: a.nombre, nPracticas, diasSinPractica, ultimaFecha });
  }

  return enRiesgo.sort((a, b) => b.diasSinPractica - a.diasSinPractica);
}

// ─── ANÁLISIS DE USO Y COSTE DE COMBUSTIBLE POR VEHÍCULO ──────────────────
// Heurística v1, determinista y sin datos externos: a partir de los km ya
// registrados en las prácticas, resume uso por vehículo (el coste en € se
// calcula en el renderer con el precio/consumo configurados en Ajustes).
const ANALISIS_VEHICULOS_DIAS = 30;

/**
 * Análisis de uso de TODOS los vehículos no borrados (v1: heurística
 * determinista, sin IA). Solo lectura, no marca sync. Ordenado por
 * kmTotales descendente.
 */
function getAnalisisVehiculos() {
  const d = load();
  const vehiculos = d.vehiculos.filter(v => !v.deleted);

  const msPorDia = 24 * 60 * 60 * 1000;
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const practicasPorVehiculo = new Map();
  for (const p of d.practicas) {
    if (p.deleted) continue;
    if (!practicasPorVehiculo.has(p.vehiculo_id)) practicasPorVehiculo.set(p.vehiculo_id, []);
    practicasPorVehiculo.get(p.vehiculo_id).push(p);
  }

  const conKm = p => p.km_final != null && p.km_inicial != null && p.km_final >= p.km_inicial && !(p.km_inicial === 0 && p.km_final === 0);

  const resultado = vehiculos.map(v => {
    const propias = practicasPorVehiculo.get(v.id) || [];
    const nPracticas = propias.length;

    const kmTotalesRaw = propias.filter(conKm).reduce((sum, p) => sum + (p.km_final - p.km_inicial), 0);
    const kmTotales = Math.round(kmTotalesRaw * 10) / 10;

    const kmUltimos30Raw = propias
      .filter(conKm)
      .filter(p => {
        if (!p.fecha) return false;
        const partes = p.fecha.split('-').map(Number);
        if (partes.length !== 3 || partes.some(Number.isNaN)) return false;
        const [y, m, dd] = partes;
        const fechaUTC = Date.UTC(y, m - 1, dd);
        const dias = Math.round((hoyUTC - fechaUTC) / msPorDia);
        return dias >= 0 && dias <= ANALISIS_VEHICULOS_DIAS;
      })
      .reduce((sum, p) => sum + (p.km_final - p.km_inicial), 0);
    const kmUltimos30 = Math.round(kmUltimos30Raw * 10) / 10;

    const mediaKmPractica = nPracticas === 0 ? 0 : Math.round((kmTotales / nPracticas) * 10) / 10;

    return {
      vehiculo_id: v.id,
      nombre: v.nombre,
      matricula: v.matricula,
      nPracticas,
      kmTotales,
      kmUltimos30,
      mediaKmPractica,
    };
  });

  return resultado.sort((a, b) => b.kmTotales - a.kmTotales);
}

// ─── INFORMES (agregador para la pantalla "Informes") ─────────────────────
// Junta en una sola llamada los datasets que ya calculan otras funciones de
// este archivo/módulo, filtrados por rango de fechas ('YYYY-MM-DD', ambos
// opcionales) y sucursal. Solo lectura, no marca sync. Defensivo: sin datos
// devuelve arrays vacíos y totales a 0, nunca lanza.
function _enRango(fecha, desde, hasta) {
  if (!fecha) return false;
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
}

function getInformes(desde, hasta, sucursalId) {
  const d = load();

  // Aprobados: getEstadisticasAprobados no acepta rango de fechas (es un
  // ratio histórico de convocatorias, no una foto del periodo) — se reutiliza
  // tal cual, filtrada solo por sucursal.
  const aprobados = getEstadisticasAprobados(sucursalId);

  // Ocupación por profesor: getStatsProfesores ya acepta desde/hasta, se
  // reutiliza y solo se remapea a las claves pedidas por el informe.
  const ocupacionProfesores = getStatsProfesores(desde, hasta).map(p => ({
    profesor_id: p.id,
    nombre: p.nombre,
    nPracticas: p.num_practicas,
    kmTotales: p.km_totales
  }));

  // Ocupación de vehículos: getAnalisisVehiculos no filtra por fecha, así
  // que aquí se recorren las prácticas del periodo directamente (mismo
  // criterio de "con km" que esa función).
  const vehiculos = filtrarPorSucursal(d.vehiculos, sucursalId).filter(v => !v.deleted);
  const practicasPeriodo = filtrarPorSucursal(d.practicas, sucursalId)
    .filter(p => !p.deleted && _enRango(p.fecha, desde, hasta));
  const conKm = p => p.km_final != null && p.km_inicial != null && p.km_final >= p.km_inicial && !(p.km_inicial === 0 && p.km_final === 0);
  const ocupacionVehiculos = vehiculos.map(v => {
    const propias = practicasPeriodo.filter(p => p.vehiculo_id === v.id);
    const nPracticas = propias.length;
    const kmTotalesRaw = propias.filter(conKm).reduce((sum, p) => sum + (p.km_final - p.km_inicial), 0);
    const kmTotales = Math.round(kmTotalesRaw * 10) / 10;
    const mediaKmPractica = nPracticas === 0 ? 0 : Math.round((kmTotales / nPracticas) * 10) / 10;
    return { vehiculo_id: v.id, nombre: v.nombre, matricula: v.matricula, nPracticas, kmTotales, mediaKmPractica };
  }).sort((a, b) => b.kmTotales - a.kmTotales);

  // Ingresos: pagos del periodo (filtrados por su propio sucursal_id, igual
  // que getDatosGraficos hace con la práctica/alumno).
  const pagosPeriodo = filtrarPorSucursal(d.pagos, sucursalId)
    .filter(p => !p.deleted && _enRango(p.fecha, desde, hasta));
  const total = Math.round(pagosPeriodo.reduce((sum, p) => sum + p.cantidad, 0) * 100) / 100;
  const porMesMap = new Map();
  for (const p of pagosPeriodo) {
    const mes = p.fecha.slice(0, 7);
    porMesMap.set(mes, (porMesMap.get(mes) || 0) + p.cantidad);
  }
  const porMes = Array.from(porMesMap.entries())
    .map(([mes, tot]) => ({ mes, total: Math.round(tot * 100) / 100 }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
  const ingresos = { total, nPagos: pagosPeriodo.length, porMes };

  // Deudas: getDeudas es una foto del saldo actual, no un dato de periodo —
  // se reutiliza tal cual, filtrada solo por sucursal (mismo criterio que
  // getStatsDashboard).
  const conDeuda = getDeudas(sucursalId).filter(dd => dd.saldo > 0);
  const deudas = {
    totalAdeudado: Math.round(conDeuda.reduce((sum, dd) => sum + dd.saldo, 0) * 100) / 100,
    nAlumnos: conDeuda.length,
    detalle: conDeuda.map(dd => ({ alumno_id: dd.alumno_id, nombre: dd.alumno_nombre, saldo: dd.saldo }))
  };

  return {
    periodo: { desde: desde || null, hasta: hasta || null },
    aprobados,
    ocupacionProfesores,
    ocupacionVehiculos,
    ingresos,
    deudas
  };
}

// ─── LIBRO DE VENTAS / IVA (tarea D5, exportación contable) ───────────────
// Desglose fiscal de los pagos ya registrados (solo lectura, no marca sync):
// trata `cantidad` como importe TOTAL con IVA incluido y calcula base+cuota
// hacia atrás. NO es una factura ni sustituye a la gestoría — es un apoyo
// para exportar a la contabilidad. Redondeo a 2 decimales en cada línea y en
// los totales (evita errores de coma flotante al sumar céntimos).
function round2(x) {
  return Math.round(x * 100) / 100;
}

function getLibroVentas(desde, hasta, sucursalId, ivaPorcentaje) {
  const d = load();
  const iva = (ivaPorcentaje === null || ivaPorcentaje === undefined || isNaN(ivaPorcentaje)) ? 21 : ivaPorcentaje;

  const pagosPeriodo = filtrarPorSucursal(d.pagos, sucursalId)
    .filter(p => !p.deleted && _enRango(p.fecha, desde, hasta));

  const lineas = pagosPeriodo.map(p => {
    const alumno = d.alumnos.find(a => a.id === p.alumno_id);
    const total = p.cantidad;
    const base = round2(total / (1 + iva / 100));
    const cuota_iva = round2(total - base);
    return {
      fecha: p.fecha,
      alumno_id: p.alumno_id,
      alumno_nombre: alumno ? alumno.nombre : '?',
      dni: alumno ? (alumno.dni || null) : null,
      concepto: p.nota || 'Cobro',
      forma_pago: p.forma_pago || null,
      base,
      iva_porcentaje: iva,
      cuota_iva,
      total
    };
  });

  const totales = lineas.reduce((acc, l) => {
    acc.base += l.base;
    acc.cuota_iva += l.cuota_iva;
    acc.total += l.total;
    acc.nLineas += 1;
    return acc;
  }, { base: 0, cuota_iva: 0, total: 0, nLineas: 0 });
  totales.base = round2(totales.base);
  totales.cuota_iva = round2(totales.cuota_iva);
  totales.total = round2(totales.total);

  return {
    periodo: { desde: desde || null, hasta: hasta || null },
    iva_porcentaje: iva,
    lineas,
    totales
  };
}


// ─── PANEL (pantalla de inicio del rediseño) ────────────────────────────────
// Datos agregados de la pantalla "Panel" en UNA llamada: cifras del día y del
// mes, prácticas por día, coches en ruta, bonos a punto de agotarse y próximos
// exámenes. Solo lectura, no marca sync.
//  · "en curso" = práctica de hoy con km inicial y sin km final (la abre el
//    flujo móvil al empezar una clase y se cierra al fijar el km final).
//  · "programadas hoy" = reservas de hoy no canceladas (agenda); si hay más
//    prácticas hechas que reservas, se toma el mayor de los dos.
const ESTADOS_ALUMNO_FUERA_PANEL = ['baja', 'aprobado', 'apto', 'no_apto'];

function getPanel(hoy, sucursalId) {
  const d = load();
  const pad = n => String(n).padStart(2, '0');
  if (!hoy) {
    const now = new Date();
    hoy = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  const mes = hoy.slice(0, 7);
  const [anio, nMes, diaHoy] = hoy.split('-').map(Number);

  const practicas = filtrarPorSucursal(d.practicas, sucursalId).filter(p => !p.deleted);
  const alumnos = filtrarPorSucursal(d.alumnos, sucursalId).filter(a => !a.deleted);
  const nombreAlumno = new Map(d.alumnos.map(a => [a.id, a.nombre]));
  const veh = new Map(d.vehiculos.map(v => [v.id, v]));
  const prof = new Map(d.profesores.map(x => [x.id, x.nombre]));
  const conKm = p => !(p.km_inicial === 0 && p.km_final === 0) && !!p.km_final;
  const kmDe = p => (!conKm(p) || !p.km_final) ? 0 : Math.max(0, p.km_final - p.km_inicial);

  const delDia = practicas.filter(p => p.fecha === hoy);
  const delMes = practicas.filter(p => p.fecha && p.fecha.slice(0, 7) === mes);
  const kmMes = Math.round(delMes.reduce((s, p) => s + kmDe(p), 0) * 10) / 10;
  const mediaKmPractica = delMes.length ? Math.round((kmMes / delMes.length) * 10) / 10 : 0;

  const reservasHoy = (d.reservas || []).filter(r => !r.deleted && r.fecha === hoy && r.estado !== 'cancelada'
    && (!sucursalId || r.sucursal_id === parseInt(sucursalId))).length;
  const programadasHoy = Math.max(reservasHoy, delDia.length);

  // Hueco de km antes de empezar: km_inicial menos el mayor km_final ya cerrado del mismo coche.
  const hueco = p => {
    const previos = practicas
      .filter(x => x.id !== p.id && x.vehiculo_id === p.vehiculo_id && conKm(x) && x.km_final <= p.km_inicial)
      .map(x => x.km_final);
    return previos.length ? Math.max(0, p.km_inicial - Math.max(...previos)) : 0;
  };
  const enCurso = delDia.filter(p => esPracticaEnCurso(p, hoy)).map(p => {
    const v = veh.get(p.vehiculo_id) || {};
    return {
      practica_id: p.id, alumno_id: p.alumno_id, alumno: nombreAlumno.get(p.alumno_id) || '—',
      matricula: v.matricula || '', vehiculo: v.nombre || '',
      profesor: prof.get(p.profesor_id) || '', hora_inicio: p.hora_inicio || null,
      km_inicial: p.km_inicial, duracion_min: p.duracion_min || 45, hueco_km: hueco(p)
    };
  }).sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));

  // Prácticas por día del mes (hasta hoy). Los fines de semana solo cuentan si hubo actividad.
  const porDia = [];
  let sumaLaborables = 0, diasLaborables = 0;
  for (let dia = 1; dia <= diaHoy; dia++) {
    const fecha = `${anio}-${pad(nMes)}-${pad(dia)}`;
    const dow = new Date(anio, nMes - 1, dia).getDay();
    const n = practicas.filter(p => p.fecha === fecha).length;
    const finde = dow === 0 || dow === 6;
    if (finde && n === 0) continue;
    porDia.push({ dia, fecha, n, finde, hoy: dia === diaHoy });
    if (!finde && dia < diaHoy) { sumaLaborables += n; diasLaborables++; }
  }
  const mediaPorDia = diasLaborables ? Math.round((sumaLaborables / diasLaborables) * 10) / 10 : 0;

  const pendientes = (d.presentaciones || []).filter(x => !x.deleted && x.resultado === 'pendiente' && x.fecha >= hoy);
  const idsConExamen = new Set(pendientes.map(x => x.alumno_id));
  const alumnosActivos = alumnos.filter(a => !ESTADOS_ALUMNO_FUERA_PANEL.includes(a.estado || 'activo'));

  const nPracticasAlumno = new Map();
  for (const p of practicas) nPracticasAlumno.set(p.alumno_id, (nPracticasAlumno.get(p.alumno_id) || 0) + 1);
  const proximosExamenes = pendientes.slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 6)
    .map(x => ({
      id: x.id, fecha: x.fecha, tipo: x.tipo, alumno_id: x.alumno_id,
      alumno: nombreAlumno.get(x.alumno_id) || '—',
      profesor: prof.get(x.profesor_id) || '',
      clases: nPracticasAlumno.get(x.alumno_id) || 0
    }));

  const bonosCasiAgotados = [];
  for (const b of (d.bonos || []).filter(x => !x.deleted && x.estado === 'activo')) {
    const saldo = b.n_clases - b.n_usadas;
    if (b.fecha_caducidad && b.fecha_caducidad < hoy) continue;
    if (saldo > 2 || b.n_clases <= 0) continue;
    const al = alumnos.find(a => a.id === b.alumno_id);
    if (!al) continue;
    const ex = pendientes.filter(x => x.alumno_id === al.id).sort((a, c) => a.fecha.localeCompare(c.fecha))[0];
    bonosCasiAgotados.push({
      bono_id: b.id, alumno_id: al.id, alumno: al.nombre,
      usadas: b.n_usadas, total: b.n_clases, saldo,
      examen: ex ? ex.fecha : null
    });
  }

  const resumen = getResumen(sucursalId);
  return {
    hoy,
    vehiculos: resumen.vehiculos,
    practicasHoy: delDia.length,
    programadasHoy,
    enCursoAhora: enCurso.length,
    enCurso,
    kmMes, practicasMes: delMes.length, mediaKmPractica,
    alumnosActivos: alumnosActivos.length,
    alumnosConExamen: idsConExamen.size,
    sinKm: resumen.sinKm,
    solapamientos: resumen.solapamientos,
    porDia, mediaPorDia,
    proximosExamenes,
    bonosCasiAgotados
  };
}

// ─── PANEL DE VEHÍCULOS (pantalla Vehículos del rediseño) ───────────────────
// Por vehículo: estado ahora (en práctica / libre), km del mes repartidos entre
// "en prácticas" y "sin asignar" (lo que el cuentakilómetros avanzó sin que lo
// recoja ninguna práctica), ITV y la línea de continuidad de HOY (prácticas
// hechas, en curso, programadas y huecos de km). Solo lectura, no marca sync.
function _sumarMin(hhmm, min) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function getPanelVehiculos(hoy, sucursalId, duracionMin) {
  const d = load();
  const pad = n => String(n).padStart(2, '0');
  if (!hoy) {
    const now = new Date();
    hoy = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  const dur = duracionMin > 0 ? duracionMin : 45;
  const mes = hoy.slice(0, 7);
  const conKm = p => !(p.km_inicial === 0 && p.km_final === 0) && !!p.km_final;
  const nombreAlumno = new Map(d.alumnos.map(a => [a.id, a.nombre]));
  const nombreProf = new Map(d.profesores.map(x => [x.id, x.nombre]));
  const vivas = d.practicas.filter(p => !p.deleted);

  const vehiculos = filtrarPorSucursal(d.vehiculos, sucursalId).filter(v => !v.deleted).map(v => {
    const propias = vivas.filter(p => p.vehiculo_id === v.id);
    const delMes = propias.filter(p => p.fecha && p.fecha.slice(0, 7) === mes);
    const kmPracticas = Math.round(delMes.filter(conKm).reduce((s, p) => s + Math.max(0, p.km_final - p.km_inicial), 0));

    // Odómetro al empezar el mes: km final de la última práctica anterior; si no la hay, el menor km inicial del mes.
    const previas = propias.filter(conKm).filter(p => p.fecha < mes + '-01')
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
    let kmInicioMes = previas.length ? previas[0].km_final : null;
    if (kmInicioMes == null) {
      const kis = delMes.filter(conKm).map(p => p.km_inicial);
      kmInicioMes = kis.length ? Math.min(...kis) : null;
    }
    const recorridos = kmInicioMes == null ? 0 : Math.max(0, v.km_actual - kmInicioMes);
    const sinAsignar = Math.max(0, recorridos - kmPracticas);

    // Profesor habitual: el que más prácticas del mes tiene en este coche (o de siempre si no hay).
    const cuenta = new Map();
    (delMes.length ? delMes : propias).forEach(p => { if (p.profesor_id != null) cuenta.set(p.profesor_id, (cuenta.get(p.profesor_id) || 0) + 1); });
    const top = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];

    // ITV: la más próxima (o ya vencida) no completada
    const itv = (d.vencimientos || [])
      .filter(x => !x.deleted && !x.completado && x.entidad_tipo === 'vehiculo' && x.entidad_id === v.id && /itv/i.test(x.tipo || ''))
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))[0];
    let itvInfo = null;
    if (itv) {
      const dias = Math.round((Date.UTC(...itv.fecha_vencimiento.split('-').map((n, i) => i === 1 ? n - 1 : +n)) - Date.UTC(...hoy.split('-').map((n, i) => i === 1 ? n - 1 : +n))) / 86400000);
      itvInfo = { fecha: itv.fecha_vencimiento, dias, vencida: dias < 0 };
    }

    // Línea de hoy. Fin de cada clase: la hora de fin guardada (la pone el
    // móvil al cerrarla) si no es anterior al inicio; si no la hay, inicio +
    // minutos por clase, marcado `fin_estimado` para que la pantalla lo acorte
    // si la siguiente clase del coche empezó antes (antes se usaba siempre la
    // estimada y dos clases a menos de 45 min se dibujaban una encima de otra).
    const deHoy = propias.filter(p => p.fecha === hoy).sort((a, b) => (a.hora_inicio || '99').localeCompare(b.hora_inicio || '99') || a.id - b.id);
    const finReal = p => (p.hora_inicio && p.hora_fin && p.hora_fin >= p.hora_inicio ? p.hora_fin : null);
    const finDe = p => finReal(p) || _sumarMin(p.hora_inicio, dur);
    const bloques = [];
    let anterior = null;
    for (const p of deHoy) {
      if (anterior && conKm(anterior) && conKm(p) && p.km_inicial > anterior.km_final) {
        bloques.push({ tipo: 'hueco', km: p.km_inicial - anterior.km_final, inicio: anterior.hora_inicio ? finDe(anterior) : null, fin: p.hora_inicio || null });
      } else if (anterior && conKm(anterior) && esPracticaEnCurso(p, hoy) && p.km_inicial > anterior.km_final) {
        bloques.push({ tipo: 'hueco', km: p.km_inicial - anterior.km_final, inicio: anterior.hora_inicio ? finDe(anterior) : null, fin: p.hora_inicio || null });
      }
      bloques.push({
        tipo: esPracticaEnCurso(p, hoy) ? 'curso' : 'hecha', practica_id: p.id,
        inicio: p.hora_inicio || null, fin: finDe(p), fin_estimado: !!p.hora_inicio && !finReal(p),
        km: conKm(p) ? Math.max(0, p.km_final - p.km_inicial) : 0,
        alumno: nombreAlumno.get(p.alumno_id) || '—'
      });
      anterior = p;
    }
    // Programadas hoy (reservas vigentes de este coche que aún no tienen práctica de ese alumno)
    const yaHechos = new Set(deHoy.map(p => p.alumno_id));
    (d.reservas || []).filter(r => !r.deleted && r.fecha === hoy && r.vehiculo_id === v.id && ['solicitada', 'confirmada'].includes(r.estado) && !yaHechos.has(r.alumno_id))
      .forEach(r => bloques.push({ tipo: 'prog', inicio: r.hora_inicio || null, fin: _sumarMin(r.hora_inicio, r.duracion_min || dur), fin_estimado: !r.duracion_min, km: 0, alumno: nombreAlumno.get(r.alumno_id) || '—' }));
    bloques.sort((a, b) => (a.inicio || '99').localeCompare(b.inicio || '99'));

    const enCurso = deHoy.find(p => esPracticaEnCurso(p, hoy));
    const ultima = deHoy.filter(p => !esPracticaEnCurso(p, hoy)).pop();
    return {
      id: v.id, nombre: v.nombre, matricula: v.matricula || '', km_actual: v.km_actual,
      en_practica: !!enCurso,
      registro_hora: enCurso ? enCurso.hora_inicio || null : (ultima ? ultima.hora_inicio || null : null),
      profesor_habitual: top ? nombreProf.get(top[0]) || null : null,
      km_inicio_mes: kmInicioMes,
      recorridos_mes: Math.round(recorridos),
      km_en_practicas_mes: kmPracticas,
      sin_asignar_mes: Math.round(sinAsignar),
      practicas_mes: delMes.length,
      km_por_practica: delMes.filter(conKm).length ? Math.round((kmPracticas / delMes.filter(conKm).length) * 10) / 10 : 0,
      sin_km: propias.filter(p => p.km_inicial === 0 && p.km_final === 0).length,
      km_hoy: bloques.filter(b => b.tipo === 'hecha').reduce((s, b) => s + b.km, 0),
      hueco_hoy: bloques.filter(b => b.tipo === 'hueco').reduce((s, b) => s + b.km, 0),
      itv: itvInfo,
      bloques_hoy: bloques
    };
  });

  const total = vehiculos.reduce((t, v) => ({
    recorridos_mes: t.recorridos_mes + v.recorridos_mes,
    km_en_practicas_mes: t.km_en_practicas_mes + v.km_en_practicas_mes,
    sin_asignar_mes: t.sin_asignar_mes + v.sin_asignar_mes,
    practicas_mes: t.practicas_mes + v.practicas_mes
  }), { recorridos_mes: 0, km_en_practicas_mes: 0, sin_asignar_mes: 0, practicas_mes: 0 });
  total.km_por_practica = total.practicas_mes ? Math.round((total.km_en_practicas_mes / total.practicas_mes) * 10) / 10 : 0;

  return { hoy, mes, vehiculos, total };
}

module.exports = {
  getResumen, getStatsDashboard, getStatsProfesores, getDatosGraficos, getTimelineVehiculo,
  getSemaforoExamen, getSemaforoAlumno, getAlumnosEnRiesgo, getAnalisisVehiculos,
  getInformes, getLibroVentas, getPanel, getPanelVehiculos,
};
