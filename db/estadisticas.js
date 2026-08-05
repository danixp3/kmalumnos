// ─── ESTADÍSTICAS DEL DASHBOARD Y TIMELINE DE VEHÍCULO ───────────────────────
// Resumen general, tarjetas opcionales del dashboard y timeline de prácticas
// de un vehículo (con detección de huecos/solapamientos frente a la anterior).

const { load, filtrarPorSucursal } = require('./core');
const { getSolapamientos } = require('./km-algoritmos');
const { getDeudas } = require('./pagos');

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
function _calcularSemaforo(practicasAlumno) {
  const nPracticas = practicasAlumno.length;
  const kmTotalesRaw = practicasAlumno
    .filter(p => p.km_inicial > 0 && p.km_final > 0)
    .reduce((sum, p) => sum + (p.km_final - p.km_inicial), 0);
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
    const { nivel, motivo, nPracticas, kmTotales, diasDesdeUltima } = _calcularSemaforo(propias);
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
  const { nivel, motivo, nPracticas, kmTotales, diasDesdeUltima } = _calcularSemaforo(propias);
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

module.exports = {
  getResumen, getStatsDashboard, getStatsProfesores, getDatosGraficos, getTimelineVehiculo,
  getSemaforoExamen, getSemaforoAlumno, getAlumnosEnRiesgo, getAnalisisVehiculos,
};
