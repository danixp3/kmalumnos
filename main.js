const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Carpeta de datos estable: aunque productName pase a "AulaMovil", seguimos usando
// la carpeta histórica "KMAlumnos" en %AppData% para no orfanar el data.json (ni la
// sesión ni las preferencias) de las instalaciones previas. Debe ejecutarse antes
// de requerir ./db y antes de app.whenReady().
app.setPath('userData', path.join(app.getPath('appData'), 'KMAlumnos'));

const db = require('./db');
const sync = require('./sync');
const { autoUpdater } = require('electron-updater');
const { sanitizarNombre, extensionDeDataUrl } = require('./utils-ficheros');

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

// ─── BLOQUEO DE LA APP CON PIN ─────────────────────────────────────────────────
// Opcional (Ajustes → Seguridad de este PC): al abrir la app y tras unos minutos
// sin usarla se pide un PIN. Se guarda solo su huella (scrypt + sal) en
// userData/bloqueo.json; tras 5 fallos seguidos hay que esperar (cada vez más).
// Si se olvida, se quita con la contraseña de la cuenta de la autoescuela.
const crypto = require('crypto');
const archivoBloqueo = () => path.join(app.getPath('userData'), 'bloqueo.json');
function leerBloqueo() {
  try { const b = JSON.parse(fs.readFileSync(archivoBloqueo(), 'utf-8')); return b && b.hash && b.sal ? b : null; } catch (e) { return null; }
}
const huellaPin = (pin, sal) => crypto.scryptSync(String(pin), Buffer.from(sal, 'hex'), 32, { N: 16384, r: 8, p: 1 }).toString('hex');
const pinValido = pin => /^\d{4,8}$/.test(String(pin || ''));
const MINUTOS_BLOQUEO = [0, 5, 10, 15, 30, 60];
const bloqueoFallos = { n: 0, hasta: 0 };
function comprobarPin(pin) {
  const b = leerBloqueo();
  if (!b) return { ok: true };
  const ahora = Date.now();
  if (ahora < bloqueoFallos.hasta) return { ok: false, espera: Math.ceil((bloqueoFallos.hasta - ahora) / 1000) };
  const ok = pinValido(pin) && crypto.timingSafeEqual(Buffer.from(huellaPin(pin, b.sal), 'hex'), Buffer.from(b.hash, 'hex'));
  if (ok) { bloqueoFallos.n = 0; bloqueoFallos.hasta = 0; return { ok: true }; }
  bloqueoFallos.n++;
  if (bloqueoFallos.n >= 5) bloqueoFallos.hasta = ahora + Math.min(15 * 60, 30 * 2 ** (bloqueoFallos.n - 5)) * 1000;
  return { ok: false, quedan: Math.max(0, 5 - bloqueoFallos.n), espera: bloqueoFallos.hasta > ahora ? Math.ceil((bloqueoFallos.hasta - ahora) / 1000) : 0 };
}
ipcMain.handle('bloqueo-estado', () => { const b = leerBloqueo(); return { activo: !!b, minutos: b && MINUTOS_BLOQUEO.includes(b.minutos) ? b.minutos : 15 }; });
ipcMain.handle('bloqueo-comprobar', (_, pin) => comprobarPin(pin));
ipcMain.handle('bloqueo-poner', (_, pinActual, pinNuevo, minutos) => {
  if (leerBloqueo() && !comprobarPin(pinActual).ok) return { ok: false, msg: 'El PIN actual no es correcto.' };
  if (!pinValido(pinNuevo)) return { ok: false, msg: 'El PIN tiene que tener de 4 a 8 números.' };
  const sal = crypto.randomBytes(16).toString('hex');
  const m = MINUTOS_BLOQUEO.includes(Number(minutos)) ? Number(minutos) : 15;
  fs.writeFileSync(archivoBloqueo(), JSON.stringify({ sal, hash: huellaPin(pinNuevo, sal), minutos: m }), 'utf-8');
  return { ok: true };
});
ipcMain.handle('bloqueo-minutos', (_, minutos) => {
  const b = leerBloqueo();
  if (!b || !MINUTOS_BLOQUEO.includes(Number(minutos))) return { ok: false };
  b.minutos = Number(minutos);
  fs.writeFileSync(archivoBloqueo(), JSON.stringify(b), 'utf-8');
  return { ok: true };
});
ipcMain.handle('bloqueo-quitar', (_, pin) => {
  if (!comprobarPin(pin).ok) return { ok: false, msg: 'El PIN no es correcto.' };
  try { fs.unlinkSync(archivoBloqueo()); } catch (e) { /* ya no estaba */ }
  return { ok: true };
});
// PIN olvidado: con la contraseña de la cuenta de la autoescuela guardada en este PC
ipcMain.handle('bloqueo-olvidado', (_, password) => {
  const creds = loadSyncCreds();
  if (!creds) return { ok: false, msg: 'Este PC no tiene guardada la cuenta de la autoescuela: no se puede comprobar la contraseña.' };
  const a = Buffer.from(String(password || '')), b = Buffer.from(String(creds.password));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const r = comprobarPin('x'); // cuenta como intento fallido (misma espera que el PIN)
    return { ok: false, msg: 'La contraseña no es correcta.', espera: r.espera || 0 };
  }
  try { fs.unlinkSync(archivoBloqueo()); } catch (e) { /* ya no estaba */ }
  bloqueoFallos.n = 0; bloqueoFallos.hasta = 0;
  return { ok: true };
});

// ─── PREFERENCIAS DE UI (tema) ─────────────────────────────────────────────────
// Color de fondo de la ventana según el tema elegido, para que al abrir no haya
// parpadeo claro→oscuro mientras carga index.html (backgroundColor se aplica
// antes de que exista ningún DOM).
function getUiPrefsPath() {
  return path.join(app.getPath('userData'), 'ui-prefs.json');
}

function guardarTemaFondo(color) {
  try {
    let prefs = {};
    try { prefs = JSON.parse(fs.readFileSync(getUiPrefsPath(), 'utf-8')); } catch (e) {}
    prefs.fondo = color;
    fs.writeFileSync(getUiPrefsPath(), JSON.stringify(prefs), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error guardando preferencia de tema:', e.message);
    return false;
  }
}

function leerFondoGuardado() {
  try {
    const prefs = JSON.parse(fs.readFileSync(getUiPrefsPath(), 'utf-8'));
    if (prefs && typeof prefs.fondo === 'string') return prefs.fondo;
  } catch (e) {}
  return '#f6f7f9';
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
    frame: false,
    backgroundColor: leerFondoGuardado(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // La interfaz corre aislada del sistema (sin Node, en el sandbox de
      // Chromium): todo lo que toca archivos pasa por los IPC de este archivo.
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    },
    icon: path.join(__dirname, 'icon.png'),
    title: 'AulaMovil - Autoescuela'
  });
  // Ruta absoluta: loadFile('index.html') se resolvería contra app.getAppPath(),
  // que cambia si se arranca con otro script de entrada (p. ej. npm run smoke).
  mainWin.loadFile(path.join(__dirname, 'index.html'));
  mainWin.setMenuBarVisibility(false);
  blindarVentana(mainWin);

  // Los botones laterales del ratón (atrás/adelante) no deben navegar el
  // historial de Electron: los captura el renderer para ir a la pantalla
  // anterior / siguiente de la app (renderer/historial-pantallas.js).
  mainWin.on('app-command', (event, cmd) => {
    if (cmd === 'browser-backward' || cmd === 'browser-forward') event.preventDefault();
  });

  // Sin marco nativo: la barra de título propia (renderer) necesita saber
  // cuándo la ventana se maximiza/restaura para cambiar el icono del botón.
  mainWin.on('maximize', () => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('ventana-maximizada', true);
  });
  mainWin.on('unmaximize', () => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('ventana-maximizada', false);
  });
  iniciarSensorBarra(mainWin);
}

