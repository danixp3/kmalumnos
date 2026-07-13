const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Vehículos
  getVehiculos:     ()                        => ipcRenderer.invoke('get-vehiculos'),
  addVehiculo:      (n, m, km)               => ipcRenderer.invoke('add-vehiculo', n, m, km),
  deleteVehiculo:   (id)                     => ipcRenderer.invoke('delete-vehiculo', id),
  updateVehiculoKm: (id, km)                 => ipcRenderer.invoke('update-vehiculo-km', id, km),

  // Alumnos
  getAlumnos:   ()                           => ipcRenderer.invoke('get-alumnos'),
  addAlumno:    (n, p, vid)                  => ipcRenderer.invoke('add-alumno', n, p, vid),
  deleteAlumno: (id)                         => ipcRenderer.invoke('delete-alumno', id),
  updateAlumno: (id, n, p, vid)              => ipcRenderer.invoke('update-alumno', id, n, p, vid),

  // Prácticas
  getPracticas:      (alumno_id)             => ipcRenderer.invoke('get-practicas', alumno_id),
  getUltimaPractica: (alumno_id)             => ipcRenderer.invoke('get-ultima-practica', alumno_id),
  addPractica:       (aid, vid, f, ki, kf)   => ipcRenderer.invoke('add-practica', aid, vid, f, ki, kf),
  deletePractica:    (id)                    => ipcRenderer.invoke('delete-practica', id),
  updatePractica:    (id, f, ki, kf)         => ipcRenderer.invoke('update-practica', id, f, ki, kf),

  // Generación y resumen
  generarKm:    (kmInicial, min, max)        => ipcRenderer.invoke('generar-km', kmInicial, min, max),
  getResumen:        ()                      => ipcRenderer.invoke('get-resumen'),
  getSolapamientos:    ()                        => ipcRenderer.invoke('get-solapamientos'),
  rellenarKmMasivo:    (vid, min, max)           => ipcRenderer.invoke('rellenar-km-masivo', vid, min, max),
  getPracticasSinKm:   (vid)                     => ipcRenderer.invoke('get-practicas-sin-km', vid),
  corregirSolapamientos: (vid, min, max)         => ipcRenderer.invoke('corregir-solapamientos', vid, min, max),
  getLogs:               ()                      => ipcRenderer.invoke('get-logs'),
  clearLogs:             ()                      => ipcRenderer.invoke('clear-logs'),
  crearBackup:           ()                      => ipcRenderer.invoke('crear-backup'),
  restaurarBackup:       ()                      => ipcRenderer.invoke('restaurar-backup'),
  validarSolapamiento:   (vid, f, ki, kf, exId)  => ipcRenderer.invoke('validar-solapamiento', vid, f, ki, kf, exId),
  getTimelineVehiculo:   (vid)                   => ipcRenderer.invoke('get-timeline-vehiculo', vid),

  // Importación
  openCsvDialog: ()                          => ipcRenderer.invoke('open-csv-dialog'),
  importarCsv:   (path, kmMin, kmMax)        => ipcRenderer.invoke('importar-csv', path, kmMin, kmMax),

  // Sync con Supabase
  syncNow:       ()                          => ipcRenderer.invoke('sync-now'),
  syncPushAll:   ()                          => ipcRenderer.invoke('sync-push-all'),
  getSyncStatus: ()                          => ipcRenderer.invoke('sync-status'),
  onSyncStatus:  (cb)                        => ipcRenderer.on('sync-status', (_, status) => cb(status)),
});
