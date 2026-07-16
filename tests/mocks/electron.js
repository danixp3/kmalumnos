// Mock de Electron para tests en Node puro.
// app.getPath('userData') devuelve un directorio temporal por proceso,
// de modo que db.js y sync.js escriben ahí y nunca en los datos reales.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = path.join(os.tmpdir(), `kmalumnos-jest-${process.pid}`);
fs.mkdirSync(dir, { recursive: true });

module.exports = {
  app: {
    getPath: () => dir
  }
};