// ─── BLINDAJE DE LA VENTANA ──────────────────────────────────────────────────
// La ventana solo muestra index.html: no navega a ninguna otra página, no abre
// ventanas nuevas y no concede permisos (cámara, micrófono, ubicación…). Los
// enlaces https que haya en la interfaz se abren en el navegador del sistema.
const PAGINA_APP = 'file://' + path.join(__dirname, 'index.html').replace(/\\/g, '/');
function esPaginaApp(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'file:' && decodeURIComponent(u.pathname).replace(/^\/+/, '').toLowerCase() === PAGINA_APP.replace(/^file:\/+/, '').toLowerCase();
  } catch (e) { return false; }
}
function abrirFuera(url) {
  try { if (new URL(url).protocol === 'https:') shell.openExternal(url); } catch (e) { /* url no válida: nada */ }
}
function blindarVentana(win) {
  const wc = win.webContents;
  wc.on('will-navigate', (e, url) => {
    if (esPaginaApp(url)) return; // recargar la propia app (restaurar copia…)
    e.preventDefault();
    abrirFuera(url);
  });
  wc.on('will-redirect', (e, url) => { if (!esPaginaApp(url)) e.preventDefault(); });
  wc.setWindowOpenHandler(({ url }) => { abrirFuera(url); return { action: 'deny' }; });
  wc.on('will-attach-webview', e => e.preventDefault());
}
const PERMISOS_PERMITIDOS = new Set(['clipboard-sanitized-write', 'fullscreen']);
app.whenReady().then(() => {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((wc, permiso, cb) => cb(PERMISOS_PERMITIDOS.has(permiso)));
  session.defaultSession.setPermissionCheckHandler((wc, permiso) => PERMISOS_PERMITIDOS.has(permiso));
});

// ─── SENSOR DE LA BARRA DE TÍTULO ────────────────────────────────────────────
// La barra de título es zona de arrastre de la ventana (-webkit-app-region:
// drag) y Windows no entrega al renderer los eventos de ratón que pasan por
// ella. Para el cajón que se despliega al pasar el ratón (renderer/ventana.js)
// se mira aquí la posición del cursor, solo con la ventana activa, y se avisa
// al renderer al entrar/salir de la barra. Mientras se arrastra o redimensiona
// la ventana no se avisa de nada (que no se abra el cajón al moverla).
const ALTO_BARRA_TITULO = 32;
function iniciarSensorBarra(win) {
  const { screen } = require('electron');
  let moviendoHasta = 0, ultimo = null;
  const moviendo = () => { moviendoHasta = Date.now() + 700; };
  win.on('will-move', moviendo); win.on('move', moviendo); win.on('will-resize', moviendo);
  const t = setInterval(() => {
    if (!win || win.isDestroyed()) { clearInterval(t); return; }
    let dentro = false, x = 0;
    if (win.isFocused() && !win.isMinimized() && win.isVisible() && Date.now() > moviendoHasta) {
      const p = screen.getCursorScreenPoint(), b = win.getContentBounds();
      x = p.x - b.x;
      const y = p.y - b.y;
      dentro = x >= 0 && x < b.width && y >= 0 && y < ALTO_BARRA_TITULO;
    }
    const clave = dentro ? 'd' + Math.round(x / 12) : 'f';
    if (clave === ultimo) return;
    ultimo = clave;
    win.webContents.send('barra-sensor', { dentro, x: Math.round(x) });
  }, 110);
  if (typeof t.unref === 'function') t.unref();
}

app.whenReady().then(() => {
  createWindow();
  // Comprueba actualizaciones 3s después de arrancar (no bloquea el inicio).
  // checkForUpdates y no checkForUpdatesAndNotify: los avisos son de la app.
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000);

  // Cargar credenciales de sincronización (si el usuario ya las configuró)
  const creds = loadSyncCreds();
  if (creds) sync.restaurarCredenciales(creds.email, creds.password);

  // Arrancar sync automático (cada 2 min)
  sync.startAutoSync(2 * 60 * 1000);

  // Notificar a la UI cuando cambia el estado de sync
  // (el motivo del error viaja junto al estado para poder mostrarlo en la UI)
  sync.onStatusChange((status) => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('sync-status', status, sync.getLastError());
    }
  });

  // Avisar cuando un sync (automático o manual) detecta conflictos reales:
  // dos ediciones a la vez del mismo registro entre este PC y otro dispositivo.
  sync.onConflictos((conflictos) => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('sync-conflictos', conflictos.length);
    }
  });
});

// ─── ACTUALIZACIONES ─────────────────────────────────────────────────────────
// Sin cuadros de Windows: el proceso principal solo busca, descarga e instala;
// las preguntas («¿Descargar la nueva versión?» y, ya descargada, «¿Instalar
// ahora?») las hace la propia app con sus ventanas (renderer/ajustes.js →
// ACTUALIZACIONES). `estadoUpdate` guarda en qué punto está para que la
// pantalla lo recupere aunque el aviso llegue antes de que termine de cargar.
let estadoUpdate = { fase: 'nada' }; // nada | disponible | descargando | descargada

// Notas de la versión (GitHub las da en HTML) → texto plano corto.
function textoNotas(notas) {
  const entidades = t => t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  // A veces llega con el HTML escapado (&lt;p&gt;): se desescapa antes de quitar etiquetas
  const html = entidades(Array.isArray(notas) ? notas.map(n => (n && n.note) || '').join('\n') : String(notas || ''));
  const texto = entidades(html
    .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n').replace(/<\s*li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return texto.length > 900 ? texto.slice(0, 900).replace(/\s+\S*$/, '') + '…' : texto;
}

function avisarUpdate(canal, extra) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(canal, extra === undefined ? estadoUpdate : extra);
}

autoUpdater.on('update-not-available', () => {
  if (estadoUpdate.fase === 'disponible') estadoUpdate = { fase: 'nada' };
  avisarUpdate('update-not-available', null);
});

autoUpdater.on('update-available', (info) => {
  if (isDownloading || estadoUpdate.fase === 'descargada') return; // ya en marcha: nada que preguntar
  const archivo = (info.files || [])[0] || {};
  estadoUpdate = {
    fase: 'disponible', version: info.version, actual: app.getVersion(),
    notas: textoNotas(info.releaseNotes), tamano: archivo.size || null,
  };
  avisarUpdate('update-available');
});

function descargarUpdate() {
  if (isDownloading || estadoUpdate.fase !== 'disponible') return { ok: false };
  isDownloading = true;
  estadoUpdate = { ...estadoUpdate, fase: 'descargando', pct: 0 };
  avisarUpdate('update-download-start', estadoUpdate.version);
  autoUpdater.downloadUpdate().catch(err => {
    console.error('Download error:', err);
    isDownloading = false;
    estadoUpdate = { ...estadoUpdate, fase: 'disponible' };
    avisarUpdate('update-error', err.message);
  });
  return { ok: true };
}

autoUpdater.on('download-progress', (p) => {
  estadoUpdate.pct = Math.round(p.percent);
  avisarUpdate('update-download-progress', estadoUpdate.pct);
});

autoUpdater.on('error', (err) => {
  console.error('AutoUpdater error:', err);
  const descargando = isDownloading;
  isDownloading = false;
  if (estadoUpdate.fase === 'descargando') estadoUpdate = { ...estadoUpdate, fase: 'disponible' };
  if (!mainWin) return;
  const msg = (err.message || '').toLowerCase();
  // Si no hay releases en GitHub o da 404/ENOTFOUND, tratar como "no hay actualización"
  if (!descargando && (msg.includes('404') || msg.includes('no published') || msg.includes('enotfound') ||
      msg.includes('cannot find') || msg.includes('net::') || msg.includes('httperror'))) {
    avisarUpdate('update-not-available', null);
  } else {
    avisarUpdate('update-error', err.message);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  isDownloading = false;
  estadoUpdate = { ...estadoUpdate, fase: 'descargada', version: (info && info.version) || estadoUpdate.version, pct: 100 };
  avisarUpdate('update-downloaded');
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

ipcMain.handle('app:version', () => app.getVersion());

// Ventana (barra de título propia, sin marco nativo: frame: false)
ipcMain.handle('ventana-minimizar', () => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.minimize();
});
ipcMain.handle('ventana-maximizar', () => {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMaximized()) mainWin.unmaximize();
    else mainWin.maximize();
  }
});
ipcMain.handle('ventana-cerrar', () => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.close();
});
ipcMain.handle('ventana-esta-maximizada', () => {
  if (mainWin && !mainWin.isDestroyed()) return mainWin.isMaximized();
  return false;
});
ipcMain.handle('guardar-tema-fondo', (_, color) => guardarTemaFondo(color));

ipcMain.handle('get-vehiculos', (_, sucursalId) => db.getVehiculos(sucursalId));
ipcMain.handle('add-vehiculo', (_, nombre, matricula, km_actual, sucursalId, datos) => {
  const id = db.addVehiculo(nombre, matricula, km_actual, sucursalId, datos);
  return id;
});
ipcMain.handle('delete-vehiculo', (_, id) => { db.deleteVehiculo(id); return true; });
ipcMain.handle('update-vehiculo-km', (_, id, km) => { db.updateVehiculoKm(id, km); return true; });
ipcMain.handle('update-vehiculo', (_, id, nombre, matricula, datos) => { db.updateVehiculo(id, nombre, matricula, datos); return true; });
ipcMain.handle('set-vehiculo-activo', (_, id, activo) => db.setVehiculoActivo(id, activo));

