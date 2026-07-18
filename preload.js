const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // UI
  refocus: () => ipcRenderer.invoke('ui:refocus'),
  getVersion: () => ipcRenderer.invoke('app:version'),

  // Vehículos
  getVehiculos:     ()                        => ipcRenderer.invoke('get-vehiculos'),
  addVehiculo:      (n, m, km)               => ipcRenderer.invoke('add-vehiculo', n, m, km),
  deleteVehiculo:   (id)                     => ipcRenderer.invoke('delete-vehiculo', id),
  updateVehiculoKm: (id, km)                 => ipcRenderer.invoke('update-vehiculo-km', id, km),

  // Profesores
  getProfesores:    ()                       => ipcRenderer.invoke('get-profesores'),
  addProfesor:      (n, nota)                => ipcRenderer.invoke('add-profesor', n, nota),
  deleteProfesor:   (id)                     => ipcRenderer.invoke('delete-profesor', id),
  updateProfesor:   (id, n, nota)            => ipcRenderer.invoke('update-profesor', id, n, nota),

  // Tarifas
  getTarifas:        ()                          => ipcRenderer.invoke('get-tarifas'),
  setTarifa:         (permiso, tipo, precio)      => ipcRenderer.invoke('set-tarifa', permiso, tipo, precio),
  deleteTarifa:      (id)                         => ipcRenderer.invoke('delete-tarifa', id),

  // Alumnos
  getAlumnos:   ()                           => ipcRenderer.invoke('get-alumnos'),
  addAlumno:    (n, p, vid)                  => ipcRenderer.invoke('add-alumno', n, p, vid),
  deleteAlumno: (id)                         => ipcRenderer.invoke('delete-alumno', id),
  updateAlumno: (id, n, p, vid)              => ipcRenderer.invoke('update-alumno', id, n, p, vid),

  // Prácticas
  getPracticas:      (alumno_id)             => ipcRenderer.invoke('get-practicas', alumno_id),
  getUltimaPractica: (alumno_id)             => ipcRenderer.invoke('get-ultima-practica', alumno_id),
  addPractica:       (aid, vid, f, ki, kf, pid, tipo) => ipcRenderer.invoke('add-practica', aid, vid, f, ki, kf, pid, tipo),
  deletePractica:    (id)                    => ipcRenderer.invoke('delete-practica', id),
  updatePractica:    (id, f, ki, kf, pid, tipo) => ipcRenderer.invoke('update-practica', id, f, ki, kf, pid, tipo),

  // Pagos
  getPagosAlumno:    (alumnoId)                   => ipcRenderer.invoke('get-pagos-alumno', alumnoId),
  addPago:           (alumnoId, fecha, cantidad, nota) => ipcRenderer.invoke('add-pago', alumnoId, fecha, cantidad, nota),
  updatePago:        (id, fecha, cantidad, nota)  => ipcRenderer.invoke('update-pago', id, fecha, cantidad, nota),
  deletePago:        (id)                         => ipcRenderer.invoke('delete-pago', id),
  getDeudas:         ()                           => ipcRenderer.invoke('get-deudas'),

  // Generación y resumen
  generarKm:    (kmInicial, min, max)        => ipcRenderer.invoke('generar-km', kmInicial, min, max),
  getResumen:        ()                      => ipcRenderer.invoke('get-resumen'),
  getSolapamientos:    ()                        => ipcRenderer.invoke('get-solapamientos'),
  rellenarKmMasivo:    (vid, min, max, inicio, final) => ipcRenderer.invoke('rellenar-km-masivo', vid, min, max, inicio, final),
  getPracticasSinKm:   (vid)                     => ipcRenderer.invoke('get-practicas-sin-km', vid),
  corregirSolapamientos: (vid, min, max)         => ipcRenderer.invoke('corregir-solapamientos', vid, min, max),
  getLogs:               ()                      => ipcRenderer.invoke('get-logs'),
  clearLogs:             ()                      => ipcRenderer.invoke('clear-logs'),
  crearBackup:           ()                      => ipcRenderer.invoke('crear-backup'),
  restaurarBackup:       ()                      => ipcRenderer.invoke('restaurar-backup'),
  getUltimoBackup:        ()                      => ipcRenderer.invoke('get-ultimo-backup'),
  restaurarUltimoBackup:  ()                      => ipcRenderer.invoke('restaurar-ultimo-backup'),
  validarSolapamiento:   (vid, f, ki, kf, exId)  => ipcRenderer.invoke('validar-solapamiento', vid, f, ki, kf, exId),
  getTimelineVehiculo:   (vid)                   => ipcRenderer.invoke('get-timeline-vehiculo', vid),

  // Registro rápido
  getAlumnosPorVehiculo:     (vid, fecha)         => ipcRenderer.invoke('get-alumnos-por-vehiculo', vid, fecha),
  registrarPracticasMasivas: (vid, fecha, aids)   => ipcRenderer.invoke('registrar-practicas-masivas', vid, fecha, aids),
  eliminarPracticaPorFecha:  (vid, fecha, aid)    => ipcRenderer.invoke('eliminar-practica-por-fecha', vid, fecha, aid),
  ajustarPracticasAlumno:    (vid, fecha, aid, d, pid, tipo) => ipcRenderer.invoke('ajustar-practicas-alumno', vid, fecha, aid, d, pid, tipo),
  guardarNotaAlumno:         (vid, fecha, aid, n, pid, tipo) => ipcRenderer.invoke('guardar-nota-alumno', vid, fecha, aid, n, pid, tipo),
  getAnotacionesAlumno:      (aid) => ipcRenderer.invoke('get-anotaciones-alumno', aid),

  // Importación
  openCsvDialog: ()                          => ipcRenderer.invoke('open-csv-dialog'),
  importarCsv:   (path, kmMin, kmMax)        => ipcRenderer.invoke('importar-csv', path, kmMin, kmMax),
  
  // Exportación y comparación CSV
  exportarCsv:       (opciones)              => ipcRenderer.invoke('exportar-csv', opciones),
  compararCsvs:      (pathA, pathB, opts)    => ipcRenderer.invoke('comparar-csvs', pathA, pathB, opts),
  openCsvDialogMulti: ()                     => ipcRenderer.invoke('open-csv-dialog-multi'),

  // Sync con Supabase
  syncNow:       ()                          => ipcRenderer.invoke('sync-now'),
  syncPushAll:   ()                          => ipcRenderer.invoke('sync-push-all'),
  getSyncStatus: ()                          => ipcRenderer.invoke('sync-status'),
  onSyncStatus:  (cb)                        => ipcRenderer.on('sync-status', (_, status, reason) => cb(status, reason)),
  onSyncConflictos: (cb)                     => ipcRenderer.on('sync-conflictos', (_, n) => cb(n)),
  saveSyncCreds:      (email, password)      => ipcRenderer.invoke('save-sync-creds', email, password),
  getSyncCredsStatus: ()                     => ipcRenderer.invoke('get-sync-creds-status'),
  registrarEmpresa:   (email, password)      => ipcRenderer.invoke('registrar-empresa', email, password),
  getEstadoCuenta:    ()                     => ipcRenderer.invoke('get-estado-cuenta'),
  clearSyncCreds:     ()                     => ipcRenderer.invoke('clear-sync-creds'),

  // Auto-update
  checkForUpdates:  ()     => ipcRenderer.invoke('check-for-updates'),
  installUpdate:    ()     => ipcRenderer.invoke('install-update'),
  onUpdateAvailable:     (cb) => ipcRenderer.on('update-available',        (_, v) => cb(v)),
  onUpdateDownloadStart: (cb) => ipcRenderer.on('update-download-start',   (_, v) => cb(v)),
  onUpdateNotAvailable:  (cb) => ipcRenderer.on('update-not-available',    ()     => cb()),
  onUpdateDownloadProgress: (cb) => ipcRenderer.on('update-download-progress', (_, pct) => cb(pct)),
  onUpdateDownloaded:    (cb) => ipcRenderer.on('update-downloaded',       ()     => cb()),
  onUpdateError:         (cb) => ipcRenderer.on('update-error',            (_, m) => cb(m)),
});
