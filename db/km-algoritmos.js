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
    // Incremento de km SIN decimales (la app trabaja con kilómetros enteros).
    return Math.round(Math.random() * (max - min) + min);
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
      const kmI = Math.round(cursor);
      const incremento = _randomKm(kmMin, kmMax);
      let kmF = kmI + incremento;

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

// ─── HELPERS COMPARTIDOS DE GENERACIÓN ──────────────────────────────────────
// Incremento de km SIN decimales (la app trabaja siempre con kilómetros enteros).
function _randomKmEntero(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

// Prácticas en blanco (0,0) de un vehículo, ordenadas cronológicamente
// (desempate por id para que el orden sea estable dentro del mismo día).
function _blancasOrdenadas(d, vid) {
  return d.practicas
    .filter(p => p.vehiculo_id === vid && p.km_inicial === 0 && p.km_final === 0)
    .sort((a, b) => {
      const dc = a.fecha.localeCompare(b.fecha);
      return dc !== 0 ? dc : a.id - b.id;
    });
}

// Cuenta cuántas de las asignaciones propuestas se solaparían con las prácticas
// que YA tienen km reales del mismo vehículo (para avisar sin bloquear: el usuario
// puede aplicar igualmente y luego usar "Corregir solapamientos").
function _contarSolapamientos(asignaciones, reales) {
  let n = 0;
  for (const a of asignaciones) {
    for (const r of reales) {
      if (a.km_inicial < r.km_final && r.km_inicial < a.km_final) { n++; break; }
    }
  }
  return n;
}

// Reparte `total` km en `n` incrementos ENTEROS que suman exactamente `total`,
// centrados en la media (total/n) con una variación aleatoria ± `variacion` km,
// para que las prácticas no queden todas iguales. Cada incremento es >= 1.
// Devuelve null si no cabe (total < n, es decir menos de 1 km por práctica).
function _repartirConVariacion(total, n, variacion) {
  if (n <= 0) return [];
  if (total < n) return null;
  const media = total / n;
  const v = Math.max(0, Math.round(variacion || 0));
  const incs = [];
  for (let i = 0; i < n; i++) {
    const jitter = v > 0 ? (Math.random() * 2 - 1) * v : 0; // [-v, +v]
    incs.push(Math.max(1, Math.round(media + jitter)));
  }
  // Ajuste fino: forzar que la suma sea EXACTAMENTE `total` manteniendo cada uno >= 1.
  let suma = incs.reduce((a, b) => a + b, 0);
  let diff = total - suma;
  let guard = 0;
  while (diff !== 0 && guard < 1000000) {
    for (let i = 0; i < n && diff !== 0; i++) {
      if (diff > 0) { incs[i]++; diff--; }
      else if (incs[i] > 1) { incs[i]--; diff++; }
    }
    guard++;
  }
  return incs;
}

// Persiste un plan de asignaciones (array de {p, ki, kf}) sobre las prácticas,
// marca los cambios para la nube, actualiza el odómetro del vehículo y registra
// el log. Devuelve el número de prácticas rellenadas.
function _aplicarPlan(d, v, plan, tipoLog, tituloLog) {
  const s = _sync();
  for (const { p, ki, kf } of plan) {
    p.km_inicial = ki;
    p.km_final   = kf;
    if (s) s.markDirty('practicas', p.id);
  }
  // Actualizar odómetro del vehículo si creció
  let maxKm = v.km_actual;
  d.practicas.filter(p => p.vehiculo_id === v.id).forEach(p => { if (p.km_final > maxKm) maxKm = p.km_final; });
  if (maxKm !== v.km_actual) {
    v.km_actual = maxKm;
    if (s) s.markDirty('vehiculos', v.id);
  }
  const detalles = plan.map(({ p, ki, kf }) => {
    const alumno = d.alumnos.find(a => a.id === p.alumno_id);
    return `${alumno ? alumno.nombre : '?'} / ${fmtFechaLog(p.fecha)}: ${ki} → ${kf} km`;
  });
  addLog(tipoLog, tituloLog, detalles);
  save();
}

/**
 * MODO "HASTA UN MÁXIMO (HACIA ATRÁS)".
 * Las prácticas en blanco del vehículo se calculan de modo que la MÁS RECIENTE
 * termine justo en `kmMaximo`, encadenando hacia atrás: cada práctica anterior
 * acaba donde empieza la siguiente, restando un incremento aleatorio [kmMin,kmMax].
 * Respeta las prácticas que ya tienen km reales (no las toca; solo avisa de
 * posibles solapamientos).
 *
 * @param aplicar  false = previsualizar (no guarda); true = aplicar y guardar.
 * @returns { asignaciones:[{practica_id,alumno,fecha,km_inicial,km_final}],
 *            rellenadas, solapamientos, errores:[] }
 */
function generarKmHastaMaximo(vehiculo_id, kmMin = 40, kmMax = 45, kmMaximo = null, aplicar = false) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return { asignaciones: [], rellenadas: 0, solapamientos: 0, errores: ['Vehículo no encontrado'] };
  if (kmMaximo === null || kmMaximo === '' || isNaN(kmMaximo) || kmMaximo <= 0) {
    return { asignaciones: [], rellenadas: 0, solapamientos: 0, errores: ['Indica un kilometraje máximo válido.'] };
  }
  if (kmMax <= kmMin) {
    return { asignaciones: [], rellenadas: 0, solapamientos: 0, errores: ['El máximo por práctica debe ser mayor que el mínimo.'] };
  }

  const blancas = _blancasOrdenadas(d, vid);
  if (!blancas.length) return { asignaciones: [], rellenadas: 0, solapamientos: 0, errores: ['Este vehículo no tiene prácticas con km en blanco.'] };

  // Encadenar hacia atrás desde kmMaximo (de la más reciente a la más antigua).
  const plan = new Array(blancas.length);
  let cursor = Math.round(kmMaximo);
  for (let i = blancas.length - 1; i >= 0; i--) {
    const kf = cursor;
    const inc = _randomKmEntero(kmMin, kmMax);
    const ki = kf - inc;
    plan[i] = { p: blancas[i], ki, kf };
    cursor = ki;
  }

  // La práctica más antigua no puede empezar por debajo de 0.
  if (plan[0].ki < 0) {
    return {
      asignaciones: [], rellenadas: 0, solapamientos: 0,
      errores: [`El máximo (${Math.round(kmMaximo)} km) es demasiado bajo para ${blancas.length} práctica(s): el odómetro se iría por debajo de 0. Sube el máximo o reduce el rango por práctica.`]
    };
  }

  const reales = d.practicas.filter(p => p.vehiculo_id === vid && !(p.km_inicial === 0 && p.km_final === 0));
  const solapamientos = _contarSolapamientos(plan.map(x => ({ km_inicial: x.ki, km_final: x.kf })), reales);

  const asignaciones = plan.map(({ p, ki, kf }) => {
    const alumno = d.alumnos.find(a => a.id === p.alumno_id);
    return { practica_id: p.id, alumno: alumno ? alumno.nombre : '?', fecha: p.fecha, km_inicial: ki, km_final: kf };
  });

  if (aplicar) {
    _aplicarPlan(d, v, plan, 'relleno', `Generación hasta máximo ${v.nombre}: ${plan.length} práctica(s) (máx ${Math.round(kmMaximo)} km, rango ${kmMin}-${kmMax} km)`);
  }

  return { asignaciones, rellenadas: plan.length, solapamientos, errores: [] };
}