ipcMain.handle('get-profesores', (_, sucursalId) => db.getProfesores(sucursalId));
ipcMain.handle('add-profesor', (_, nombre, nota, sucursalId, dni, datos) => db.addProfesor(nombre, nota, sucursalId, dni, datos));
ipcMain.handle('delete-profesor', (_, id) => { db.deleteProfesor(id); return true; });
ipcMain.handle('update-profesor', (_, id, nombre, nota, dni, datos) => { db.updateProfesor(id, nombre, nota, dni, datos); return true; });
ipcMain.handle('get-firma-profesor', (_, id) => db.getFirmaProfesor(id));
ipcMain.handle('get-director', () => db.getDirector());
ipcMain.handle('set-director', (_, datos) => db.setDirector(datos));
ipcMain.handle('get-firma-director', (_, propia) => db.getFirmaDirector(!!propia));
ipcMain.handle('set-firma-director', (_, firma) => db.setFirmaDirector(firma));
ipcMain.handle('set-firma-profesor', (_, id, firma) => db.setFirmaProfesor(id, firma));

ipcMain.handle('get-tarifas', () => db.getTarifas());
ipcMain.handle('set-tarifa', (_, permiso, tipo, precio) => db.setTarifa(permiso, tipo, precio));
ipcMain.handle('delete-tarifa', (_, id) => { db.deleteTarifa(id); return true; });

ipcMain.handle('get-alumnos', (_, sucursalId) => db.getAlumnos(sucursalId));
ipcMain.handle('set-nota-practica', (_, id, nota) => db.setNotaPractica(id, nota));
ipcMain.handle('get-ficha-alumno', (_, alumnoId, hoy) => db.getFichaAlumno(alumnoId, hoy));
ipcMain.handle('get-alumnos-lista', (_, sucursalId, hoy) => db.getAlumnosLista(sucursalId, hoy));
ipcMain.handle('add-alumno', (_, nombre, permiso, vehiculo_id, profesor_id, sucursalId, email, datos, libro, permisos) => db.addAlumno(nombre, permiso, vehiculo_id, profesor_id, sucursalId, email, datos, libro, permisos));
ipcMain.handle('delete-alumno', (_, id) => { db.deleteAlumno(id); return true; });
ipcMain.handle('update-alumno-campos', (_, id, campos) => db.updateAlumnoCampos(id, campos));
// Alumnos repetidos y nombres juntos (db/alumnos-repetidos.js)
ipcMain.handle('proponer-separar-nombres', (_, ids) => db.proponerSepararNombres(ids));
ipcMain.handle('aplicar-separar-nombres', (_, lista) => db.aplicarSepararNombres(lista));
ipcMain.handle('buscar-alumnos-repetidos', () => db.buscarAlumnosRepetidos());
ipcMain.handle('previa-fusion-alumnos', (_, queda, seVa) => db.previaFusionAlumnos(queda, seVa));
ipcMain.handle('fusionar-alumnos', (_, queda, seVa) => {
  const r = db.fusionarAlumnos(queda, seVa);
  if (r && r.ok) copiarArchivosAlumno(parseInt(seVa), parseInt(queda));
  return r;
});
ipcMain.handle('deshacer-fusion-alumnos', (_, id) => db.deshacerFusionAlumnos(id));
ipcMain.handle('get-fusiones-alumnos', () => db.getFusionesAlumnos());
ipcMain.handle('buscar-alumnos-rapido', (_, texto, limite) => db.buscarAlumnosRapido(texto, limite));
ipcMain.handle('update-alumno', (_, id, nombre, permiso, vehiculo_id, profesor_id, email, datos, libro, permisos) => { db.updateAlumno(id, nombre, permiso, vehiculo_id, profesor_id, email, datos, libro, permisos); return true; });

// Libro de registro de alumnos (RD 1295/2003 art. 39) — mismo patrón "columna
// nueva sincronizada" que el resto de la ficha ampliada, ver db/alumnos.js.
ipcMain.handle('get-libro-registro', (_, sucursalId) => db.getLibroRegistro(sucursalId));
ipcMain.handle('get-siguiente-n-registro', () => db.getSiguienteNRegistro());
ipcMain.handle('get-alumno-con-n-registro', (_, n, exceptoId) => db.getAlumnoConNRegistro(n, exceptoId));
ipcMain.handle('get-vehiculo-de-profesor', (_, profesorId) => db.getVehiculoDeProfesor(profesorId));
ipcMain.handle('set-coche-profesor', (_, profesorId, vehiculoId) => db.setCocheProfesor(profesorId, vehiculoId));
ipcMain.handle('asignar-num-inscripcion', (_, id) => db.asignarNumInscripcion(id));
ipcMain.handle('backfill-num-inscripcion', () => db.backfillNumInscripcion());

ipcMain.handle('get-practicas', (_, alumno_id) => db.getPracticasByAlumno(alumno_id));
ipcMain.handle('get-ultima-practica', (_, alumno_id) => db.getUltimaPractica(alumno_id));
ipcMain.handle('add-practica', (_, alumno_id, vehiculo_id, fecha, km_inicial, km_final, profesor_id, tipo, sucursalId, hora_inicio) =>
  db.addPractica(alumno_id, vehiculo_id, fecha, km_inicial, km_final, profesor_id, tipo, sucursalId, hora_inicio)
);
ipcMain.handle('delete-practica', (_, id) => { db.deletePractica(id); return true; });
ipcMain.handle('get-practicas-duplicadas', (_, alumno_id) => db.getPracticasDuplicadas(alumno_id));
ipcMain.handle('eliminar-practicas-duplicadas', (_, ids) => db.deletePracticasBulk(ids));
ipcMain.handle('update-practica', (_, id, fecha, km_inicial, km_final, profesor_id, tipo, hora_inicio, fraccion) => { db.updatePractica(id, fecha, km_inicial, km_final, profesor_id, tipo, hora_inicio, fraccion); return true; });

ipcMain.handle('get-pagos-alumno', (_, alumno_id) => db.getPagosByAlumno(alumno_id));
ipcMain.handle('add-pago', (_, alumno_id, fecha, cantidad, nota, sucursalId, forma_pago, empleado) => db.addPago(alumno_id, fecha, cantidad, nota, sucursalId, forma_pago, empleado));
ipcMain.handle('update-pago', (_, id, fecha, cantidad, nota, forma_pago, empleado) => { db.updatePago(id, fecha, cantidad, nota, forma_pago, empleado); return true; });
ipcMain.handle('delete-pago', (_, id) => { db.deletePago(id); return true; });
ipcMain.handle('get-deudas', (_, sucursalId) => db.getDeudas(sucursalId));
ipcMain.handle('get-desglose-pagos-alumno', (_, alumno_id) => db.getDesglosePagosAlumno(alumno_id));
ipcMain.handle('get-ficha-practicas-alumno', (_, alumno_id) => db.getFichaPracticasAlumno(alumno_id));
ipcMain.handle('get-arqueo', (_, desde, hasta, sucursalId) => db.getArqueo(desde, hasta, sucursalId));
ipcMain.handle('get-morosos', (_, sucursalId) => db.getMorosos(sucursalId));

ipcMain.handle('get-resumen', (_, sucursalId) => db.getResumen(sucursalId));
ipcMain.handle('get-stats-dashboard', (_, hoy, sucursalId) => db.getStatsDashboard(hoy, sucursalId));
ipcMain.handle('get-panel', (_, hoy, sucursalId) => db.getPanel(hoy, sucursalId));
ipcMain.handle('get-panel-vehiculos', (_, hoy, sucursalId, duracionMin) => db.getPanelVehiculos(hoy, sucursalId, duracionMin));
ipcMain.handle('get-stats-profesores', (_, desde, hasta) => db.getStatsProfesores(desde, hasta));
ipcMain.handle('get-datos-graficos', (_, meses, sucursalId) => db.getDatosGraficos(meses, sucursalId));
ipcMain.handle('get-todas-practicas', (_, filtros) => db.getTodasPracticas(filtros));
ipcMain.handle('get-semaforo-examen', () => db.getSemaforoExamen());
ipcMain.handle('get-semaforo-alumno', (_, alumno_id) => db.getSemaforoAlumno(alumno_id));
ipcMain.handle('get-alumnos-en-riesgo', () => db.getAlumnosEnRiesgo());
ipcMain.handle('get-analisis-vehiculos', () => db.getAnalisisVehiculos());
ipcMain.handle('get-informes', (_, desde, hasta, sucursalId) => db.getInformes(desde, hasta, sucursalId));
ipcMain.handle('get-libro-ventas', (_, desde, hasta, sucursalId, iva) => db.getLibroVentas(desde, hasta, sucursalId, iva));

