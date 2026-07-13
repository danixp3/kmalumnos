const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { autoUpdater } = require('electron-updater');

// Silenciar logs del updater en producción
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWin = null;

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
});

autoUpdater.on('update-available', () => {
  if (mainWin) mainWin.webContents.send('update-available');
});

autoUpdater.on('update-downloaded', () => {
  if (mainWin) {
    dialog.showMessageBox(mainWin, {
      type: 'info',
      title: 'Actualización lista',
      message: 'Hay una nueva versión de KMAlumnos descargada. Se instalará al cerrar la aplicación.',
      buttons: ['Instalar ahora', 'Más tarde']
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── IPC HANDLERS ────────────────────────────────────────────────────────────

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
ipcMain.handle('rellenar-km-masivo', (_, vehiculo_id, kmMin, kmMax) => db.rellenarKmMasivo(vehiculo_id, kmMin, kmMax));
ipcMain.handle('get-practicas-sin-km', (_, vehiculo_id) => db.getPracticasSinKm(vehiculo_id));
ipcMain.handle('corregir-solapamientos', (_, vehiculo_id, kmMin, kmMax) => db.corregirSolapamientos(vehiculo_id, kmMin, kmMax));
ipcMain.handle('get-timeline-vehiculo', (_, vehiculo_id) => db.getTimelineVehiculo(vehiculo_id));
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

// Generar km aleatorio entre min y max con decimales reducidos
ipcMain.handle('generar-km', (_, kmInicial, min = 40, max = 45) => {
  const diff = Math.random() * (max - min) + min;
  const kmFinal = Math.round((kmInicial + diff) * 10) / 10;
  return { km_inicial: kmInicial, km_final: kmFinal, diff: Math.round(diff * 10) / 10 };
});