/**
 * MODO "POR RANGO [desde → hasta]".
 * Reparte las prácticas en blanco del vehículo para que ocupen exactamente el
 * tramo [kmDesde, kmHasta]: la primera empieza en kmDesde y la última acaba en
 * kmHasta. El km por práctica es la media del tramo con una variación aleatoria
 * ± `variacion` km, para que no queden todas iguales.
 *
 * @param aplicar  false = previsualizar (no guarda); true = aplicar y guardar.
 * @returns { asignaciones:[...], rellenadas, solapamientos, errores:[] }
 */
function generarKmPorRango(vehiculo_id, kmDesde = null, kmHasta = null, variacion = 5, aplicar = false) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return { asignaciones: [], rellenadas: 0, solapamientos: 0, errores: ['Vehículo no encontrado'] };

  const desde = Math.round(Number(kmDesde));
  const hasta = Math.round(Number(kmHasta));
  if (kmDesde === null || kmDesde === '' || isNaN(desde) || desde < 0) {
    return { asignaciones: [], rellenadas: 0, solapamientos: 0, errores: ['Indica el km inicial del rango.'] };
  }
  if (kmHasta === null || kmHasta === '' || isNaN(hasta) || hasta <= desde) {
    return { asignaciones: [], rellenadas: 0, solapamientos: 0, errores: ['El km final del rango debe ser mayor que el inicial.'] };
  }

  const blancas = _blancasOrdenadas(d, vid);
  if (!blancas.length) return { asignaciones: [], rellenadas: 0, solapamientos: 0, errores: ['Este vehículo no tiene prácticas con km en blanco.'] };

  const total = hasta - desde;
  const incs = _repartirConVariacion(total, blancas.length, variacion);
  if (!incs) {
    return {
      asignaciones: [], rellenadas: 0, solapamientos: 0,
      errores: [`El rango (${total} km) es demasiado pequeño para ${blancas.length} práctica(s): no llega ni a 1 km por práctica. Amplía el rango.`]
    };
  }

  const plan = [];
  let cursor = desde;
  for (let i = 0; i < blancas.length; i++) {
    const ki = cursor;
    const kf = cursor + incs[i];
    plan.push({ p: blancas[i], ki, kf });
    cursor = kf;
  }

  const reales = d.practicas.filter(p => p.vehiculo_id === vid && !(p.km_inicial === 0 && p.km_final === 0));
  const solapamientos = _contarSolapamientos(plan.map(x => ({ km_inicial: x.ki, km_final: x.kf })), reales);

  const asignaciones = plan.map(({ p, ki, kf }) => {
    const alumno = d.alumnos.find(a => a.id === p.alumno_id);
    return { practica_id: p.id, alumno: alumno ? alumno.nombre : '?', fecha: p.fecha, km_inicial: ki, km_final: kf };
  });

  if (aplicar) {
    _aplicarPlan(d, v, plan, 'relleno', `Generación por rango ${v.nombre}: ${plan.length} práctica(s) (${desde} → ${hasta} km, variación ±${Math.round(variacion || 0)})`);
  }

  return { asignaciones, rellenadas: plan.length, solapamientos, errores: [] };
}