// Sucursales (fase 2 multi-empresa): CRUD mecánico, la lógica de
// compatibilidad hacia atrás vive en db/sucursales.js (data.json) y en el
// renderer (solo se muestra con migración aplicada Y al menos una sucursal).
ipcMain.handle('get-sucursales', (_, soloActivas) => db.getSucursales(soloActivas));
ipcMain.handle('add-sucursal', (_, nombre) => db.addSucursal(nombre));
ipcMain.handle('renombrar-sucursal', (_, id, nombre) => { db.renombrarSucursal(id, nombre); return true; });
ipcMain.handle('activar-sucursal', (_, id, activa) => { db.activarSucursal(id, activa); return true; });

// Reservas (agenda, "solicitudes de práctica" — Bloque 2 SaaS): CRUD
// mecánico, la lógica de compatibilidad hacia atrás vive en db/reservas.js
// y en sync.js (sin UI todavía, ver db/reservas.js).
ipcMain.handle('get-reservas', (_, sucursalId) => db.getReservas(sucursalId));
ipcMain.handle('add-reserva', (_, datos) => db.addReserva(datos));
ipcMain.handle('update-reserva', (_, id, campos) => { db.updateReserva(id, campos); return true; });
ipcMain.handle('set-estado-reserva', (_, id, estado) => { db.setEstadoReserva(id, estado); return true; });
ipcMain.handle('completar-reserva', (_, id) => db.completarReserva(id));
ipcMain.handle('delete-reserva', (_, id) => { db.deleteReserva(id); return true; });

// Jornada laboral (registro de fichajes, art. 34.9 ET) — local por puesto,
// NO sincroniza con Supabase (ver db/jornadas.js).
ipcMain.handle('get-jornadas', (_, filtros) => db.getJornadas(filtros));
ipcMain.handle('fichar-entrada', (_, datos) => db.ficharEntrada(datos));
ipcMain.handle('fichar-salida', (_, id) => db.ficharSalida(id));
ipcMain.handle('jornada-abierta-de', (_, empleado, sucursalId) => db.jornadaAbiertaDe(empleado, sucursalId));
ipcMain.handle('corregir-jornada', (_, id, campos) => { db.corregirJornada(id, campos); return true; });
ipcMain.handle('borrar-jornada', (_, id) => { db.borrarJornada(id); return true; });

// Vencimientos / alertas de caducidades (ITV, seguro, psicotécnico, DNI...) —
// local por puesto, NO sincroniza con Supabase (ver db/vencimientos.js).
ipcMain.handle('get-vencimientos', (_, sucursalId) => db.getVencimientos(sucursalId));
ipcMain.handle('get-proximos-vencimientos', (_, dias, hoy, sucursalId) => db.getProximosVencimientos(dias, hoy, sucursalId));
ipcMain.handle('add-vencimiento', (_, datos) => db.addVencimiento(datos));
ipcMain.handle('update-vencimiento', (_, id, campos) => { db.updateVencimiento(id, campos); return true; });
ipcMain.handle('set-completado-vencimiento', (_, id, completado) => { db.setCompletadoVencimiento(id, completado); return true; });
ipcMain.handle('delete-vencimiento', (_, id) => { db.deleteVencimiento(id); return true; });

// CRM de captación (leads) — local por puesto, NO sincroniza con Supabase
// (ver db/crm.js).
ipcMain.handle('get-leads', (_, sucursalId) => db.getLeads(sucursalId));
ipcMain.handle('add-lead', (_, datos) => db.addLead(datos));
ipcMain.handle('update-lead', (_, id, campos) => { db.updateLead(id, campos); return true; });
ipcMain.handle('set-estado-lead', (_, id, estado) => { db.setEstadoLead(id, estado); return true; });
ipcMain.handle('delete-lead', (_, id) => { db.deleteLead(id); return true; });
ipcMain.handle('convertir-lead', (_, id) => db.convertirLeadEnAlumno(id));
ipcMain.handle('get-estadisticas-crm', (_, sucursalId) => db.getEstadisticasCrm(sucursalId));

// Exámenes: presentaciones a convocatoria, tasas y estadísticas de aprobados —
// local por puesto, NO sincroniza con Supabase (ver db/convocatorias.js).
ipcMain.handle('get-presentaciones', (_, sucursalId) => db.getPresentaciones(sucursalId));
ipcMain.handle('add-presentacion', (_, datos) => db.addPresentacion(datos));
ipcMain.handle('update-presentacion', (_, id, campos) => { db.updatePresentacion(id, campos); return true; });
ipcMain.handle('set-resultado-presentacion', (_, id, resultado) => { db.setResultadoPresentacion(id, resultado); return true; });
ipcMain.handle('delete-presentacion', (_, id) => { db.deletePresentacion(id); return true; });
ipcMain.handle('buscar-examenes', (_, filtros, sucursalId) => db.buscarExamenes(filtros, sucursalId));

// Bonos / packs de prácticas — local por puesto, NO sincroniza con Supabase
// (ver db/bonos.js).
ipcMain.handle('get-bonos', (_, sucursalId) => db.getBonos(sucursalId));
ipcMain.handle('get-bonos-alumno', (_, alumnoId) => db.getBonosAlumno(alumnoId));
ipcMain.handle('get-saldo-bonos-alumno', (_, alumnoId) => db.getSaldoBonosAlumno(alumnoId));
ipcMain.handle('add-bono', (_, datos) => db.addBono(datos));
ipcMain.handle('update-bono', (_, id, campos) => { db.updateBono(id, campos); return true; });
ipcMain.handle('consumir-bono', (_, id, n) => db.consumirBono(id, n));
ipcMain.handle('reponer-bono', (_, id, n) => db.reponerBono(id, n));
ipcMain.handle('anular-bono', (_, id) => { db.anularBono(id); return true; });
ipcMain.handle('delete-bono', (_, id) => { db.deleteBono(id); return true; });

// Cargos y descuentos (matrícula/tasas/cargos/descuentos/promos — tarea D2
// del PLAN-MAESTRO): CRUD mecánico, la lógica de compatibilidad hacia atrás
// (gateado, sin migración aplicada aún) vive en db/cargos.js y en sync.js.
ipcMain.handle('get-cargos', (_, sucursalId) => db.getCargos(sucursalId));
ipcMain.handle('get-cargos-alumno', (_, alumnoId) => db.getCargosAlumno(alumnoId));
ipcMain.handle('get-total-cargos-alumno', (_, alumnoId) => db.getTotalCargosAlumno(alumnoId));
ipcMain.handle('add-cargo', (_, datos) => db.addCargo(datos));
ipcMain.handle('update-cargo', (_, id, campos) => { db.updateCargo(id, campos); return true; });
ipcMain.handle('delete-cargo', (_, id) => { db.deleteCargo(id); return true; });
ipcMain.handle('add-cargos-alta', (_, alumnoId, conceptos, fecha, sucursalId) => db.addCargosAlta(alumnoId, conceptos, fecha, sucursalId));

ipcMain.handle('get-tasas', (_, sucursalId) => db.getTasas(sucursalId));
ipcMain.handle('get-tasas-alumno', (_, alumnoId) => db.getTasasAlumno(alumnoId));
ipcMain.handle('add-tasa', (_, datos) => db.addTasa(datos));
ipcMain.handle('update-tasa', (_, id, campos) => { db.updateTasa(id, campos); return true; });
ipcMain.handle('delete-tasa', (_, id) => { db.deleteTasa(id); return true; });
ipcMain.handle('get-estadisticas-aprobados', (_, sucursalId) => db.getEstadisticasAprobados(sucursalId));

