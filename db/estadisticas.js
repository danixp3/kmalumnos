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

module.exports = {
  getResumen, getStatsDashboard, getStatsProfesores, getDatosGraficos, getTimelineVehiculo,
};
