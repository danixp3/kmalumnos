module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // db.js requiere 'electron' (app.getPath). En los tests lo sustituimos por
  // un mock que apunta a un directorio temporal, para no tocar datos reales.
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/mocks/electron.js'
  }
};