ipcMain.handle('get-solapamientos', () => db.getSolapamientos());
ipcMain.handle('rellenar-km-masivo', (_, vehiculo_id, kmMin, kmMax, kmInicio, kmFinal) => db.rellenarKmMasivo(vehiculo_id, kmMin, kmMax, kmInicio, kmFinal));
ipcMain.handle('get-practicas-sin-km', (_, vehiculo_id) => db.getPracticasSinKm(vehiculo_id));
ipcMain.handle('corregir-solapamientos', (_, vehiculo_id, kmMin, kmMax) => db.corregirSolapamientos(vehiculo_id, kmMin, kmMax));
ipcMain.handle('generar-km-hasta-maximo', (_, vehiculo_id, kmMin, kmMax, kmMaximo, aplicar) => db.generarKmHastaMaximo(vehiculo_id, kmMin, kmMax, kmMaximo, aplicar));
ipcMain.handle('generar-km-por-rango', (_, vehiculo_id, kmDesde, kmHasta, variacion, aplicar) => db.generarKmPorRango(vehiculo_id, kmDesde, kmHasta, variacion, aplicar));
ipcMain.handle('aplicar-plan-km', (_, vehiculo_id, asignaciones) => db.aplicarPlanKm(vehiculo_id, asignaciones));
ipcMain.handle('proponer-cuadre-km', (_, vehiculo_id, opciones) => db.proponerCuadreKm(vehiculo_id, opciones));
ipcMain.handle('get-companeros-km', (_, vehiculo_id) => db.getCompanerosKm(vehiculo_id));
ipcMain.handle('set-companeros-km', (_, vehiculo_id, lista) => db.setCompanerosKm(vehiculo_id, lista));
ipcMain.handle('aplicar-cuadre-km', (_, vehiculo_id, cambios) => db.aplicarCuadreKm(vehiculo_id, cambios));
ipcMain.handle('deshacer-cuadre-km', (_, id) => db.deshacerCuadreKm(id));
ipcMain.handle('get-cuadres-km', () => db.getCuadresKm());
ipcMain.handle('quitar-km-clase', (_, practica_id) => db.quitarKmClase(practica_id));
ipcMain.handle('proponer-encaje-km', (_, vehiculo_id, practica_id, opciones) => db.proponerEncajeKm(vehiculo_id, practica_id, opciones));
ipcMain.handle('get-encajes-km', (_, vehiculo_id) => db.getEncajesKm(vehiculo_id));
ipcMain.handle('get-clases-coche-km', (_, vehiculo_id, limite) => db.getClasesCocheKm(vehiculo_id, limite));
ipcMain.handle('marcar-hueco-km-revisado', (_, clave, revisado) => db.marcarHuecoRevisado(clave, revisado !== false));
ipcMain.handle('get-resumen-cuadre-km', () => db.getResumenCuadreKm());
// Asistente de km: recomendar y combinar pasos en una sola vista previa
ipcMain.handle('recomendar-plan-km', (_, vehiculo_id) => db.recomendarPlanKm(vehiculo_id));
ipcMain.handle('proponer-plan-km', (_, vehiculo_id, pasos) => db.proponerPlanKm(vehiculo_id, pasos));
// Añadir y editar clases (sesiones de ¼ en ¼, encajar entre otras, firma borrada al cambiar el nº de clases)
ipcMain.handle('get-sesion-clase', (_, practica_id) => db.getSesionClase(practica_id));
ipcMain.handle('proponer-clase', (_, op) => db.proponerClase(op));
ipcMain.handle('aplicar-clase', (_, vistaPrevia) => db.aplicarClase(vistaPrevia));
ipcMain.handle('quitar-sesion-clase', (_, practica_id) => db.quitarSesionClase(practica_id));
ipcMain.handle('sumar-clases-dia', (_, opts) => db.sumarClasesDia(opts));
// Zonas de prácticas (se comparten con la web del móvil vía ajustes_empresa)
ipcMain.handle('get-zonas-practica', () => db.getZonasPractica());
ipcMain.handle('get-practica-detalle', (_, id) => db.getPracticaDetalle(id));
ipcMain.handle('set-zonas-practica', (_, lista) => db.setZonasPractica(lista));
ipcMain.handle('get-duracion-clase', () => db.getDuracionClase());
ipcMain.handle('set-duracion-clase', (_, min) => db.setDuracionClase(min));
ipcMain.handle('get-rango-km', () => db.getRangoKm());
ipcMain.handle('set-rango-km', (_, rango) => db.setRangoKm(rango));
ipcMain.handle('get-km-auto-movil', () => db.getKmAutoMovil());
ipcMain.handle('set-km-auto-movil', (_, rango) => db.setKmAutoMovil(rango));
ipcMain.handle('get-conceptos-cobro', () => db.getConceptosCobro());
ipcMain.handle('set-conceptos-cobro', (_, lista) => db.setConceptosCobro(lista));
// Puesta en marcha: datos reales de arranque y punto de partida de cada alumno
ipcMain.handle('get-puesta-en-marcha', () => db.getPuestaEnMarcha());
ipcMain.handle('guardar-puesta-en-marcha', (_, datos) => db.guardarPuestaEnMarcha(datos));
ipcMain.handle('vaciar-datos-prueba', (_, opciones) => db.vaciarDatosDePrueba(opciones));
// Clases anteriores a la app: anotarlas a mano y crear las que falten (con fecha y km)
ipcMain.handle('get-clases-anteriores', (_, alumnoId) => db.getClasesAnteriores(alumnoId));
ipcMain.handle('guardar-clases-anteriores', (_, alumnoId, filas, opciones) => db.guardarClasesAnteriores(alumnoId, filas, opciones));
ipcMain.handle('leer-archivo-clases-anteriores', (_, texto) => db.leerArchivoClasesAnteriores(texto));
// Plantilla para importar clases anteriores (la que se le pide a la IA)
ipcMain.handle('guardar-plantilla-clases-anteriores', async () => {
  try {
    const r = await dialog.showSaveDialog(mainWin, {
      title: 'Guardar plantilla de clases anteriores', defaultPath: 'plantilla_clases_anteriores.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, '﻿' + db.PLANTILLA_CLASES_ANTERIORES, 'utf-8');
    return { ok: true, path: r.filePath };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});
ipcMain.handle('planificar-clases-anteriores', (_, opciones) => db.planificarClasesAnteriores(opciones));
ipcMain.handle('aplicar-clases-anteriores', (_, plan) => db.aplicarClasesAnteriores(plan));
ipcMain.handle('set-punto-de-partida-alumno', (_, id, clases, km) => db.setPuntoDePartidaAlumno(id, clases, km));
// Traer datos de otro programa (db/migracion.js + db/lector-tablas.js)
// Base de Access de Ariauto leída: se guarda aquí entre la vista previa y la
// importación (son decenas de MB; a la pantalla solo va el resumen).
let ariautoLeido = null;
ipcMain.handle('migracion-abrir-archivo', async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Elegir el archivo que ha sacado tu programa anterior',
    filters: [
      { name: 'Excel, CSV, listados y bases de Access', extensions: ['xlsx', 'xls', 'xlsm', 'ods', 'csv', 'txt', 'tsv', 'dbf', 'htm', 'html', 'xml', 'accdb', 'mdb'] },
      { name: 'Todos los archivos', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
  const ruta = r.filePaths[0];
  if (/\.(accdb|mdb)$/i.test(ruta)) {
    const a = await db.leerAccess(ruta);
    if (!a.ok || !a.ariauto) return a; // otro programa: cada tabla, como una hoja
    ariautoLeido = { archivo: a.archivo, tablas: a.tablas };
    return { ok: true, ariauto: true, archivo: a.archivo, plan: db.previaAriauto(db.planAriauto(a.tablas, {})) };
  }
  return db.leerArchivoTabla(ruta);
});
ipcMain.handle('ariauto-analizar', (_, opciones) => (ariautoLeido ? db.previaAriauto(db.planAriauto(ariautoLeido.tablas, opciones || {})) : { ok: false, errores: ['Vuelve a elegir el archivo de Ariauto.'] }));
ipcMain.handle('ariauto-aplicar', (_, opciones) => {
  if (!ariautoLeido) return { ok: false, errores: ['Vuelve a elegir el archivo de Ariauto.'] };
  const res = db.aplicarAriauto(ariautoLeido.tablas, opciones || {}, ariautoLeido.archivo);
  if (res && res.ok) { ariautoLeido = null; sync.sync().catch(() => {}); }
  return res;
});
ipcMain.handle('migracion-leer-texto', (_, texto) => db.leerTextoTabla(texto));
ipcMain.handle('migracion-detectar', (_, hoja, tipo, filaCabecera) => db.detectarTablaMigracion(hoja, tipo, filaCabecera));
ipcMain.handle('migracion-analizar', (_, entrada) => db.analizarImportacion(entrada));
ipcMain.handle('migracion-aplicar', (_, entrada) => {
  const res = db.aplicarImportacion(entrada);
  if (res && res.ok) sync.sync().catch(() => {}); // que lleguen cuanto antes al móvil
  return res;
});
ipcMain.handle('migracion-historial', () => db.getImportaciones());
ipcMain.handle('migracion-deshacer', (_, id) => {
  const res = db.deshacerImportacion(id);
  if (res && res.ok) sync.sync().catch(() => {});
  return res;
});
ipcMain.handle('get-timeline-vehiculo', (_, vehiculo_id) => db.getTimelineVehiculo(vehiculo_id));

// Registro rápido
ipcMain.handle('get-alumnos-por-vehiculo', (_, vehiculo_id, fecha) => db.getAlumnosPorVehiculo(vehiculo_id, fecha));
ipcMain.handle('registrar-practicas-masivas', (_, vehiculo_id, fecha, alumno_ids) => db.registrarPracticasMasivas(vehiculo_id, fecha, alumno_ids));
ipcMain.handle('eliminar-practica-por-fecha', (_, vehiculo_id, fecha, alumno_id) => db.eliminarPracticaPorFecha(vehiculo_id, fecha, alumno_id));
ipcMain.handle('ajustar-practicas-alumno', (_, vehiculo_id, fecha, alumno_id, delta, profesor_id, tipo) => db.ajustarPracticasAlumno(vehiculo_id, fecha, alumno_id, delta, profesor_id, tipo));
ipcMain.handle('guardar-nota-alumno', (_, vehiculo_id, fecha, alumno_id, nota, profesor_id, tipo) => db.guardarNotaAlumno(vehiculo_id, fecha, alumno_id, nota, profesor_id, tipo));
ipcMain.handle('get-anotaciones-alumno', (_, alumno_id) => db.getAnotacionesAlumno(alumno_id));

ipcMain.handle('get-logs', (_, filtro) => db.getLogs(filtro));
ipcMain.handle('clear-logs', () => db.clearLogs());
ipcMain.handle('validar-solapamiento', (_, vehiculo_id, fecha, kmI, kmF, excluirId) => db.validarSolapamiento(vehiculo_id, fecha, kmI, kmF, excluirId));

ipcMain.handle('crear-backup', () => db.crearBackup());

ipcMain.handle('restaurar-backup', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar backup de AulaMovil',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, msg: 'Cancelado.' };
  return db.restaurarBackup(result.filePaths[0]);
});

ipcMain.handle('get-ultimo-backup', () => db.obtenerUltimoBackup());

ipcMain.handle('restaurar-ultimo-backup', () => {
  const ultimo = db.obtenerUltimoBackup();
  if (!ultimo) return { ok: false, msg: 'No hay copias de seguridad guardadas.' };
  return db.restaurarBackup(ultimo.file);
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
    // Lector universal: separador , ; o tabulador, acentos de Windows, Excel...
    const t = db.leerArchivoTabla(filePath);
    if (!t.ok) return { ok: false, msg: t.error };
    const filas = t.hojas[0].filas;
    if (filas.length < 2) return { ok: false, msg: 'El archivo está vacío o solo tiene cabecera.' };

    const header = filas[0].map(h => h.trim().toLowerCase());
    const required = ['alumno', 'vehiculo', 'fecha', 'km_inicial', 'km_final'];
    for (const r of required) {
      if (!header.includes(r)) return { ok: false, msg: `Falta la columna: ${r}` };
    }

    const rows = [];
    for (let i = 1; i < filas.length; i++) {
      const row = {};
      header.forEach((h, idx) => { row[h] = (filas[i][idx] || '').trim(); });
      if (row.alumno && row.vehiculo && row.fecha) rows.push(row);
    }

    const _min = parseFloat(kmMin);
    const _max = parseFloat(kmMax);
    const min = Number.isFinite(_min) ? _min : 40;
    const max = Number.isFinite(_max) ? _max : 45;
    const res = db.importarCSV(rows, min, max);
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

// Handlers para exportar y comparar CSV - para añadir a main.js

// ─── EXPORTAR TODOS LOS DATOS (Importar y exportar → Exportar) ──────────────
// Excel (una hoja por tipo), CSV (un archivo por tipo, en una carpeta nueva) o
// copia completa en JSON. Con alumnoId: solo lo de ese alumno (derecho de
// acceso / portabilidad). Cada exportación queda en el historial.
const _exportados = new Set(); // rutas escritas por la app: las únicas que se dejan mostrar
ipcMain.handle('catalogo-exportacion', () => db.catalogoExportacion());
ipcMain.handle('exportar-datos', async (_, opciones = {}) => {
  try {
    const o = opciones || {};
    const formato = ['xlsx', 'csv', 'json'].includes(o.formato) ? o.formato : 'xlsx';
    const hoy = new Date().toISOString().slice(0, 10);
    const base = (o.nombreBase ? String(o.nombreBase).replace(/[^\w\-áéíóúñüÁÉÍÓÚÑÜ ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) : '') || 'aulamovil_datos';
    const filtros = { conjuntos: o.conjuntos, desde: o.desde || null, hasta: o.hasta || null, alumnoId: o.alumnoId != null ? o.alumnoId : null, sucursalId: o.sucursalId || null };
    if (formato === 'json') {
      const r = await dialog.showSaveDialog(mainWin, { title: 'Guardar copia de los datos', defaultPath: `${base}_${hoy}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      const copia = db.copiaJSON({ conFirmas: !!o.conFirmas, alumnoId: filtros.alumnoId });
      fs.writeFileSync(r.filePath, JSON.stringify(copia, null, 1), 'utf-8');
      const total = Object.values(copia.tablas).reduce((n, l) => n + l.length, 0);
      db.registrarExportacion(`Exportación JSON${filtros.alumnoId != null ? ' de un alumno' : ''}`, [path.basename(r.filePath), `${total} registros`]);
      _exportados.add(r.filePath);
      return { ok: true, path: r.filePath, total, archivos: [r.filePath] };
    }
    const tablas = db.datosExportacion(filtros);
    if (!tablas.length) return { ok: false, msg: 'No hay nada que exportar con lo elegido.' };
    const total = tablas.reduce((n, t) => n + t.filas.length, 0);
    const resumen = tablas.map(t => `${t.titulo}: ${t.filas.length}`);
    if (formato === 'xlsx') {
      const r = await dialog.showSaveDialog(mainWin, { title: 'Guardar para abrir con Excel', defaultPath: `${base}_${hoy}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(r.filePath, db.libroExcel(tablas));
      db.registrarExportacion('Exportación a Excel', [path.basename(r.filePath), ...resumen]);
      _exportados.add(r.filePath);
      return { ok: true, path: r.filePath, total, tablas: tablas.length, archivos: [r.filePath] };
    }
    const r = await dialog.showOpenDialog(mainWin, { title: 'Elige dónde crear la carpeta con los CSV', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
    let carpeta = path.join(r.filePaths[0], `${base}_${hoy}`);
    for (let i = 2; fs.existsSync(carpeta); i++) carpeta = path.join(r.filePaths[0], `${base}_${hoy}_${i}`);
    fs.mkdirSync(carpeta, { recursive: true });
    const archivos = tablas.map(t => {
      const f = path.join(carpeta, `${t.clave}.csv`);
      fs.writeFileSync(f, db.tablaACSV(t), 'utf-8');
      _exportados.add(f);
      return f;
    });
    _exportados.add(carpeta);
    db.registrarExportacion('Exportación a CSV', [path.basename(carpeta), ...resumen]);
    return { ok: true, path: carpeta, total, tablas: tablas.length, archivos };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});
ipcMain.handle('mostrar-exportado', (_, ruta) => {
  if (!_exportados.has(ruta)) return false; // solo lo que acaba de escribir la app
  shell.showItemInFolder(ruta);
  return true;
});

// ─── LEGAL Y PRIVACIDAD ───────────────────────────────────────────────────────
// Conservación/supresión de alumnos (db/privacidad.js), documentos para firmar
// (hoja de protección de datos, contrato de enseñanza, registro de actividades)
// en PDF, aceptación de las condiciones y textos legales públicos.
const URL_LEGAL = 'https://aulamovil.vercel.app/legal/';
ipcMain.handle('get-alumnos-para-suprimir', (_, anios) => db.getAlumnosParaSuprimir(anios));
ipcMain.handle('anonimizar-alumnos', (_, ids, motivo) => {
  const r = db.anonimizarAlumnos(ids, motivo === 'plazo' ? 'plazo' : 'supresion');
  // Su foto y sus documentos adjuntos se borran de este PC
  for (const id of r.ids || []) {
    try {
      const dirF = _dirFotos();
      if (fs.existsSync(dirF)) for (const f of fs.readdirSync(dirF)) if (f.startsWith('alumno_' + id + '.')) fs.unlinkSync(path.join(dirF, f));
      fs.rmSync(_dirDocumentosAlumno(id), { recursive: true, force: true });
    } catch (e) { console.error('No se pudieron borrar los archivos del alumno', id, e.message); }
  }
  return r;
});
// HTML (lo arma la interfaz) → PDF con la impresora de Chromium, en una ventana
// oculta SIN JavaScript ni acceso a nada: solo pinta el documento.
ipcMain.handle('documento-pdf', async (_, opciones) => {
  const { html, nombre } = opciones || {};
  if (typeof html !== 'string' || html.length > 3000000) return { ok: false, msg: 'Documento no válido.' };
  let win = null;
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false, contextIsolation: true, nodeIntegration: false, images: true } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'custom', top: 0.55, bottom: 0.55, left: 0.6, right: 0.6 } });
    const r = await dialog.showSaveDialog(mainWin, { title: 'Guardar documento', defaultPath: (sanitizarNombre(nombre || 'documento') || 'documento') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, pdf);
    shell.openPath(r.filePath);
    return { ok: true, path: r.filePath };
  } catch (e) {
    return { ok: false, msg: e.message };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
});
ipcMain.handle('abrir-legal', (_, pagina) => {
  const p = String(pagina || 'index');
  if (!/^[a-z-]{1,40}$/.test(p)) return false;
  shell.openExternal(URL_LEGAL + (p === 'index' ? '' : p + '.html'));
  return true;
});
ipcMain.handle('get-aceptacion-legal', () => db.getAjusteEmpresa('legal_aceptacion'));
ipcMain.handle('aceptar-legal', (_, version, quien) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(version || ''))) return false;
  const valor = { version: String(version), fecha: new Date().toISOString(), quien: String(quien || '').slice(0, 120), app: app.getVersion() };
  db.setAjusteEmpresa('legal_aceptacion', valor);
  return valor;
});
// Datos públicos de la autoescuela para la web (nombre y contacto del responsable)
ipcMain.handle('set-centro-empresa', (_, c) => {
  const x = c && typeof c === 'object' ? c : {};
  const t = v => String(v == null ? '' : v).trim().slice(0, 160);
  db.setAjusteEmpresa('centro', { denominacion: t(x.denominacion), razon_social: t(x.razon_social), cif: t(x.cif), direccion: t(x.direccion), codigo_postal: t(x.codigo_postal), poblacion: t(x.poblacion), provincia: t(x.provincia), telefono: t(x.telefono), email: t(x.email) });
  return true;
});
ipcMain.handle('licencias-terceros', () => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'licencias-terceros.json'), 'utf-8')); } catch (e) { return []; }
});

