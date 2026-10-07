// Reglas de las actualizaciones automáticas de la app (sin Electron, para poder
// probarlas). Las usa main.js: cuándo volver a mirar si hay versión nueva y
// cuándo es seguro instalarla sola.
//
// Idea: la app se entera sola (mira cada rato y al volver a la ventana), baja
// la versión nueva en segundo plano y la instala cuando nadie está usando el
// ordenador (o al cerrar la app), sin que nadie tenga que ir a Ajustes.

const COMPROBAR_CADA_MS = 20 * 60 * 1000;          // mirada periódica
const MINIMO_ENTRE_COMPROBACIONES_MS = 4 * 60 * 1000; // al volver a la ventana no se insiste antes
const INACTIVIDAD_INSTALAR_SEG = 10 * 60;           // tiempo sin tocar el ordenador para instalar sola
const MIRAR_SI_INSTALAR_CADA_MS = 60 * 1000;

// Preferencias de ESTE PC (se guardan en update-prefs.json)
const PREFS_POR_DEFECTO = { descargarSolas: true, instalarSolas: true };

function normalizarPrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    descargarSolas: typeof r.descargarSolas === 'boolean' ? r.descargarSolas : PREFS_POR_DEFECTO.descargarSolas,
    // Instalar sola exige haberla bajado sola: sin descarga automática no hay nada que instalar a ciegas
    instalarSolas: typeof r.instalarSolas === 'boolean' ? r.instalarSolas : PREFS_POR_DEFECTO.instalarSolas
  };
}

// ¿Toca volver a preguntar si hay versión nueva? (`ultima` = ms de la última comprobación, 0 si nunca)
function tocaComprobar(ahora, ultima, minimo = MINIMO_ENTRE_COMPROBACIONES_MS) {
  return !ultima || ahora - ultima >= minimo;
}

// ¿Se puede instalar ya la versión descargada sin molestar a nadie?
//   fase           'descargada' (lo único instalable)
//   prefs          preferencias del PC
//   inactivoSeg    segundos sin tocar teclado ni ratón (powerMonitor.getSystemIdleTime)
//   sincronizando  hay una sincronización en curso
//   ocupada        la pantalla tiene una ventana abierta, un formulario sin guardar o el tutorial
function puedeInstalarSola({ fase, prefs, inactivoSeg, sincronizando, ocupada }) {
  const p = normalizarPrefs(prefs);
  if (fase !== 'descargada') return { ok: false, motivo: 'no hay nada descargado' };
  if (!p.descargarSolas || !p.instalarSolas) return { ok: false, motivo: 'desactivado en este PC' };
  if (!(inactivoSeg >= INACTIVIDAD_INSTALAR_SEG)) return { ok: false, motivo: 'se está usando el ordenador' };
  if (sincronizando) return { ok: false, motivo: 'sincronizando' };
  if (ocupada) return { ok: false, motivo: 'hay algo abierto o sin guardar' };
  return { ok: true };
}

module.exports = {
  COMPROBAR_CADA_MS, MINIMO_ENTRE_COMPROBACIONES_MS, INACTIVIDAD_INSTALAR_SEG, MIRAR_SI_INSTALAR_CADA_MS,
  PREFS_POR_DEFECTO, normalizarPrefs, tocaComprobar, puedeInstalarSola
};
