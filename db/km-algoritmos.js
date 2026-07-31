// ─── VALIDACIÓN Y ALGORITMOS DE KM ────────────────────────────────────────────
// Detección de solapamientos, relleno masivo de km en blanco y corrección
// quirúrgica de solapamientos entre prácticas del mismo vehículo.

const { load, save, addLog, fmtFechaLog, _sync } = require('./core');

/**
 * Comprueba si el rango [kmI, kmF] para un vehículo en una fecha concreta
 * se solapa con alguna práctica ya existente del mismo vehículo.
 * Devuelve lista de conflictos encontrados.
 */
function validarSolapamiento(vehiculo_id, fecha, kmI, kmF, excluirPracticaId = null) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const conflictos = [];

  const practicas = d.practicas.filter(p =>
    p.vehiculo_id === vid &&
    p.id !== excluirPracticaId &&
    !(p.km_inicial === 0 && p.km_final === 0)
  );

  for (const p of practicas) {
    // Solapamiento de rangos km
    if (kmI < p.km_final && p.km_inicial < kmF) {
      const alumno = d.alumnos.find(a => a.id === p.alumno_id);
      conflictos.push({
        alumno: alumno ? alumno.nombre : '?',
        fecha: p.fecha,
        km_inicial: p.km_inicial,
        km_final: p.km_final
      });
    }
  }

  return conflictos;
}

/**
 * Rellena los km en blanco (km_inicial=0 y km_final=0) de todas las prácticas
 * de un vehículo dado, de forma coherente con el odómetro global del vehículo.
 *
 * Algoritmo:
 * 1. Ordena TODAS las prácticas del vehículo por fecha y por km_inicial (nulls al final).
 * 2. Recorre la lista con un cursor = km actual del vehículo.
 * 3. Para cada práctica con km reales: avanza el cursor si km_final > cursor.
 * 4. Para cada práctica sin km (0,0): asigna km_inicial=cursor, km_final=cursor+rand(min,max).
 */
function rellenarKmMasivo(vehiculo_id, kmMin = 40, kmMax = 45, kmInicio = null, kmFinal = null) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return { rellenadas: 0, errores: ['Vehículo no encontrado'] };

  // Prácticas del vehículo
  const practicas = d.practicas.filter(p => p.vehiculo_id === vid);
  if (!practicas.length) return { rellenadas: 0, errores: [] };

  // Separar las que tienen km reales y las que están en blanco (0,0)
  const conKm   = practicas.filter(p => !(p.km_inicial === 0 && p.km_final === 0)).sort((a, b) => {
    const dc = a.fecha.localeCompare(b.fecha);
    return dc !== 0 ? dc : a.km_inicial - b.km_inicial;
  });
  const sinKm   = practicas.filter(p => p.km_inicial === 0 && p.km_final === 0).sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (!sinKm.length) return { rellenadas: 0, errores: [] };

  function _randomKm(min, max) {
    return Math.round((Math.random() * (max - min) + min) * 10) / 10;
  }

  // Cursor inicial: usar kmInicio si se proporciona, sino km_actual del vehículo
  const cursorInicial = (kmInicio !== null && kmInicio > 0) ? kmInicio : v.km_actual;

  // Tope final: si se proporciona, no superar este km
  const topeFinal = (kmFinal !== null && kmFinal > 0) ? kmFinal : null;

  // Ordenar todas las fechas únicas
  const todasFechas = [...new Set([...conKm.map(p => p.fecha), ...sinKm.map(p => p.fecha)])].sort();

  let rellenadas = 0;
  let saltadas = 0;

  for (const fecha of todasFechas) {
    const sinKmHoy = sinKm.filter(p => p.fecha === fecha);
    if (!sinKmHoy.length) continue;

    // Calcular cursor para este día
    let cursor = cursorInicial;
    conKm.forEach(p => {
      if (p.fecha <= fecha && p.km_final > cursor) cursor = p.km_final;
    });
    sinKm.forEach(p => {
      if (p.fecha < fecha && p.km_final > 0 && p.km_final > cursor) cursor = p.km_final;
    });

    // Rellenar las prácticas sin km de este día
    for (const p of sinKmHoy) {
      const kmI = cursor;
      const incremento = _randomKm(kmMin, kmMax);
      let kmF = Math.round((kmI + incremento) * 10) / 10;

      // Si hay tope final y lo superaríamos, saltar esta práctica
      if (topeFinal !== null && kmF > topeFinal) {
        saltadas++;
        continue;
      }

      p.km_inicial = kmI;
      p.km_final   = kmF;
      cursor = kmF;
      rellenadas++;
      // Marcar el cambio para que los km lleguen a la nube (antes solo quedaban en este PC)
      const s = _sync(); if (s) s.markDirty('practicas', p.id);
    }
  }

  // Actualizar km_actual del vehículo si creció
  let maxKm = v.km_actual;
  d.practicas.filter(p => p.vehiculo_id === vid).forEach(p => { if (p.km_final > maxKm) maxKm = p.km_final; });
  if (maxKm !== v.km_actual) {
    v.km_actual = maxKm;
    const s = _sync(); if (s) s.markDirty('vehiculos', vid);
  }

  const detallesLog = sinKm.filter(p => p.km_final > 0).map(p => {
    const alumno = load().alumnos.find(a => a.id === p.alumno_id);
    return `${alumno ? alumno.nombre : '?'} / ${fmtFechaLog(p.fecha)}: ${p.km_inicial} → ${p.km_final} km`;
  });
  const rangoInfo = kmInicio || kmFinal
    ? `(rango ${kmMin}-${kmMax} km, tope ${kmInicio || '?'}-${kmFinal || '?'} km)`
    : `(rango ${kmMin}-${kmMax} km)`;
  addLog('relleno', `Relleno masivo ${v.nombre}: ${rellenadas} rellenada(s)${saltadas ? `, ${saltadas} saltada(s) por tope` : ''} ${rangoInfo}`, detallesLog);
  save();
  return { rellenadas, saltadas };
}