// Código postal → provincia y poblaciones (lista de GeoNames, sin conexión)
ipcMain.handle('buscar-codigo-postal', (_, cp) => db.buscarCodigoPostal(cp));

// Exportar listas (alumnos con todos sus datos, exámenes filtrados) a CSV para Excel
ipcMain.handle('exportar-tabla', async (_, tipo, opciones) => {
  try {
    const res = tipo === 'examenes' ? db.exportarExamenes((opciones || {}).filtros || {}, (opciones || {}).sucursalId) : db.exportarAlumnos(opciones || {});
    const result = await dialog.showSaveDialog(mainWin, {
      title: 'Guardar para abrir con Excel',
      defaultPath: res.nombre + '_' + new Date().toISOString().slice(0, 10) + '.csv',
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(result.filePath, res.csv, 'utf-8');
    return { ok: true, total: res.total, path: result.filePath };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

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

// ─── FICHA OFICIAL DGT (formación práctica) ──────────────────────────────────
// Rellena los campos de formulario del impreso oficial de la DGT con los datos
// del alumno (cabecera de escuela desde Ajustes, que llega en `centro`) y sus
// prácticas. Devuelve el PDF por diálogo de guardado y lo abre al terminar.
ipcMain.handle('generar-ficha-dgt', async (_, opciones) => {
  try {
    const { alumnoId, tipo, centro, rellenarFecha, comprobarFirmas } = opciones || {};
    const marcarCalculados = !opciones || opciones.marcarCalculados !== false;
    const firmarPie = !opciones || opciones.firmarPie !== false;
    const datosAlumno = db.getDatosFichaDGT(alumnoId, tipo === 'destreza' ? 'destreza' : 'circulacion');
    if (!datosAlumno) return { ok: false, msg: 'Alumno no encontrado.' };
    if (!datosAlumno.practicas.length) {
      return { ok: false, msg: 'Este alumno no tiene prácticas de ' + (tipo === 'destreza' ? 'destreza/pista' : 'circulación') + ' registradas.' };
    }
    // Profesores de estas clases (y el del pie) o director sin firma guardada:
    // la pantalla se la pide antes de generar (y vuelve a llamar con
    // comprobarFirmas=false).
    if (comprobarFirmas) {
      const faltan = [...datosAlumno.profesores_sin_firma];
      const pf = datosAlumno.profesor;
      if (firmarPie && pf.id != null && !pf.firma && !faltan.some(f => f.id === pf.id)) faltan.push({ id: pf.id, nombre: pf.nombre });
      const dir = datosAlumno.director;
      const faltaDirector = firmarPie && !dir.firma && !(dir.profesor_id != null && faltan.some(f => f.id === dir.profesor_id));
      if (faltan.length || faltaDirector) return { ok: false, faltanFirmas: faltan, faltaDirector, director: dir.nombre || '' };
    }
    const { generarFichaDGT } = require('./fichas-dgt');
    const bytes = await generarFichaDGT({
      tipo: tipo === 'destreza' ? 'destreza' : 'circulacion',
      centro: centro || {},
      alumno: datosAlumno.alumno,
      profesor: datosAlumno.profesor,
      director: datosAlumno.director,
      firmarPie,
      marcarCalculados,
      practicas: datosAlumno.practicas,
      rellenarFecha: rellenarFecha !== false,
    });

    const nombreArchivo = 'Ficha_DGT_' + sanitizarNombre(
      [datosAlumno.alumno.primer_apellido, datosAlumno.alumno.segundo_apellido, datosAlumno.alumno.nombre]
        .filter(Boolean).join('_') || ('alumno_' + alumnoId)
    ) + '.pdf';
    const result = await dialog.showSaveDialog(mainWin, {
      title: 'Guardar ficha DGT',
      defaultPath: nombreArchivo,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(result.filePath, Buffer.from(bytes));
    shell.openPath(result.filePath);
    return {
      ok: true, path: result.filePath, nClases: datosAlumno.practicas.reduce((n, p) => n + p.clases, 0),
      dias: datosAlumno.practicas.length,
      sinFirmaAlumno: datosAlumno.practicas.filter(p => !p.firma_alumno).length,
      pieSinFirmar: firmarPie ? [!datosAlumno.director.firma && 'director', !datosAlumno.profesor.firma && 'profesor'].filter(Boolean) : null,
    };
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

// Generar km aleatorio entre min y max, SIN decimales (kilómetros enteros)
ipcMain.handle('generar-km', (_, kmInicial, min = 40, max = 45) => {
  const kmI = Math.round(kmInicial);
  const diff = Math.round(Math.random() * (max - min) + min);
  const kmFinal = kmI + diff;
  return { km_inicial: kmI, km_final: kmFinal, diff };
});

// ─── FICHEROS DE ALUMNO (D7) ────────────────────────────────────────────────────
// Foto y documentos del alumno, almacenados solo en local (sin sync, sin Supabase Storage).
function _dirUserData() {
  return app.getPath('userData');
}
function _dirFotos() {
  return path.join(_dirUserData(), 'fotos');
}
function _dirDocumentosAlumno(id) {
  return path.join(_dirUserData(), 'documentos', 'alumno_' + id);
}

// Al juntar dos fichas: los documentos de la que se va se copian a la que se
// queda, y su foto si la que se queda no tiene (se copian: «Deshacer» no los pierde).
function copiarArchivosAlumno(deId, aId) {
  try {
    const origen = _dirDocumentosAlumno(deId);
    if (fs.existsSync(origen)) {
      const destino = _dirDocumentosAlumno(aId);
      fs.mkdirSync(destino, { recursive: true });
      for (const f of fs.readdirSync(origen)) {
        let nombre = f, k = 2;
        while (fs.existsSync(path.join(destino, nombre))) nombre = f.replace(/(\.[^.]*)?$/, m => ` (${k++})${m}`);
        fs.copyFileSync(path.join(origen, f), path.join(destino, nombre));
      }
    }
    const dirF = _dirFotos();
    if (fs.existsSync(dirF)) {
      const fotos = fs.readdirSync(dirF);
      const suya = fotos.find(f => f.startsWith('alumno_' + deId + '.'));
      if (suya && !fotos.some(f => f.startsWith('alumno_' + aId + '.'))) fs.copyFileSync(path.join(dirF, suya), path.join(dirF, suya.replace('alumno_' + deId + '.', 'alumno_' + aId + '.')));
    }
  } catch (e) { console.error('No se pudieron copiar los archivos del alumno:', e.message); }
}

ipcMain.handle('guardar-foto-alumno', (_, id, dataUrl) => {
  try {
    if (!Number.isInteger(id)) return { ok: false, msg: 'Id de alumno no válido' };
    const ext = extensionDeDataUrl(dataUrl);
    if (!ext) return { ok: false, msg: 'Formato de imagen no soportado' };
    const dir = _dirFotos();
    fs.mkdirSync(dir, { recursive: true });
    // Borra cualquier foto previa de este alumno (puede tener otra extensión)
    const prefijo = 'alumno_' + id + '.';
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(prefijo)) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (e) {}
      }
    }
    const b64 = dataUrl.split(',')[1];
    fs.writeFileSync(path.join(dir, 'alumno_' + id + '.' + ext), Buffer.from(b64, 'base64'));
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

ipcMain.handle('get-foto-alumno', (_, id) => {
  try {
    if (!Number.isInteger(id)) return null;
    const dir = _dirFotos();
    if (!fs.existsSync(dir)) return null;
    const prefijo = 'alumno_' + id + '.';
    const f = fs.readdirSync(dir).find(n => n.startsWith(prefijo));
    if (!f) return null;
    const ext = f.split('.').pop().toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const buf = fs.readFileSync(path.join(dir, f));
    return 'data:' + mime + ';base64,' + buf.toString('base64');
  } catch (e) {
    return null;
  }
});

ipcMain.handle('borrar-foto-alumno', (_, id) => {
  try {
    if (!Number.isInteger(id)) return { ok: false, msg: 'Id de alumno no válido' };
    const dir = _dirFotos();
    if (!fs.existsSync(dir)) return { ok: true };
    const prefijo = 'alumno_' + id + '.';
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(prefijo)) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (e) {}
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

// Extensiones que Windows ejecuta al abrirlas: no se adjuntan ni se abren desde la app
const EXTENSIONES_EJECUTABLES = /\.(exe|com|bat|cmd|scr|pif|cpl|msi|msp|msc|ps1|psm1|vbs|vbe|js|jse|jar|wsf|wsh|hta|lnk|url|reg|inf|application|gadget|dll|sys|appx|msix)$/i;
ipcMain.handle('adjuntar-documento-alumno', (_, id, nombre, dataUrl) => {
  try {
    if (!Number.isInteger(id)) return { ok: false, msg: 'Id de alumno no válido' };
    if (EXTENSIONES_EJECUTABLES.test(String(nombre || ''))) return { ok: false, msg: 'Por seguridad no se pueden adjuntar programas ni accesos directos. Adjunta PDF, imágenes o documentos.' };
    if (typeof dataUrl !== 'string' || dataUrl.indexOf(',') === -1) {
      return { ok: false, msg: 'Fichero inválido' };
    }
    const b64 = dataUrl.split(',')[1];
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > 15 * 1024 * 1024) {
      return { ok: false, msg: 'El fichero supera el tamaño máximo permitido (15 MB)' };
    }
    const dir = _dirDocumentosAlumno(id);
    fs.mkdirSync(dir, { recursive: true });
    const nombreFinal = Date.now() + '_' + sanitizarNombre(nombre);
    fs.writeFileSync(path.join(dir, nombreFinal), buf);
    return { ok: true, fichero: nombreFinal };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

ipcMain.handle('get-documentos-alumno', (_, id) => {
  try {
    if (!Number.isInteger(id)) return [];
    const dir = _dirDocumentosAlumno(id);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map(f => {
      const ruta = path.join(dir, f);
      const st = fs.statSync(ruta);
      return { nombre: f.replace(/^\d+_/, ''), ruta, tamano: st.size };
    });
  } catch (e) {
    return [];
  }
});

ipcMain.handle('abrir-documento-alumno', (_, ruta) => {
  try {
    const base = path.resolve(_dirUserData(), 'documentos') + path.sep;
    const resuelta = path.resolve(String(ruta || ''));
    if (!resuelta.startsWith(base)) return { ok: false, msg: 'Ruta no permitida' };
    if (EXTENSIONES_EJECUTABLES.test(resuelta)) return { ok: false, msg: 'Por seguridad este tipo de archivo no se abre desde la app.' };
    shell.openPath(resuelta);
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

ipcMain.handle('borrar-documento-alumno', (_, ruta) => {
  try {
    const base = path.resolve(_dirUserData(), 'documentos') + path.sep;
    const resuelta = path.resolve(String(ruta || ''));
    if (!resuelta.startsWith(base)) return { ok: false, msg: 'Ruta no permitida' };
    if (fs.existsSync(resuelta)) fs.unlinkSync(resuelta);
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

// ─── UPDATER IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('check-for-updates', async () => {
  try {
    // null = no se puede buscar (app sin instalar, p. ej. npm start): «no hay»
    if (!await autoUpdater.checkForUpdates()) avisarUpdate('update-not-available', null);
  } catch (e) { /* ya lo avisa autoUpdater.on('error') */ }
});
ipcMain.handle('estado-actualizacion', () => estadoUpdate);
ipcMain.handle('descargar-actualizacion', () => descargarUpdate());
// Instalación silenciosa (sin el asistente de Windows) y se vuelve a abrir sola
ipcMain.handle('install-update', () => {
  if (estadoUpdate.fase !== 'descargada') return { ok: false };
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return { ok: true };
});

// ─── SYNC IPC HANDLERS ────────────────────────────────────────────────────────
ipcMain.handle('sync-now', async () => sync.sync());
ipcMain.handle('cerrar-otras-sesiones', async () => sync.cerrarOtrasSesiones());
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
ipcMain.handle('registrar-empresa', async (_, email, password) => {
  const res = await sync.registrarEmpresa(email, password);
  if (res.ok && res.estado === 'activa') {
    // Alta con sesión directa: persistir credenciales igual que hace 'save-sync-creds',
    // para que sigan disponibles en el próximo arranque.
    saveSyncCreds(email, password);
  }
  return res; // nunca incluye la contraseña
});
ipcMain.handle('get-estado-cuenta', () => sync.getEstadoCuenta());
ipcMain.handle('solicitar-reset-password', async (_, email) => sync.solicitarResetPassword(email));
// Resuelve un conflicto de "datos locales de otra cuenta" detectado tras un
// login/registro (ver getEstadoCuenta().conflictoEmpresa): vacía data.json y
// pending_sync.json, adopta la cuenta actual y sincroniza para bajar sus
// datos reales.
ipcMain.handle('resolver-conflicto-empresa', async () => sync.resolverConflictoEmpresa());
// Varias cuentas en el mismo PC: al entrar con otra, sus datos locales se
// cambian por los de esa cuenta (los de la anterior quedan guardados aparte).
ipcMain.handle('cambiar-datos-de-cuenta', async (_, ajustesLocales) => sync.cambiarDatosDeCuenta(ajustesLocales));
ipcMain.handle('get-cuentas-guardadas', () => sync.getCuentasGuardadas());
ipcMain.handle('contar-pendientes', () => sync.contarPendientes());
ipcMain.handle('clear-sync-creds', () => {
  try {
    const p = getCredsPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    console.error('Error borrando credenciales:', e.message);
  }
  sync.setCredentials(null, null);
  return { ok: true };
});

// Roles (jefe/empleado, fase 2 multi-empresa): mecánicos, la lógica de
// compatibilidad hacia atrás (modo clásico si `perfiles` no existe) vive en sync.js.
ipcMain.handle('get-perfil-actual', async () => sync.getPerfilActual());
// Módulos contratados por empresa (fase 0 SaaS, entitlements): mecánico,
// misma lógica de compatibilidad hacia atrás (modo clásico si `perfiles` o
// `modulos_empresa` no existen) en sync.js.
ipcMain.handle('get-modulos-activos', async () => sync.getModulosActivos());
ipcMain.handle('listar-empleados', async () => sync.listarEmpleados());
ipcMain.handle('invitar-empleado', async (_, email, rol, sucursalId) => sync.invitarEmpleado(email, rol, sucursalId));
ipcMain.handle('cambiar-rol-empleado', async (_, userId, rol) => sync.cambiarRolEmpleado(userId, rol));
ipcMain.handle('quitar-empleado', async (_, userId) => sync.quitarEmpleado(userId));
