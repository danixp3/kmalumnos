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
  addAlumno:    (n, p, vid, profId, sucursalId, email, datos, libro, permisos) => ipcRenderer.invoke('add-alumno', n, p, vid, profId, sucursalId, email, datos, libro, permisos),
  deleteAlumno: (id)                         => ipcRenderer.invoke('delete-alumno', id),
  updateAlumno: (id, n, p, vid, profId, email, datos, libro, permisos) => ipcRenderer.invoke('update-alumno', id, n, p, vid, profId, email, datos, libro, permisos),

  // Libro de registro de alumnos (RD 1295/2003 art. 39)
  getLibroRegistro:      (sucursalId) => ipcRenderer.invoke('get-libro-registro', sucursalId),
  asignarNumInscripcion: (id)         => ipcRenderer.invoke('asignar-num-inscripcion', id),
  backfillNumInscripcion: ()          => ipcRenderer.invoke('backfill-num-inscripcion'),

  // Prácticas
  getPracticas:      (alumno_id)             => ipcRenderer.invoke('get-practicas', alumno_id),
  getUltimaPractica: (alumno_id)             => ipcRenderer.invoke('get-ultima-practica', alumno_id),
  addPractica:       (aid, vid, f, ki, kf, pid, tipo, sucursalId) => ipcRenderer.invoke('add-practica', aid, vid, f, ki, kf, pid, tipo, sucursalId),
  deletePractica:    (id)                    => ipcRenderer.invoke('delete-practica', id),
  updatePractica:    (id, f, ki, kf, pid, tipo) => ipcRenderer.invoke('update-practica', id, f, ki, kf, pid, tipo),
  getTodasPracticas: (filtros)                => ipcRenderer.invoke('get-todas-practicas', filtros),

  // Pagos
  getPagosAlumno:    (alumnoId)                   => ipcRenderer.invoke('get-pagos-alumno', alumnoId),
  addPago:           (alumnoId, fecha, cantidad, nota, sucursalId, formaPago, empleado) => ipcRenderer.invoke('add-pago', alumnoId, fecha, cantidad, nota, sucursalId, formaPago, empleado),
  updatePago:        (id, fecha, cantidad, nota, formaPago, empleado)  => ipcRenderer.invoke('update-pago', id, fecha, cantidad, nota, formaPago, empleado),
  deletePago:        (id)                         => ipcRenderer.invoke('delete-pago', id),
  getDeudas:         (sucursalId)                 => ipcRenderer.invoke('get-deudas', sucursalId),
  getDesglosePagosAlumno: (alumnoId)               => ipcRenderer.invoke('get-desglose-pagos-alumno', alumnoId),
  getFichaPracticasAlumno: (alumnoId)              => ipcRenderer.invoke('get-ficha-practicas-alumno', alumnoId),
  getArqueo:         (desde, hasta, sucursalId)    => ipcRenderer.invoke('get-arqueo', desde, hasta, sucursalId),
  getMorosos:        (sucursalId)                  => ipcRenderer.invoke('get-morosos', sucursalId),

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
  getInformes:         (desde, hasta, sucursalId) => ipcRenderer.invoke('get-informes', desde, hasta, sucursalId),
  getSolapamientos:    ()                        => ipcRenderer.invoke('get-solapamientos'),
  rellenarKmMasivo:    (vid, min, max, inicio, final) => ipcRenderer.invoke('rellenar-km-masivo', vid, min, max, inicio, final),
  getPracticasSinKm:   (vid)                     => ipcRenderer.invoke('get-practicas-sin-km', vid),
  corregirSolapamientos: (vid, min, max)         => ipcRenderer.invoke('corregir-solapamientos', vid, min, max),
  getLogs:               (filtro)                => ipcRenderer.invoke('get-logs', filtro),
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

  // Jornada laboral (fichajes, art. 34.9 ET) — local por puesto, sin sync
  getJornadas:        (filtros)                   => ipcRenderer.invoke('get-jornadas', filtros),
  ficharEntrada:      (datos)                     => ipcRenderer.invoke('fichar-entrada', datos),
  ficharSalida:        (id)                        => ipcRenderer.invoke('fichar-salida', id),
  jornadaAbiertaDe:   (empleado, sucursalId)      => ipcRenderer.invoke('jornada-abierta-de', empleado, sucursalId),
  corregirJornada:    (id, campos)                => ipcRenderer.invoke('corregir-jornada', id, campos),
  borrarJornada:      (id)                        => ipcRenderer.invoke('borrar-jornada', id),

  // Vencimientos / alertas de caducidades — local por puesto, sin sync
  getVencimientos:            (sucursalId)                 => ipcRenderer.invoke('get-vencimientos', sucursalId),
  getProximosVencimientos:    (dias, hoy, sucursalId)      => ipcRenderer.invoke('get-proximos-vencimientos', dias, hoy, sucursalId),
  addVencimiento:              (datos)                      => ipcRenderer.invoke('add-vencimiento', datos),
  updateVencimiento:           (id, campos)                 => ipcRenderer.invoke('update-vencimiento', id, campos),
  setCompletadoVencimiento:    (id, completado)             => ipcRenderer.invoke('set-completado-vencimiento', id, completado),
  deleteVencimiento:           (id)                         => ipcRenderer.invoke('delete-vencimiento', id),

  // CRM de captación (leads) — local por puesto, sin sync
  getLeads:                    (sucursalId)                 => ipcRenderer.invoke('get-leads', sucursalId),
  addLead:                     (datos)                      => ipcRenderer.invoke('add-lead', datos),
  updateLead:                  (id, campos)                 => ipcRenderer.invoke('update-lead', id, campos),
  setEstadoLead:                (id, estado)                 => ipcRenderer.invoke('set-estado-lead', id, estado),
  deleteLead:                  (id)                         => ipcRenderer.invoke('delete-lead', id),
  convertirLead:                (id)                         => ipcRenderer.invoke('convertir-lead', id),
  getEstadisticasCrm:           (sucursalId)                 => ipcRenderer.invoke('get-estadisticas-crm', sucursalId),

  getPresentaciones:           (sucursalId)                 => ipcRenderer.invoke('get-presentaciones', sucursalId),
  addPresentacion:              (datos)                      => ipcRenderer.invoke('add-presentacion', datos),
  updatePresentacion:           (id, campos)                 => ipcRenderer.invoke('update-presentacion', id, campos),
  setResultadoPresentacion:     (id, resultado)              => ipcRenderer.invoke('set-resultado-presentacion', id, resultado),
  deletePresentacion:           (id)                         => ipcRenderer.invoke('delete-presentacion', id),
  getTasas:                     (sucursalId)                 => ipcRenderer.invoke('get-tasas', sucursalId),
  getTasasAlumno:               (alumnoId)                   => ipcRenderer.invoke('get-tasas-alumno', alumnoId),

  // Bonos / packs de prácticas — local por puesto, sin sync
  getBonos:                    (sucursalId)                 => ipcRenderer.invoke('get-bonos', sucursalId),
  getBonosAlumno:               (alumnoId)                   => ipcRenderer.invoke('get-bonos-alumno', alumnoId),
  getSaldoBonosAlumno:          (alumnoId)                   => ipcRenderer.invoke('get-saldo-bonos-alumno', alumnoId),
  addBono:                     (datos)                      => ipcRenderer.invoke('add-bono', datos),
  updateBono:                  (id, campos)                 => ipcRenderer.invoke('update-bono', id, campos),
  consumirBono:                (id, n)                      => ipcRenderer.invoke('consumir-bono', id, n),
  reponerBono:                 (id, n)                      => ipcRenderer.invoke('reponer-bono', id, n),
  anularBono:                  (id)                         => ipcRenderer.invoke('anular-bono', id),
  deleteBono:                  (id)                         => ipcRenderer.invoke('delete-bono', id),

  // Cargos y descuentos (matrícula/tasas/cargos/descuentos/promos — tarea D2)
  getCargos:                    (sucursalId)                 => ipcRenderer.invoke('get-cargos', sucursalId),
  getCargosAlumno:               (alumnoId)                   => ipcRenderer.invoke('get-cargos-alumno', alumnoId),
  getTotalCargosAlumno:          (alumnoId)                   => ipcRenderer.invoke('get-total-cargos-alumno', alumnoId),
  addCargo:                     (datos)                      => ipcRenderer.invoke('add-cargo', datos),
  updateCargo:                  (id, campos)                 => ipcRenderer.invoke('update-cargo', id, campos),
  deleteCargo:                  (id)                         => ipcRenderer.invoke('delete-cargo', id),

  addTasa:                      (datos)                      => ipcRenderer.invoke('add-tasa', datos),
  updateTasa:                   (id, campos)                 => ipcRenderer.invoke('update-tasa', id, campos),
  deleteTasa:                   (id)                         => ipcRenderer.invoke('delete-tasa', id),
  getEstadisticasAprobados:     (sucursalId)                 => ipcRenderer.invoke('get-estadisticas-aprobados', sucursalId),

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