/**
 * Persiste EXACTAMENTE un plan previamente previsualizado (WYSIWYG). Como los
 * modos "máximo" y "rango" usan aleatoriedad, aplicar debe guardar lo que el
 * usuario vio, no volver a generar. Solo escribe sobre prácticas que SIGUEN en
 * blanco (protege frente a cambios entre previsualizar y aplicar).
 * @param asignaciones [{practica_id, km_inicial, km_final}]
 */
function aplicarPlanKm(vehiculo_id, asignaciones) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const v = d.vehiculos.find(x => x.id === vid);
  if (!v) return { aplicadas: 0, errores: ['Vehículo no encontrado'] };
  if (!Array.isArray(asignaciones) || !asignaciones.length) return { aplicadas: 0, errores: ['No hay nada que aplicar.'] };

  const plan = [];
  for (const a of asignaciones) {
    const p = d.practicas.find(x => x.id === a.practica_id && x.vehiculo_id === vid);
    if (!p) continue;
    if (!(p.km_inicial === 0 && p.km_final === 0)) continue; // ya no está en blanco
    const ki = Math.round(Number(a.km_inicial));
    const kf = Math.round(Number(a.km_final));
    if (isNaN(ki) || isNaN(kf) || kf <= ki || ki < 0) continue;
    plan.push({ p, ki, kf });
  }
  if (!plan.length) {
    return { aplicadas: 0, errores: ['Las prácticas ya no están en blanco o los km no son válidos. Vuelve a previsualizar.'] };
  }
  _aplicarPlan(d, v, plan, 'relleno', `Generación de km ${v.nombre}: ${plan.length} práctica(s) aplicadas`);
  return { aplicadas: plan.length, errores: [] };
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
  generarKmHastaMaximo, generarKmPorRango, aplicarPlanKm,
};
