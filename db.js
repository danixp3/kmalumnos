/**
 * db.js  –  almacenamiento en JSON local (sin módulos nativos)
 * Estructura del archivo data.json:
 * {
 *   vehiculos:  [ { id, nombre, matricula, km_actual } ],
 *   profesores: [ { id, nombre, nota } ],
 *   alumnos:    [ { id, nombre, permiso, vehiculo_id } ],
 *   practicas:  [ { id, alumno_id, vehiculo_id, fecha, km_inicial, km_final, profesor_id, tipo } ],
 *   tarifas:    [ { id, permiso, tipo, precio } ],
 *   pagos:      [ { id, alumno_id, fecha, cantidad, nota } ]
 * }
 *
 * Este archivo es solo el índice: la implementación real vive repartida en
 * db/ (ver db/core.js, db/vehiculos.js, db/profesores.js, db/tarifas.js,
 * db/alumnos.js, db/practicas.js, db/pagos.js, db/csv.js,
 * db/km-algoritmos.js y db/estadisticas.js). La superficie pública exportada
 * aquí abajo es exactamente la misma que tenía este archivo antes del reparto.
 */

const core = require('./db/core');

module.exports = {
  ...require('./db/vehiculos'),
  ...require('./db/profesores'),
  ...require('./db/tarifas'),
  ...require('./db/alumnos'),
  ...require('./db/practicas'),
  ...require('./db/pagos'),
  ...require('./db/csv'),
  ...require('./db/km-algoritmos'),
  ...require('./db/estadisticas'),

  getLogs: core.getLogs,
  clearLogs: core.clearLogs,
  registrarLogEnData: core.registrarLogEnData,
  crearBackup: core.crearBackup,
  restaurarBackup: core.restaurarBackup,
  obtenerUltimoBackup: core.obtenerUltimoBackup,
  _clearCache: core._clearCache,
};
