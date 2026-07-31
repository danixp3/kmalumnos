// ─── IMPORTACIÓN / EXPORTACIÓN / COMPARACIÓN DE CSV ──────────────────────────
// Importar prácticas desde CSV (con generación de km aleatorios si faltan),
// exportarlas de vuelta al mismo formato, y comparar dos CSV entre sí.

const { load, save, nextId, _sync, addLog } = require('./core');

function _randomKm(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function importarCSV(rows, kmMin = 40, kmMax = 45) {
  const d = load();
  let insertados = 0;
  const erroresDetalle = [];
  // Cache: último km_final por alumno_id para encadenar prácticas generadas
  const ultimoKmPorAlumno = {};

  rows.forEach((row, idx) => {
    try {
      const alumno  = (row.alumno  || '').trim();
      const vehiculo = (row.vehiculo || '').trim();
      const fecha   = (row.fecha   || '').trim();

      if (!alumno)   { erroresDetalle.push({ fila: idx + 2, motivo: 'Nombre de alumno vacío', datos: JSON.stringify(row) }); return; }
      if (!vehiculo) { erroresDetalle.push({ fila: idx + 2, motivo: 'Vehículo vacío', datos: JSON.stringify(row) }); return; }
      if (!fecha)    { erroresDetalle.push({ fila: idx + 2, motivo: 'Fecha vacía', datos: JSON.stringify(row) }); return; }

      // Validar formato fecha AAAA-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        erroresDetalle.push({ fila: idx + 2, motivo: `Formato de fecha incorrecto: "${fecha}" (debe ser AAAA-MM-DD)`, datos: `${alumno} / ${fecha}` });
        return;
      }

      // Vehículo
      let v = d.vehiculos.find(x => x.nombre.toLowerCase() === vehiculo.toLowerCase());
      if (!v) {
        const vid = nextId('v');
        v = { id: vid, nombre: vehiculo, matricula: '', km_actual: 0 };
        d.vehiculos.push(v);
        const s = _sync(); if (s) s.markDirty('vehiculos', vid);
      }

      // Alumno
      let a = d.alumnos.find(x => x.nombre.toLowerCase() === alumno.toLowerCase());
      if (!a) {
        const aid = nextId('a');
        a = { id: aid, nombre: alumno, permiso: 'B', vehiculo_id: v.id };
        d.alumnos.push(a);
        const s = _sync(); if (s) s.markDirty('alumnos', aid);
      }

      // Kilómetros
      let kmI = parseFloat(row.km_inicial);
      let kmF = parseFloat(row.km_final);
      const tieneKms = !isNaN(kmI) && !isNaN(kmF);

      if (tieneKms && kmF <= kmI) {
        erroresDetalle.push({ fila: idx + 2, motivo: `Km final (${kmF}) debe ser mayor que km inicial (${kmI})`, datos: `${alumno} / ${fecha}` });
        return;
      }

      if (!tieneKms) {
        let base = ultimoKmPorAlumno[a.id];
        if (base === undefined) {
          const practicasAlumno = d.practicas
            .filter(p => p.alumno_id === a.id)
            .sort((x, y) => x.fecha.localeCompare(y.fecha) || x.id - y.id);
          base = practicasAlumno.length ? practicasAlumno[practicasAlumno.length - 1].km_final : v.km_actual;
        }
        kmI = base;
        kmF = Math.round((kmI + _randomKm(kmMin, kmMax)) * 10) / 10;
      }

      const pid = nextId('p');
      d.practicas.push({ id: pid, alumno_id: a.id, vehiculo_id: v.id, fecha, km_inicial: kmI, km_final: kmF });
      const s = _sync(); if (s) s.markDirty('practicas', pid);
      if (kmF > v.km_actual) {
        v.km_actual = kmF;
        if (s) s.markDirty('vehiculos', v.id);
      }
      ultimoKmPorAlumno[a.id] = kmF;
      insertados++;
    } catch (e) {
      erroresDetalle.push({ fila: idx + 2, motivo: `Error inesperado: ${e.message}`, datos: JSON.stringify(row) });
    }
  });

  addLog('importacion', `Importación CSV: ${insertados} prácticas insertadas, ${erroresDetalle.length} errores`,
    erroresDetalle.map(e => `⚠ Fila ${e.fila}: ${e.motivo} [${e.datos}]`)
  );
  save();
  return { insertados, errores: erroresDetalle.length, erroresDetalle };
}

/**
 * Exporta todas las prácticas en formato CSV compatible con importarCSV.
 * Opciones: filtrar por alumno_id, vehiculo_id, rango de fechas.
 */
function exportarCSV(opciones = {}) {
  const d = load();
  let practicas = d.practicas.filter(p => !p.deleted);

  if (opciones.alumno_id) practicas = practicas.filter(p => p.alumno_id === parseInt(opciones.alumno_id));
  if (opciones.vehiculo_id) practicas = practicas.filter(p => p.vehiculo_id === parseInt(opciones.vehiculo_id));
  if (opciones.fecha_desde) practicas = practicas.filter(p => p.fecha >= opciones.fecha_desde);
  if (opciones.fecha_hasta) practicas = practicas.filter(p => p.fecha <= opciones.fecha_hasta);

  practicas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);

  const lineas = ['alumno,vehiculo,fecha,km_inicial,km_final'];
  for (const p of practicas) {
    const alumno = d.alumnos.find(a => a.id === p.alumno_id);
    const vehiculo = d.vehiculos.find(v => v.id === p.vehiculo_id);
    const escapar = s => s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    lineas.push([
      escapar(alumno ? alumno.nombre : '?'),
      escapar(vehiculo ? vehiculo.nombre : '?'),
      p.fecha,
      p.km_inicial,
      p.km_final
    ].join(','));
  }
  return { csv: lineas.join('\n'), total: practicas.length };
}