function getPracticasSinKm(vehiculo_id) {
  const d = load();
  return d.practicas
    .filter(p => p.vehiculo_id === parseInt(vehiculo_id) && p.km_inicial === 0 && p.km_final === 0)
    .length;
}

/**
 * Algoritmo quirúrgico: solo toca las prácticas que están en conflicto real.
 * Para cada par solapado, mantiene intacta la práctica "ancla" (la que empieza
 * antes o tiene id menor) y desplaza la otra para que empiece justo donde
 * termina la ancla, conservando su duración original.
 * Se repite hasta que no queden solapamientos (máx 10 pasadas).
 */
function corregirSolapamientos(vehiculo_id, kmMin = 40, kmMax = 45) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return { corregidas: 0 };

  const cambios = {}; // id -> { antes, despues }
  const MAX_PASADAS = 10;

  for (let pasada = 0; pasada < MAX_PASADAS; pasada++) {
    const practicas = d.practicas
      .filter(p => p.vehiculo_id === vid && !(p.km_inicial === 0 && p.km_final === 0))
      .sort((a, b) => a.km_inicial - b.km_inicial);

    let encontrado = false;

    for (let i = 0; i < practicas.length; i++) {
      for (let j = i + 1; j < practicas.length; j++) {
        const ancla  = practicas[i];
        const movil  = practicas[j];

        // No hay solapamiento
        if (movil.km_inicial >= ancla.km_final) break;

        // Solapamiento detectado: desplazar "movil" para que empiece donde acaba "ancla"
        const duracion = Math.max(Math.round((movil.km_final - movil.km_inicial) * 10) / 10, 1);
        const nuevaKi  = Math.round(ancla.km_final * 10) / 10;
        const nuevaKf  = Math.round((nuevaKi + duracion) * 10) / 10;

        if (!cambios[movil.id]) {
          cambios[movil.id] = { alumno: (d.alumnos.find(a => a.id === movil.alumno_id) || {}).nombre || '?', fecha: movil.fecha, antes_ki: movil.km_inicial, antes_kf: movil.km_final };
        }

        movil.km_inicial = nuevaKi;
        movil.km_final   = nuevaKf;
        cambios[movil.id].despues_ki = nuevaKi;
        cambios[movil.id].despues_kf = nuevaKf;

        encontrado = true;
      }
    }

    if (!encontrado) break;
  }

  const corregidas = Object.keys(cambios).length;

  if (corregidas > 0) {
    // Marcar los cambios para que lleguen a la nube (antes solo quedaban en este PC)
    const s = _sync();
    if (s) Object.keys(cambios).forEach(id => s.markDirty('practicas', Number(id)));

    // Actualizar km_actual del vehículo
    const maxKm = Math.max(...d.practicas.filter(p => p.vehiculo_id === vid).map(p => p.km_final));
    if (maxKm > v.km_actual) {
      v.km_actual = maxKm;
      if (s) s.markDirty('vehiculos', vid);
    }

    const detalles = Object.values(cambios).map(c =>
      `${c.alumno} / ${fmtFechaLog(c.fecha)}: ${c.antes_ki}→${c.antes_kf}  ➜  ${c.despues_ki}→${c.despues_kf} km`
    );
    addLog('correccion', `Corrección solapamientos ${v.nombre}: ${corregidas} práctica(s) ajustadas`, detalles);
    save();
  }

  return { corregidas };
}

function getSolapamientos() {
  const d = load();
  const conflictos = [];

  // Agrupar prácticas por vehículo
  const porVehiculo = {};
  d.practicas.forEach(p => {
    if (!porVehiculo[p.vehiculo_id]) porVehiculo[p.vehiculo_id] = [];
    porVehiculo[p.vehiculo_id].push(p);
  });

  for (const [vidStr, practicas] of Object.entries(porVehiculo)) {
    const vid = parseInt(vidStr);
    const v = d.vehiculos.find(x => x.id === vid);
    const vNombre = v ? v.nombre : `Vehículo #${vid}`;

    // Ordenar por km_inicial
    const sorted = practicas.slice().sort((a, b) => a.km_inicial - b.km_inicial);

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        // Solapamiento: los rangos [a.km_inicial, a.km_final] y [b.km_inicial, b.km_final] se intersectan
        if (a.km_inicial < b.km_final && b.km_inicial < a.km_final) {
          // Solo reportar si son de distinto alumno O misma práctica duplicada
          const alumnoA = d.alumnos.find(x => x.id === a.alumno_id);
          const alumnoB = d.alumnos.find(x => x.id === b.alumno_id);
          conflictos.push({
            vehiculo: vNombre,
            vehiculo_id: vid,
            practica_a: { id: a.id, alumno: alumnoA ? alumnoA.nombre : '?', fecha: a.fecha, km_inicial: a.km_inicial, km_final: a.km_final },
            practica_b: { id: b.id, alumno: alumnoB ? alumnoB.nombre : '?', fecha: b.fecha, km_inicial: b.km_inicial, km_final: b.km_final }
          });
        }
        // Si b.km_inicial >= a.km_final ya no puede haber solapamiento con los siguientes (están ordenados)
        if (b.km_inicial >= a.km_final) break;
      }
    }
  }

  return conflictos;
}

module.exports = {
  validarSolapamiento, rellenarKmMasivo, getPracticasSinKm, corregirSolapamientos, getSolapamientos,
};
