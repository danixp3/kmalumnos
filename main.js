const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const sync = require('./sync');
const { autoUpdater } = require('electron-updater');

// ─── CREDENCIALES DE SINCRONIZACIÓN ────────────────────────────────────────────
// Se guardan en userData (nunca en el código). La contraseña se cifra con
// safeStorage (DPAPI en Windows) cuando está disponible.
function getCredsPath() {
  return path.join(app.getPath('userData'), 'sync_creds.json');
}

function saveSyncCreds(email, password) {
  try {
    let stored = { email, encrypted: false, password };
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      stored = { email, encrypted: true, password: safeStorage.encryptString(password).toString('base64') };
    }
    fs.writeFileSync(getCredsPath(), JSON.stringify(stored), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error guardando credenciales:', e.message);
    return false;
  }
}

function loadSyncCreds() {
  try {
    const p = getCredsPath();
    if (!fs.existsSync(p)) return null;
    const stored = JSON.parse(fs.readFileSync(p, 'utf-8'));
    let password = stored.password;
    if (stored.encrypted && safeStorage && safeStorage.isEncryptionAvailable()) {
      password = safeStorage.decryptString(Buffer.from(stored.password, 'base64'));
    }
    if (!stored.email || !password) return null;
    return { email: stored.email, password };
  } catch (e) {
    console.error('Error leyendo credenciales:', e.message);
    return null;
  }
}

// NO descargar automáticamente - preguntar primero
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = require('electron').app ? null : console;

let mainWin = null;
let isDownloading = false;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'icon.png'),
    title: 'KM Alumnos - Autoescuela'
  });
  mainWin.loadFile('index.html');
  mainWin.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();
  // Comprueba actualizaciones 3s después de arrancar (no bloquea el inicio)
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);

  // Cargar credenciales de sincronización (si el usuario ya las configuró)
  const creds = loadSyncCreds();
  if (creds) sync.setCredentials(creds.email, creds.password);

  // Arrancar sync automático (cada 2 min)
  sync.startAutoSync(2 * 60 * 1000);

  // Notificar a la UI cuando cambia el estado de sync
  // (el motivo del error viaja junto al estado para poder mostrarlo en la UI)
  sync.onStatusChange((status) => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('sync-status', status, sync.getLastError());
    }
  });
});

autoUpdater.on('update-not-available', () => {
  if (mainWin) mainWin.webContents.send('update-not-available');
});

autoUpdater.on('update-available', (info) => {
  if (mainWin && !isDownloading) {
    dialog.showMessageBox(mainWin, {
      type: 'info',
      title: 'Actualización disponible',
      message: `Hay una nueva versión disponible: v${info.version}\n\n¿Deseas descargarla ahora?`,
      buttons: ['Descargar', 'Más tarde']
    }).then(({ response }) => {
      if (response === 0) {
        isDownloading = true;
        mainWin.webContents.send('update-download-start', info.version);
        autoUpdater.downloadUpdate().catch(err => {
          console.error('Download error:', err);
          isDownloading = false;
          mainWin.webContents.send('update-error', err.message);
        });
      }
    });
  }
});

autoUpdater.on('download-progress', (p) => {
  if (mainWin) mainWin.webContents.send('update-download-progress', Math.round(p.percent));
});

autoUpdater.on('error', (err) => {
  if (!mainWin) return;
  console.error('AutoUpdater error:', err);
  isDownloading = false;
  const msg = (err.message || '').toLowerCase();
  // Si no hay releases en GitHub o da 404/ENOTFOUND, tratar como "no hay actualización"
  if (msg.includes('404') || msg.includes('no published') || msg.includes('enotfound') ||
      msg.includes('cannot find') || msg.includes('net::') || msg.includes('httperror')) {
    mainWin.webContents.send('update-not-available');
  } else {
    mainWin.webContents.send('update-error', err.message);
  }
});

autoUpdater.on('update-downloaded', () => {
  isDownloading = false;
  if (mainWin) mainWin.webContents.send('update-downloaded');
});