/**
 * Compara dos arrays de prácticas (ya parseados) y devuelve análisis detallado.
 * csvA: origen (ej: generado por IA), csvB: destino (ej: anotaciones manuales)
 */
function compararCSVs(rowsA, rowsB, opciones = {}) {
  const normalizarNombre = n => (n || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Parsear filas
  const parsear = (rows) => rows.map((r, i) => ({
    alumno: (r.alumno || '').trim(),
    alumnoNorm: normalizarNombre(r.alumno),
    fecha: (r.fecha || '').trim(),
    fila: i + 2
  })).filter(p => p.alumno && p.fecha);

  const practicasA = parsear(rowsA);
  const practicasB = parsear(rowsB);

  // Agrupar por alumno -> fecha -> cantidad
  const agrupar = (practicas) => {
    const mapa = new Map(); // alumnoNorm -> { nombre, fechas: Map<fecha, count> }
    for (const p of practicas) {
      if (!mapa.has(p.alumnoNorm)) {
        mapa.set(p.alumnoNorm, { nombre: p.alumno, fechas: new Map() });
      }
      const alumno = mapa.get(p.alumnoNorm);
      alumno.fechas.set(p.fecha, (alumno.fechas.get(p.fecha) || 0) + 1);
    }
    return mapa;
  };

  const grupoA = agrupar(practicasA);
  const grupoB = agrupar(practicasB);

  // Obtener todos los alumnos (unión de A y B)
  const todosAlumnos = new Map();
  for (const [norm, data] of grupoA) todosAlumnos.set(norm, data.nombre);
  for (const [norm, data] of grupoB) if (!todosAlumnos.has(norm)) todosAlumnos.set(norm, data.nombre);

  const resultado = {
    resumen: {
      totalA: practicasA.length,
      totalB: practicasB.length,
      diasCoinciden: 0,
      diasConflicto: 0,
      diasSoloEnA: 0,
      diasSoloEnB: 0,
      alumnosTotal: todosAlumnos.size
    },
    porAlumno: [], // { nombre, coincidencias: [{fecha, cant}], conflictos: [{fecha, cantA, cantB}], soloEnA: [{fecha, cant}], soloEnB: [{fecha, cant}] }
    alumnosSoloEnA: [],
    alumnosSoloEnB: []
  };

  // Comparar por alumno
  for (const [alumnoNorm, nombre] of todosAlumnos) {
    const fechasA = grupoA.get(alumnoNorm)?.fechas || new Map();
    const fechasB = grupoB.get(alumnoNorm)?.fechas || new Map();

    // Si el alumno solo está en uno de los CSV
    if (!grupoA.has(alumnoNorm)) {
      resultado.alumnosSoloEnB.push(nombre);
      const soloEnB = [];
      for (const [fecha, cant] of fechasB) {
        soloEnB.push({ fecha, cant });
        resultado.resumen.diasSoloEnB++;
      }
      resultado.porAlumno.push({ nombre, coincidencias: [], conflictos: [], soloEnA: [], soloEnB });
      continue;
    }
    if (!grupoB.has(alumnoNorm)) {
      resultado.alumnosSoloEnA.push(nombre);
      const soloEnA = [];
      for (const [fecha, cant] of fechasA) {
        soloEnA.push({ fecha, cant });
        resultado.resumen.diasSoloEnA++;
      }
      resultado.porAlumno.push({ nombre, coincidencias: [], conflictos: [], soloEnA, soloEnB: [] });
      continue;
    }

    // Alumno está en ambos - comparar fechas
    const todasFechas = new Set([...fechasA.keys(), ...fechasB.keys()]);
    const coincidencias = [], conflictos = [], soloEnA = [], soloEnB = [];

    for (const fecha of todasFechas) {
      const cantA = fechasA.get(fecha) || 0;
      const cantB = fechasB.get(fecha) || 0;

      if (cantA > 0 && cantB > 0) {
        if (cantA === cantB) {
          coincidencias.push({ fecha, cant: cantA });
          resultado.resumen.diasCoinciden++;
        } else {
          conflictos.push({ fecha, cantA, cantB });
          resultado.resumen.diasConflicto++;
        }
      } else if (cantA > 0) {
        soloEnA.push({ fecha, cant: cantA });
        resultado.resumen.diasSoloEnA++;
      } else {
        soloEnB.push({ fecha, cant: cantB });
        resultado.resumen.diasSoloEnB++;
      }
    }

    // Ordenar por fecha
    const ordenar = arr => arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
    resultado.porAlumno.push({
      nombre,
      coincidencias: ordenar(coincidencias),
      conflictos: ordenar(conflictos),
      soloEnA: ordenar(soloEnA),
      soloEnB: ordenar(soloEnB)
    });
  }

  // Ordenar alumnos por nombre
  resultado.porAlumno.sort((a, b) => a.nombre.localeCompare(b.nombre));

  return resultado;
}

module.exports = {
  importarCSV, exportarCSV, compararCSVs,
};
