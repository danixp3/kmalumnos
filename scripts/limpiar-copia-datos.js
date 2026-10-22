// Las pruebas de interfaz (smoke, barrido, capturas) trabajan sobre una COPIA de
// data.json en %TEMP%, que lleva los datos personales de todos los alumnos. Al
// terminar se borra esa copia y lo que la app saca de ella (copias de seguridad,
// cola de sincronización, datos de otras cuentas): no se dejan datos personales
// sueltos en el PC (RGPD art. 5.1.c y 32). Lo que queda (caché de Chromium,
// preferencias, el informe) no lleva datos de alumnos.
const fs = require('fs');
const path = require('path');

const RESTOS = ['data.json', 'data.json.tmp', 'data.json.smoke-bak', 'pending_sync.json', 'local_empresa.json', 'backups', 'cuentas'];

function borrarCopiaDatos(dir) {
  for (const f of RESTOS) {
    try { fs.rmSync(path.join(dir, f), { recursive: true, force: true }); } catch (e) { /* lo que no se pueda, se queda */ }
  }
}

// Envuelve app.exit para que toda salida (normal, por error o por tiempo) limpie
function borrarCopiaAlSalir(app, dir) {
  const salir = app.exit.bind(app);
  app.exit = codigo => { borrarCopiaDatos(dir); salir(codigo); };
}

module.exports = { borrarCopiaDatos, borrarCopiaAlSalir };
