/**
 * db.js  –  almacenamiento en JSON local (sin módulos nativos)
 * Estructura del archivo data.json:
 * {
 *   vehiculos: [ { id, nombre, matricula, km_actual } ],
 *   alumnos:   [ { id, nombre, permiso, vehiculo_id } ],
 *   practicas: [ { id, alumno_id, vehiculo_id, fecha, km_inicial, km_final } ]
 * }
 */

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

let dataPath;
let _data = null;

// Referencia lazy a sync para evitar dependencia circular
function _sync() {
  try { return require('./sync'); } catch { return null; }
}

function getDataPath() {
  if (!dataPath) dataPath = path.join(app.getPath('userData'), 'data.json');
  return dataPath;
}

function _clearCache() {
  _data = null;
}

function load() {
  if (_data) return _data;
  const p = getDataPath();
  if (fs.existsSync(p)) {
    try { _data = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { _data = null; }
  }
  if (!_data) _data = { vehiculos: [], alumnos: [], practicas: [], logs: [], _seq: { v: 1, a: 1, p: 1 } };
  if (!_data._seq) _data._seq = { v: 1, a: 1, p: 1 };
  if (!_data.logs) _data.logs = [];
  return _data;
}

function fmtFechaLog(str) {
  if (!str) return str;
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function addLog(tipo, descripcion, detalles = []) {
  const d = load();
  d.logs.unshift({
    id: Date.now(),
    fecha: new Date().toISOString(),
    tipo,
    descripcion,
    detalles
  });
  // Limitar a 500 entradas
  if (d.logs.length > 500) d.logs = d.logs.slice(0, 500);
}

function getLogs() {
  return load().logs;
}

function clearLogs() {
  const d = load();
  d.logs = [];
  save();
}

// ─── BACKUP ──────────────────────────────────────────────────────────────────
function crearBackup(destDir) {
  const src = getDataPath();
  if (!fs.existsSync(src)) return { ok: false, msg: 'No hay datos que guardar.' };
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destFile = path.join(destDir, `kmalumnos_backup_${ts}.json`);
  fs.copyFileSync(src, destFile);
  return { ok: true, file: destFile };
}

function restaurarBackup(srcFile) {
  try {
    const raw = fs.readFileSync(srcFile, 'utf-8');
    const parsed = JSON.parse(raw);
    // Validación mínima
    if (!parsed.vehiculos || !parsed.alumnos || !parsed.practicas) {
      return { ok: false, msg: 'El archivo no parece un backup válido de KM Alumnos.' };
    }
    fs.writeFileSync(getDataPath(), JSON.stringify(parsed, null, 2), 'utf-8');
    _data = null; // limpiar caché para recargar
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// ─── VALIDACIÓN CRUZADA DE KM ────────────────────────────────────────────────
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

function save() {
  fs.writeFileSync(getDataPath(), JSON.stringify(_data, null, 2), 'utf-8');
}

function nextId(type) {
  const id = _data._seq[type]++;
  return id;
}

// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
function getVehiculos() {
  return load().vehiculos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function addVehiculo(nombre, matricula, km_actual) {
  const d = load();
  const id = nextId('v');
  d.vehiculos.push({ id, nombre, matricula: matricula || '', km_actual: parseFloat(km_actual) || 0 });
  save();
  const s = _sync(); if (s) s.markDirty('vehiculos', id);
  return id;
}

function updateVehiculoKm(id, km) {
  const d = load();
  const v = d.vehiculos.find(x => x.id === id);
  if (v) { v.km_actual = parseFloat(km); save(); const s = _sync(); if (s) s.markDirty('vehiculos', id); }
}

function deleteVehiculo(id) {
  const d = load();
  d.vehiculos = d.vehiculos.filter(x => x.id !== id);
  d.alumnos.forEach(a => { if (a.vehiculo_id === id) a.vehiculo_id = null; });
  save();
  const s = _sync(); if (s) s.markDeleted('vehiculos', id);
}

// ─── ALUMNOS ─────────────────────────────────────────────────────────────────
function getAlumnos() {
  const d = load();
  return d.alumnos
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(a => {
      const v = d.vehiculos.find(x => x.id === a.vehiculo_id);
      return { ...a, vehiculo_nombre: v ? v.nombre : null };
    });
}

function addAlumno(nombre, permiso, vehiculo_id) {
  const d = load();
  const id = nextId('a');
  d.alumnos.push({ id, nombre, permiso: permiso || 'B', vehiculo_id: vehiculo_id ? parseInt(vehiculo_id) : null });
  save();
  const s = _sync(); if (s) s.markDirty('alumnos', id);
  return id;
}

function deleteAlumno(id) {
  const d = load();
  d.alumnos   = d.alumnos.filter(x => x.id !== id);
  d.practicas = d.practicas.filter(x => x.alumno_id !== id);
  save();
  const s = _sync(); if (s) s.markDeleted('alumnos', id);
}

function updateAlumno(id, nombre, permiso, vehiculo_id) {
  const d = load();
  const a = d.alumnos.find(x => x.id === id);
  if (a) {
    a.nombre = nombre;
    a.permiso = permiso;
    a.vehiculo_id = vehiculo_id ? parseInt(vehiculo_id) : null;
    save();
    const s = _sync(); if (s) s.markDirty('alumnos', id);
  }
}

// ─── PRÁCTICAS ───────────────────────────────────────────────────────────────
function getPracticasByAlumno(alumno_id) {
  const d = load();
  return d.practicas
    .filter(p => p.alumno_id === alumno_id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
    .map(p => {
      const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
      return { ...p, vehiculo_nombre: v ? v.nombre : null };
    });
}

function getUltimaPractica(alumno_id) {
  const practicas = getPracticasByAlumno(alumno_id);
  return practicas.length ? practicas[practicas.length - 1] : null;
}

function addPractica(alumno_id, vehiculo_id, fecha, km_inicial, km_final) {
  const d = load();
  const id = nextId('p');
  const ki = parseFloat(km_inicial);
  const kf = parseFloat(km_final);
  d.practicas.push({ id, alumno_id: parseInt(alumno_id), vehiculo_id: parseInt(vehiculo_id), fecha, km_inicial: ki, km_final: kf });
  // Actualizar km vehículo si corresponde
  const v = d.vehiculos.find(x => x.id === parseInt(vehiculo_id));
  if (v && kf > v.km_actual) v.km_actual = kf;
  save();
  const s = _sync(); if (s) s.markDirty('practicas', id);
  return id;
}

function deletePractica(id) {
  const d = load();
  d.practicas = d.practicas.filter(x => x.id !== id);
  save();
  const s = _sync(); if (s) s.markDeleted('practicas', id);
}

function updatePractica(id, fecha, km_inicial, km_final) {
  const d = load();
  const p = d.practicas.find(x => x.id === id);
  if (p) {
    p.fecha = fecha;
    p.km_inicial = parseFloat(km_inicial);
    p.km_final = parseFloat(km_final);
    save();
    const s = _sync(); if (s) s.markDirty('practicas', id);
  }
}

// ─── IMPORTACIÓN CSV ─────────────────────────────────────────────────────────
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
      }

      // Alumno
      let a = d.alumnos.find(x => x.nombre.toLowerCase() === alumno.toLowerCase());
      if (!a) {
        const aid = nextId('a');
        a = { id: aid, nombre: alumno, permiso: 'B', vehiculo_id: v.id };
        d.alumnos.push(a);
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
      if (kmF > v.km_actual) v.km_actual = kmF;
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

// ─── RELLENO MASIVO DE KM ────────────────────────────────────────────────────
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
function rellenarKmMasivo(vehiculo_id, kmMin = 40, kmMax = 45) {
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

  // Construir timeline de anchors: fecha -> km_final máximo de ese día
  const anchorPorFecha = {};
  conKm.forEach(p => {
    if (!anchorPorFecha[p.fecha] || p.km_final > anchorPorFecha[p.fecha]) {
      anchorPorFecha[p.fecha] = p.km_final;
    }
  });

  // Cursor global: km inicial del vehículo
  // Mezclar todas las prácticas con km reales para encontrar el cursor correcto en cada punto
  // Ordenar todas las fechas únicas
  const todasFechas = [...new Set([...conKm.map(p => p.fecha), ...sinKm.map(p => p.fecha)])].sort();

  let rellenadas = 0;

  for (const fecha of todasFechas) {
    const sinKmHoy = sinKm.filter(p => p.fecha === fecha);
    if (!sinKmHoy.length) continue;

    // Calcular cursor para este día:
    // = mayor km_final entre todas las prácticas con km de fecha <= hoy
    let cursor = v.km_actual;
    conKm.forEach(p => {
      if (p.fecha <= fecha && p.km_final > cursor) cursor = p.km_final;
    });
    // También considerar las prácticas sin km ya rellenadas antes de este día
    sinKm.forEach(p => {
      if (p.fecha < fecha && p.km_final > 0 && p.km_final > cursor) cursor = p.km_final;
    });

    // Rellenar las prácticas sin km de este día en orden
    for (const p of sinKmHoy) {
      const kmI = cursor;
      const kmF = Math.round((kmI + _randomKm(kmMin, kmMax)) * 10) / 10;
      p.km_inicial = kmI;
      p.km_final   = kmF;
      cursor = kmF;
      rellenadas++;
    }
  }

  // Actualizar km_actual del vehículo si creció
  let maxKm = v.km_actual;
  d.practicas.filter(p => p.vehiculo_id === vid).forEach(p => { if (p.km_final > maxKm) maxKm = p.km_final; });
  v.km_actual = maxKm;

  const detallesLog = sinKm.filter(p => p.km_final > 0).map(p => {
    const alumno = load().alumnos.find(a => a.id === p.alumno_id);
    return `${alumno ? alumno.nombre : '?'} / ${fmtFechaLog(p.fecha)}: ${p.km_inicial} → ${p.km_final} km`;
  });
  addLog('relleno', `Relleno masivo ${v.nombre}: ${rellenadas} práctica(s) rellenadas (rango ${kmMin}-${kmMax} km)`, detallesLog);
  save();
  return { rellenadas };
}

function getPracticasSinKm(vehiculo_id) {
  const d = load();
  return d.practicas
    .filter(p => p.vehiculo_id === parseInt(vehiculo_id) && p.km_inicial === 0 && p.km_final === 0)
    .length;
}

// ─── CORRECCIÓN QUIRÚRGICA DE SOLAPAMIENTOS ──────────────────────────────────
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
    // Actualizar km_actual del vehículo
    const maxKm = Math.max(...d.practicas.filter(p => p.vehiculo_id === vid).map(p => p.km_final));
    if (maxKm > v.km_actual) v.km_actual = maxKm;

    const detalles = Object.values(cambios).map(c =>
      `${c.alumno} / ${fmtFechaLog(c.fecha)}: ${c.antes_ki}→${c.antes_kf}  ➜  ${c.despues_ki}→${c.despues_kf} km`
    );
    addLog('correccion', `Corrección solapamientos ${v.nombre}: ${corregidas} práctica(s) ajustadas`, detalles);
    save();
  }

  return { corregidas };
}
// ─── SOLAPAMIENTOS ───────────────────────────────────────────────────────────
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

function getResumen() {
  const d = load();
  const sinKm = d.practicas.filter(p => p.km_inicial === 0 && p.km_final === 0).length;
  // Contar solapamientos
  const conflictos = getSolapamientos();
  return {
    vehiculos: d.vehiculos.length,
    alumnos: d.alumnos.length,
    practicas: d.practicas.length,
    sinKm,
    solapamientos: conflictos.length
  };
}

// ─── ALUMNOS POR VEHÍCULO (para registro rápido) ─────────────────────────────
/**
 * Devuelve todos los alumnos asignados a un vehículo específico,
 * junto con si ya tienen práctica registrada en la fecha indicada.
 */
function getAlumnosPorVehiculo(vehiculo_id, fecha) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  
  const alumnos = d.alumnos
    .filter(a => a.vehiculo_id === vid)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  
  return alumnos.map(a => {
    // Contar cuántas prácticas tiene ese día y obtener nota si existe
    const practicasHoy = d.practicas.filter(p => 
      p.alumno_id === a.id && 
      p.vehiculo_id === vid && 
      p.fecha === fecha
    );
    const nota = practicasHoy.length > 0 ? (practicasHoy[0].nota || '') : '';
    return {
      id: a.id,
      nombre: a.nombre,
      permiso: a.permiso,
      num_practicas: practicasHoy.length,
      nota: nota
    };
  });
}

/**
 * Registra prácticas masivas para varios alumnos en una fecha.
 * Añade práctica con km 0,0 (para rellenar después con relleno masivo).
 */
function registrarPracticasMasivas(vehiculo_id, fecha, alumno_ids) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  let registradas = 0;
  const detalles = [];

  for (const aid of alumno_ids) {
    const alumno_id = parseInt(aid);
    // Verificar que no exista ya práctica ese día para ese alumno/vehículo
    const existe = d.practicas.some(p => 
      p.alumno_id === alumno_id && 
      p.vehiculo_id === vid && 
      p.fecha === fecha
    );
    if (existe) continue;

    const alumno = d.alumnos.find(a => a.id === alumno_id);
    if (!alumno) continue;

    const pid = nextId('p');
    d.practicas.push({
      id: pid,
      alumno_id,
      vehiculo_id: vid,
      fecha,
      km_inicial: 0,
      km_final: 0
    });
    registradas++;
    detalles.push(`${alumno.nombre} (${fecha})`);
    const s = _sync(); if (s) s.markDirty('practicas', pid);
  }

  if (registradas > 0) {
    addLog('registro_rapido', `Registro rápido: ${registradas} práctica(s) añadidas`, detalles);
    save();
  }

  return { registradas };
}

/**
 * Ajusta el número de prácticas de un alumno en una fecha.
 * Si delta > 0, añade prácticas. Si delta < 0, elimina.
 */
function ajustarPracticasAlumno(vehiculo_id, fecha, alumno_id, delta) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const aid = parseInt(alumno_id);
  
  const practicasExistentes = d.practicas.filter(p => 
    p.alumno_id === aid && 
    p.vehiculo_id === vid && 
    p.fecha === fecha
  );
  
  const actual = practicasExistentes.length;
  const nuevo = Math.max(0, actual + delta);
  const diff = nuevo - actual;
  
  if (diff > 0) {
    // Añadir prácticas
    for (let i = 0; i < diff; i++) {
      const pid = nextId('p');
      d.practicas.push({
        id: pid,
        alumno_id: aid,
        vehiculo_id: vid,
        fecha,
        km_inicial: 0,
        km_final: 0
      });
      const s = _sync(); if (s) s.markDirty('practicas', pid);
    }
  } else if (diff < 0) {
    // Eliminar prácticas (las más recientes primero)
    const aEliminar = practicasExistentes.slice(diff); // últimas |diff|
    for (const p of aEliminar) {
      const idx = d.practicas.findIndex(x => x.id === p.id);
      if (idx !== -1) {
        d.practicas.splice(idx, 1);
        const s = _sync(); if (s) s.markDeleted('practicas', p.id);
      }
    }
  }
  
  if (diff !== 0) save();
  return { num_practicas: nuevo };
}

/**
 * Guarda una nota en las prácticas de un alumno para una fecha.
 * Si no tiene prácticas ese día, crea una con km=0 para poder guardar la nota.
 */
function guardarNotaAlumno(vehiculo_id, fecha, alumno_id, nota) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const aid = parseInt(alumno_id);
  
  let practicas = d.practicas.filter(p => 
    p.alumno_id === aid && 
    p.vehiculo_id === vid && 
    p.fecha === fecha
  );
  
  // Si no tiene prácticas ese día, crear una para poder guardar la nota
  if (practicas.length === 0 && nota) {
    const nuevaPractica = {
      id: d._seq.p++,
      alumno_id: aid,
      vehiculo_id: vid,
      fecha: fecha,
      km_inicial: 0,
      km_final: 0,
      nota: nota
    };
    d.practicas.push(nuevaPractica);
    save();
    const s = _sync(); if (s) s.markDirty('practicas', nuevaPractica.id);
    return { ok: true, created: true };
  }
  
  if (practicas.length > 0) {
    practicas[0].nota = nota;
    save();
    const s = _sync(); if (s) s.markDirty('practicas', practicas[0].id);
  }
  
  return { ok: true };
}

