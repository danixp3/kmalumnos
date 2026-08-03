// Utilidades comunes: cada test parte de un data.json limpio.
const fs = require('fs');
const os = require('os');
const path = require('path');

const userDataDir = path.join(os.tmpdir(), `kmalumnos-jest-${process.pid}`);

function resetData(db) {
  for (const f of ['data.json', 'data.json.tmp', 'pending_sync.json', 'local_empresa.json']) {
    const p = path.join(userDataDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db._clearCache();
}

module.exports = { resetData, userDataDir };
