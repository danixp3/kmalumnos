// Auditoría (D6, parte A): getLogs(filtro) en db/core.js — filtro por texto,
// tipo y rango de fechas. Sin filtro debe devolver todo (comportamiento
// idéntico al de antes de añadir la pantalla de Auditoría).
const db = require('../db');
const core = require('../db/core');
const { resetData } = require('./helpers');

beforeEach(() => {
  resetData(db);
});

test('getLogs() sin filtro devuelve todos los logs (comportamiento previo intacto)', () => {
  core.addLog('importacion', 'Importación CSV: 3 prácticas insertadas', []);
  core.addLog('relleno', 'Relleno masivo Coche 1', []);
  expect(db.getLogs().length).toBe(2);
  expect(db.getLogs(undefined).length).toBe(2);
});

test('getLogs({ tipo }) filtra por tipo exacto', () => {
  core.addLog('importacion', 'Importación CSV', []);
  core.addLog('relleno', 'Relleno masivo', []);
  core.addLog('relleno', 'Otro relleno', []);
  const rellenos = db.getLogs({ tipo: 'relleno' });
  expect(rellenos.length).toBe(2);
  expect(rellenos.every(l => l.tipo === 'relleno')).toBe(true);
});

test('getLogs({ texto }) busca en descripción y detalles, sin distinguir mayúsculas', () => {
  core.addLog('importacion', 'Importación CSV: 3 prácticas insertadas', ['fila con ERROR']);
  core.addLog('relleno', 'Relleno masivo Coche 1', []);
  expect(db.getLogs({ texto: 'coche' }).length).toBe(1);
  expect(db.getLogs({ texto: 'ERROR' }).length).toBe(1);
  expect(db.getLogs({ texto: 'no existe' }).length).toBe(0);
});

test('getLogs({ desde, hasta }) filtra por rango de fechas (YYYY-MM-DD)', () => {
  core.addLog('importacion', 'Log de enero', []);
  core.addLog('relleno', 'Log de marzo', []);
  const logs = core.getLogs();
  logs[0].fecha = '2026-03-15T10:00:00.000Z'; // "Log de marzo" (más reciente, va primero)
  logs[1].fecha = '2026-01-10T10:00:00.000Z'; // "Log de enero"

  const enero = db.getLogs({ hasta: '2026-01-31' });
  expect(enero.length).toBe(1);
  expect(enero[0].descripcion).toBe('Log de enero');

  const marzo = db.getLogs({ desde: '2026-03-01' });
  expect(marzo.length).toBe(1);
  expect(marzo[0].descripcion).toBe('Log de marzo');

  const ninguno = db.getLogs({ desde: '2026-06-01' });
  expect(ninguno.length).toBe(0);
});

test('los filtros se combinan (AND)', () => {
  core.addLog('relleno', 'Relleno masivo Coche 1', []);
  core.addLog('relleno', 'Relleno masivo Coche 2', []);
  core.addLog('correccion', 'Corrección Coche 1', []);
  const res = db.getLogs({ tipo: 'relleno', texto: 'coche 1' });
  expect(res.length).toBe(1);
  expect(res[0].descripcion).toBe('Relleno masivo Coche 1');
});
