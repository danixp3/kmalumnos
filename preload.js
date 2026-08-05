const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // UI
  refocus: () => ipcRenderer.invoke('ui:refocus'),
  getVersion: () => ipcRenderer.invoke('app:version'),

  // Ventana (barra de título)
  minimizarVentana:       () => ipcRenderer.invoke('ventana-minimizar'),
  maximizarVentana:       () => ipcRenderer.invoke('ventana-maximizar'),
  cerrarVentana:          () => ipcRenderer.invoke('ventana-cerrar'),
  ventanaEstaMaximizada:  () => ipcRenderer.invoke('ventana-esta-maximizada'),
  onVentanaMaximizada:    (cb) => ipcRenderer.on('ventana-maximizada', (_, max) => cb(max)),
  guardarTemaFondo:       (color) => ipcRenderer.invoke('guardar-tema-fondo', color),

  // Vehículos
  getVehiculos:     (sucursalId)             => ipcRenderer.invoke('get-vehiculos', sucursalId),
  addVehiculo:      (n, m, km, sucursalId)   => ipcRenderer.invoke('add-vehiculo', n, m, km, sucursalId),
  deleteVehiculo:   (id)                     => ipcRenderer.invoke('delete-vehiculo', id),
  updateVehiculoKm: (id, km)                 => ipcRenderer.invoke('update-vehiculo-km', id, km),
  updateVehiculo:   (id, n, m)               => ipcRenderer.invoke('update-vehiculo', id, n, m),

  // Profesores
  getProfesores:    (sucursalId)             => ipcRenderer.invoke('get-profesores', sucursalId),
  addProfesor:      (n, nota, sucursalId)    => ipcRenderer.invoke('add-profesor', n, nota, sucursalId),
  deleteProfesor:   (id)                     => ipcRenderer.invoke('delete-profesor', id),
  updateProfesor:   (id, n, nota)            => ipcRenderer.invoke('update-profesor', id, n, nota),

  // Tarifas
  getTarifas:        ()                          => ipcRenderer.invoke('get-tarifas'),
  setTarifa:         (permiso, tipo, precio)      => ipcRenderer.invoke('set-tarifa', permiso, tipo, precio),
  deleteTarifa:      (id)                         => ipcRenderer.invoke('delete-tarifa', id),

  // Alumnos
  getAlumnos:   (sucursalId)                 => ipcRenderer.invoke('get-alumnos', sucursalId),
  addAlumno:    (n, p, vid, profId, sucursalId, email, datos) => ipcRenderer.invoke('add-alumno', n, p, vid, profId, sucursalId, email, datos),
  deleteAlumno: (id)                         => ipcRenderer.invoke('delete-alumno', id),
  updateAlumno: (id, n, p, vid, profId, email, datos) => ipcRenderer.invoke('update-alumno', id, n, p, vid, profId, email, datos),

  // Prácticas
  getPracticas:      (alumno_id)             => ipcRenderer.invoke('get-practicas', alumno_id),
  getUltimaPractica: (alumno_id)             => ipcRenderer.invoke('get-ultima-practica', alumno_id),
  addPractica:       (aid, vid, f, ki, kf, pid, tipo, sucursalId) => ipcRenderer.invoke('add-practica', aid, vid, f, ki, kf, pid, tipo, sucursalId),
  deletePractica:    (id)                    => ipcRenderer.invoke('delete-practica', id),
  updatePractica:    (id, f, ki, kf, pid, tipo) => ipcRenderer.invoke('update-practica', id, f, ki, kf, pid, tipo),
  getTodasPracticas: (filtros)                => ipcRenderer.invoke('get-todas-practicas', filtros),

  // Pagos
  getPagosAlumno:    (alumnoId)                   => ipcRenderer.invoke('get-pagos-alumno', alumnoId),
  addPago:           (alumnoId, fecha, cantidad, nota, sucursalId) => ipcRenderer.invoke('add-pago', alumnoId, fecha, cantidad, nota, sucursalId),
  updatePago:        (id, fecha, cantidad, nota)  => ipcRenderer.invoke('update-pago', id, fecha, cantidad, nota),
  deletePago:        (id)                         => ipcRenderer.invoke('delete-pago', id),
  getDeudas:         (sucursalId)                 => ipcRenderer.invoke('get-deudas', sucursalId),
  getDesglosePagosAlumno: (alumnoId)               => ipcRenderer.invoke('get-desglose-pagos-alumno', alumnoId),

  // Generación y resumen
  generarKm:    (kmInicial, min, max)        => ipcRenderer.invoke('generar-km', kmInicial, min, max),
  getResumen:        (sucursalId)            => ipcRenderer.invoke('get-resumen', sucursalId),
  getStatsDashboard: (hoy, sucursalId)       => ipcRenderer.invoke('get-stats-dashboard', hoy, sucursalId),
  getStatsProfesores: (desde, hasta)         => ipcRenderer.invoke('get-stats-profesores', desde, hasta),
  getDatosGraficos:    (meses, sucursalId)   => ipcRenderer.invoke('get-datos-graficos', meses, sucursalId),
  getSemaforoExamen:   ()                        => ipcRenderer.invoke('get-semaforo-examen'),
  getSemaforoAlumno:   (alumnoId)                => ipcRenderer.invoke('get-semaforo-alumno', alumnoId),
  getAlumnosEnRiesgo:  ()                        => ipcRenderer.invoke('get-alumnos-en-riesgo'),
  getAnalisisVehiculos: ()                       => ipcRenderer.invoke('get-analisis-vehiculos'),
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
  solicitarResetPassword: (email)            => ipcRenderer.invoke('solicitar-reset-password', email),
  resolverConflictoEmpresa: ()                => ipcRenderer.invoke('resolver-conflicto-empresa'),

  // Roles (jefe/empleado, fase 2 multi-empresa)
  getPerfilActual:    ()                          => ipcRenderer.invoke('get-perfil-actual'),
  getModulosActivos:  ()                          => ipcRenderer.invoke('get-modulos-activos'),
  listarEmpleados:    ()                          => ipcRenderer.invoke('listar-empleados'),
  invitarEmpleado:    (email, rol, sucursalId)    => ipcRenderer.invoke('invitar-empleado', email, rol, sucursalId),
  cambiarRolEmpleado: (userId, rol)               => ipcRenderer.invoke('cambiar-rol-empleado', userId, rol),
  quitarEmpleado:     (userId)                    => ipcRenderer.invoke('quitar-empleado', userId),

  // Sucursales (fase 2 multi-empresa)
  getSucursales:      (soloActivas)               => ipcRenderer.invoke('get-sucursales', soloActivas),
  addSucursal:        (nombre)                    => ipcRenderer.invoke('add-sucursal', nombre),
  renombrarSucursal:  (id, nombre)                => ipcRenderer.invoke('renombrar-sucursal', id, nombre),
  activarSucursal:    (id, activa)                => ipcRenderer.invoke('activar-sucursal', id, activa),

  // Reservas (agenda/solicitudes de práctica, Bloque 2 SaaS — sin UI todavía)
  getReservas:        (sucursalId)                => ipcRenderer.invoke('get-reservas', sucursalId),
  addReserva:         (datos)                     => ipcRenderer.invoke('add-reserva', datos),
  updateReserva:      (id, campos)                => ipcRenderer.invoke('update-reserva', id, campos),
  setEstadoReserva:   (id, estado)                => ipcRenderer.invoke('set-estado-reserva', id, estado),
  completarReserva:   (id)                        => ipcRenderer.invoke('completar-reserva', id),
  deleteReserva:      (id)                        => ipcRenderer.invoke('delete-reserva', id),

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
