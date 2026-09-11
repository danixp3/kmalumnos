// ─── IMPORTACIÓN / EXPORTACIÓN / COMPARACIÓN DE CSV ──────────────────────────
// Importar prácticas desde CSV (con generación de km aleatorios si faltan),
// exportarlas de vuelta al mismo formato, y comparar dos CSV entre sí.

const { load, save, nextId, _sync, addLog } = require('./core');

function _randomKm(min, max) {
  // Incremento de km SIN decimales (la app trabaja con kilómetros enteros).
  return Math.round(Math.random() * (max - min) + min);
}

function importarCSV(rows, kmMin = 40, kmMax = 45) {
  const d = load();
  let insertados = 0;
  const erroresDetalle = [];

  // Se importa en DOS pasadas para que la generación de km de las prácticas vacías
  // sea coherente: primero las filas que traen km reales (fijan el odómetro), y
  // después las vacías, encadenadas desde el km más alto ya conocido — nunca desde 0
  // si el alumno o el vehículo ya tienen lecturas.
  const conKm = [];  // { fila, a, v, fecha, kmI, kmF, profesorId, horaInicio }
  const sinKm = [];  // { fila, a, v, fecha, profesorId, horaInicio }

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

      // Kilómetros (enteros: sin decimales)
      let kmI = parseFloat(row.km_inicial);
      let kmF = parseFloat(row.km_final);
      const tieneKms = !isNaN(kmI) && !isNaN(kmF);

      if (tieneKms) {
        kmI = Math.round(kmI);
        kmF = Math.round(kmF);
        if (kmF <= kmI) {
          erroresDetalle.push({ fila: idx + 2, motivo: `Km final (${kmF}) debe ser mayor que km inicial (${kmI})`, datos: `${alumno} / ${fecha}` });
          return;
        }
      }

      // Columnas OPCIONALES: hora de inicio y profesor (pueden ir en blanco o no existir).
      const horaInicio = (row.hora_inicio || '').trim() || null;
      let profesorId = null;
      const profesorNombre = (row.profesor || '').trim();
      if (profesorNombre) {
        let prof = d.profesores.find(x => (x.nombre || '').toLowerCase() === profesorNombre.toLowerCase());
        if (!prof) {
          const profId = nextId('pf');
          prof = { id: profId, nombre: profesorNombre, nota: '', sucursal_id: null, dni: null };
          d.profesores.push(prof);
          const s2 = _sync(); if (s2) s2.markDirty('profesores', profId);
        }
        profesorId = prof.id;
      }

      if (tieneKms) conKm.push({ fila: idx + 2, a, v, fecha, kmI, kmF, profesorId, horaInicio });
      else          sinKm.push({ fila: idx + 2, a, v, fecha, profesorId, horaInicio });
    } catch (e) {
      erroresDetalle.push({ fila: idx + 2, motivo: `Error inesperado: ${e.message}`, datos: JSON.stringify(row) });
    }
  });

  // Cache del km_final más alto ya insertado por alumno_id (encadena las prácticas sin km).
  const ultimoKmPorAlumno = {};
  const insertar = (r, kmI, kmF) => {
    const pid = nextId('p');
    d.practicas.push({ id: pid, alumno_id: r.a.id, vehiculo_id: r.v.id, fecha: r.fecha, km_inicial: kmI, km_final: kmF, profesor_id: r.profesorId, hora_inicio: r.horaInicio });
    const s = _sync(); if (s) s.markDirty('practicas', pid);
    if (kmF > r.v.km_actual) {
      r.v.km_actual = kmF;
      if (s) s.markDirty('vehiculos', r.v.id);
    }
    if (ultimoKmPorAlumno[r.a.id] === undefined || kmF > ultimoKmPorAlumno[r.a.id]) ultimoKmPorAlumno[r.a.id] = kmF;
    insertados++;
  };

  // 1ª pasada: prácticas con km reales (fijan el odómetro del alumno y del vehículo).
  for (const r of conKm) insertar(r, r.kmI, r.kmF);

  // 2ª pasada: prácticas sin km, encadenadas por fecha desde el km más alto conocido.
  sinKm.sort((x, y) => x.fecha.localeCompare(y.fecha));
  for (const r of sinKm) {
    // Rango 0-0: las prácticas sin km se dejan realmente vacías (no se encadenan).
    if (kmMin === 0 && kmMax === 0) { insertar(r, 0, 0); continue; }
    let base = ultimoKmPorAlumno[r.a.id];
    if (base === undefined) {
      // Mayor km_final real del alumno o, en su defecto, el odómetro del vehículo.
      const maxAlumno = d.practicas
        .filter(p => p.alumno_id === r.a.id && !(p.km_inicial === 0 && p.km_final === 0))
        .reduce((m, p) => Math.max(m, p.km_final), 0);
      base = Math.max(maxAlumno, r.v.km_actual || 0);
    }
    const kmI = Math.round(base);
    const kmF = kmI + _randomKm(kmMin, kmMax);
    insertar(r, kmI, kmF);
  }

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

  // hora_inicio y profesor son columnas OPCIONALES (compatibles con importarCSV):
  // se exportan siempre pero quedan en blanco cuando la práctica no tiene ese dato.
  const lineas = ['alumno,vehiculo,fecha,km_inicial,km_final,hora_inicio,profesor'];
  for (const p of practicas) {
    const alumno = d.alumnos.find(a => a.id === p.alumno_id);
    const vehiculo = d.vehiculos.find(v => v.id === p.vehiculo_id);
    const profesor = p.profesor_id ? d.profesores.find(pr => pr.id === p.profesor_id) : null;
    const escapar = s => String(s).includes(',') || String(s).includes('"') ? `"${String(s).replace(/"/g, '""')}"` : String(s);
    lineas.push([
      escapar(alumno ? alumno.nombre : '?'),
      escapar(vehiculo ? vehiculo.nombre : '?'),
      p.fecha,
      p.km_inicial,
      p.km_final,
      escapar(p.hora_inicio || ''),
      escapar(profesor ? profesor.nombre : '')
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