/**
 * Elimina práctica de un alumno en una fecha específica para un vehículo.
 */
function eliminarPracticaPorFecha(vehiculo_id, fecha, alumno_id) {
  const d = load();
  const vid = parseInt(vehiculo_id);
  const aid = parseInt(alumno_id);
  
  const idx = d.practicas.findIndex(p => 
    p.alumno_id === aid && 
    p.vehiculo_id === vid && 
    p.fecha === fecha
  );
  
  if (idx !== -1) {
    const practica = d.practicas[idx];
    d.practicas.splice(idx, 1);
    save();
    const s = _sync(); if (s) s.markDeleted('practicas', practica.id);
    return { eliminada: true };
  }
  return { eliminada: false };
}

// ─── TIMELINE DE VEHÍCULO ────────────────────────────────────────────────────
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

/**
 * Devuelve todas las anotaciones de un alumno (prácticas que tienen nota).
 * Cada entrada incluye fecha, vehículo y texto de la nota.
 */
function getAnotacionesAlumno(alumno_id) {
  const d = load();
  const aid = parseInt(alumno_id);
  return d.practicas
    .filter(p => p.alumno_id === aid && p.nota && p.nota.trim() !== '')
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    .map(p => {
      const v = d.vehiculos.find(x => x.id === p.vehiculo_id);
      return {
        id: p.id,
        fecha: p.fecha,
        vehiculo_nombre: v ? v.nombre : '?',
        nota: p.nota
      };
    });
}

module.exports = {
  getVehiculos, addVehiculo, updateVehiculoKm, deleteVehiculo,
  getAlumnos, addAlumno, deleteAlumno, updateAlumno,
  getPracticasByAlumno, getUltimaPractica, addPractica, deletePractica, updatePractica,
  importarCSV, getResumen, getSolapamientos,
  rellenarKmMasivo, getPracticasSinKm,
  corregirSolapamientos,
  getLogs, clearLogs,
  crearBackup, restaurarBackup,
  validarSolapamiento,
  getTimelineVehiculo,
  getAlumnosPorVehiculo, registrarPracticasMasivas, eliminarPracticaPorFecha, ajustarPracticasAlumno, guardarNotaAlumno,
  getAnotacionesAlumno,
  _clearCache
};
