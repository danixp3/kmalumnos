// Utilidades comunes: cada test parte de un data.json limpio.
const fs = require('fs');
const os = require('os');
const path = require('path');

const userDataDir = path.join(os.tmpdir(), `kmalumnos-jest-${process.pid}`);

function resetData(db) {
  for (const f of ['data.json', 'data.json.tmp', 'pending_sync.json', 'local_empresa.json', 'cambio_cuenta.json']) {
    const p = path.join(userDataDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  // Datos guardados de otras cuentas (varias cuentas en el mismo PC)
  fs.rmSync(path.join(userDataDir, 'cuentas'), { recursive: true, force: true });
  db._clearCache();
}

module.exports = { resetData, userDataDir };