app.on('window-all-closed', () => {
  sync.stopAutoSync();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── IPC HANDLERS ────────────────────────────────────────────────────────────

// Bug conocido de Electron/Chromium: tras un dialogo nativo (confirm/alert)
// el renderer se queda sin poder enfocar inputs hasta que la ventana pierde
// y recupera el foco. Este handler hace ese blur+focus programaticamente
// (equivalente a minimizar y restaurar).
ipcMain.handle('ui:refocus', () => {
  if (!mainWin || mainWin.isDestroyed()) return false;
  mainWin.blur();
  mainWin.focus();
  return true;
});

ipcMain.handle('get-vehiculos', () => db.getVehiculos());
ipcMain.handle('add-vehiculo', (_, nombre, matricula, km_actual) => {
  const id = db.addVehiculo(nombre, matricula, km_actual);
  return id;
});
ipcMain.handle('delete-vehiculo', (_, id) => { db.deleteVehiculo(id); return true; });
ipcMain.handle('update-vehiculo-km', (_, id, km) => { db.updateVehiculoKm(id, km); return true; });

ipcMain.handle('get-alumnos', () => db.getAlumnos());
ipcMain.handle('add-alumno', (_, nombre, permiso, vehiculo_id) => db.addAlumno(nombre, permiso, vehiculo_id));
ipcMain.handle('delete-alumno', (_, id) => { db.deleteAlumno(id); return true; });
ipcMain.handle('update-alumno', (_, id, nombre, permiso, vehiculo_id) => { db.updateAlumno(id, nombre, permiso, vehiculo_id); return true; });

ipcMain.handle('get-practicas', (_, alumno_id) => db.getPracticasByAlumno(alumno_id));
ipcMain.handle('get-ultima-practica', (_, alumno_id) => db.getUltimaPractica(alumno_id));
ipcMain.handle('add-practica', (_, alumno_id, vehiculo_id, fecha, km_inicial, km_final) =>
  db.addPractica(alumno_id, vehiculo_id, fecha, km_inicial, km_final)
);
ipcMain.handle('delete-practica', (_, id) => { db.deletePractica(id); return true; });
ipcMain.handle('update-practica', (_, id, fecha, km_inicial, km_final) => { db.updatePractica(id, fecha, km_inicial, km_final); return true; });

ipcMain.handle('get-resumen', () => db.getResumen());
ipcMain.handle('get-solapamientos', () => db.getSolapamientos());
ipcMain.handle('rellenar-km-masivo', (_, vehiculo_id, kmMin, kmMax, kmInicio, kmFinal) => db.rellenarKmMasivo(vehiculo_id, kmMin, kmMax, kmInicio, kmFinal));
ipcMain.handle('get-practicas-sin-km', (_, vehiculo_id) => db.getPracticasSinKm(vehiculo_id));
ipcMain.handle('corregir-solapamientos', (_, vehiculo_id, kmMin, kmMax) => db.corregirSolapamientos(vehiculo_id, kmMin, kmMax));
ipcMain.handle('get-timeline-vehiculo', (_, vehiculo_id) => db.getTimelineVehiculo(vehiculo_id));

// Registro rápido
ipcMain.handle('get-alumnos-por-vehiculo', (_, vehiculo_id, fecha) => db.getAlumnosPorVehiculo(vehiculo_id, fecha));
ipcMain.handle('registrar-practicas-masivas', (_, vehiculo_id, fecha, alumno_ids) => db.registrarPracticasMasivas(vehiculo_id, fecha, alumno_ids));
ipcMain.handle('eliminar-practica-por-fecha', (_, vehiculo_id, fecha, alumno_id) => db.eliminarPracticaPorFecha(vehiculo_id, fecha, alumno_id));
ipcMain.handle('ajustar-practicas-alumno', (_, vehiculo_id, fecha, alumno_id, delta) => db.ajustarPracticasAlumno(vehiculo_id, fecha, alumno_id, delta));
ipcMain.handle('guardar-nota-alumno', (_, vehiculo_id, fecha, alumno_id, nota) => db.guardarNotaAlumno(vehiculo_id, fecha, alumno_id, nota));
ipcMain.handle('get-anotaciones-alumno', (_, alumno_id) => db.getAnotacionesAlumno(alumno_id));

ipcMain.handle('get-logs', () => db.getLogs());
ipcMain.handle('clear-logs', () => db.clearLogs());
ipcMain.handle('validar-solapamiento', (_, vehiculo_id, fecha, kmI, kmF, excluirId) => db.validarSolapamiento(vehiculo_id, fecha, kmI, kmF, excluirId));

ipcMain.handle('crear-backup', async () => {
  const result = await dialog.showOpenDialog({ title: 'Seleccionar carpeta para el backup', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths.length) return { ok: false, msg: 'Cancelado.' };
  return db.crearBackup(result.filePaths[0]);
});

ipcMain.handle('restaurar-backup', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar backup de KM Alumnos',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, msg: 'Cancelado.' };
  return db.restaurarBackup(result.filePaths[0]);
});

ipcMain.handle('open-csv-dialog', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar archivo CSV',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('importar-csv', (_, filePath, kmMin, kmMax) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { ok: false, msg: 'El archivo está vacío o solo tiene cabecera.' };

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const required = ['alumno', 'vehiculo', 'fecha', 'km_inicial', 'km_final'];
    for (const r of required) {
      if (!header.includes(r)) return { ok: false, msg: `Falta la columna: ${r}` };
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      const row = {};
      header.forEach((h, idx) => { row[h] = cols[idx] || ''; });
      if (row.alumno && row.vehiculo && row.fecha) rows.push(row);
    }

    const min = parseFloat(kmMin) || 40;
    const max = parseFloat(kmMax) || 45;
    const res = db.importarCSV(rows, min, max);
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

// Handlers para exportar y comparar CSV - para añadir a main.js

ipcMain.handle('exportar-csv', async (_, opciones) => {
  try {
    const res = db.exportarCSV(opciones || {});
    const result = await dialog.showSaveDialog({
      title: 'Guardar CSV',
      defaultPath: 'practicas_' + new Date().toISOString().slice(0, 10) + '.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(result.filePath, res.csv, 'utf-8');
    return { ok: true, total: res.total, path: result.filePath };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

ipcMain.handle('comparar-csvs', async (_, pathA, pathB, opciones) => {
  try {
    const parsearCSV = (filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return [];
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const row = {};
        header.forEach((h, idx) => { row[h] = cols[idx] || ''; });
        rows.push(row);
      }
      return rows;
    };
    const rowsA = parsearCSV(pathA);
    const rowsB = parsearCSV(pathB);
    const res = db.compararCSVs(rowsA, rowsB, opciones || {});
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

// Generar km aleatorio entre min y max con decimales reducidos
ipcMain.handle('generar-km', (_, kmInicial, min = 40, max = 45) => {
  const diff = Math.random() * (max - min) + min;
  const kmFinal = Math.round((kmInicial + diff) * 10) / 10;
  return { km_inicial: kmInicial, km_final: kmFinal, diff: Math.round(diff * 10) / 10 };
});

// ─── UPDATER IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('check-for-updates', () => {
  try { autoUpdater.checkForUpdates(); } catch(e) {}
});
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall(true, true));

// ─── SYNC IPC HANDLERS ────────────────────────────────────────────────────────
ipcMain.handle('sync-now', async () => sync.sync());
ipcMain.handle('sync-push-all', async () => sync.pushAll());
ipcMain.handle('sync-status', () => sync.getStatus());

// Credenciales de sincronización (la contraseña nunca se devuelve al renderer)
ipcMain.handle('save-sync-creds', async (_, email, password) => {
  if (!email || !password) return { ok: false, msg: 'Faltan email o contraseña.' };
  const ok = saveSyncCreds(email, password);
  if (!ok) return { ok: false, msg: 'No se pudieron guardar las credenciales.' };
  sync.setCredentials(email, password);
  const res = await sync.sync(); // probar inmediatamente
  if (!res.ok) return { ok: false, msg: res.reason || 'No se pudo sincronizar con esas credenciales.' };
  return { ok: true };
});
ipcMain.handle('get-sync-creds-status', () => {
  const creds = loadSyncCreds();
  return { configured: !!creds, email: creds ? creds.email : null };
});
