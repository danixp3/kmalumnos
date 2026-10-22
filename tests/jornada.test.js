// Tests del registro de jornada laboral (fichajes, art. 34.9 ET). Registro
// LOCAL por puesto: no toca sync.js, solo la capa de datos db/jornadas.js.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('ficharEntrada crea un registro con entrada y sin salida', () => {
  const id = db.ficharEntrada({ empleado: 'María' });
  expect(typeof id).toBe('number');

  const jornadas = db.getJornadas();
  expect(jornadas).toHaveLength(1);
  expect(jornadas[0]).toMatchObject({ id, empleado: 'María', salida: null });
  expect(jornadas[0].entrada).toMatch(/^\d{2}:\d{2}$/);
});

test('ficharEntrada rechaza empleado vacío', () => {
  expect(() => db.ficharEntrada({ empleado: '' })).toThrow();
  expect(() => db.ficharEntrada({ empleado: '   ' })).toThrow();
});

test('ficharSalida rellena la salida de la jornada', () => {
  const id = db.ficharEntrada({ empleado: 'María' });
  const res = db.ficharSalida(id);
  expect(res).toEqual({ ok: true });

  const j = db.getJornadas().find(x => x.id === id);
  expect(j.salida).toMatch(/^\d{2}:\d{2}$/);
});

test('ficharSalida dos veces no sobrescribe la primera', () => {
  const id = db.ficharEntrada({ empleado: 'María' });
  db.ficharSalida(id);
  const primeraSalida = db.getJornadas().find(x => x.id === id).salida;

  const res = db.ficharSalida(id);
  expect(res.ok).toBe(false);
  expect(res.msg).toMatch(/ya tiene salida/i);
  expect(db.getJornadas().find(x => x.id === id).salida).toBe(primeraSalida);
});

test('ficharSalida sobre una jornada inexistente devuelve error', () => {
  const res = db.ficharSalida(999999);
  expect(res).toEqual({ ok: false, msg: 'Jornada no encontrada.' });
});

test('jornadaAbiertaDe detecta la jornada abierta y null tras la salida', () => {
  const id = db.ficharEntrada({ empleado: 'María', sucursal_id: 1 });
  const abierta = db.jornadaAbiertaDe('María', 1);
  expect(abierta).not.toBeNull();
  expect(abierta.id).toBe(id);

  db.ficharSalida(id);
  expect(db.jornadaAbiertaDe('María', 1)).toBeNull();
});

test('jornadaAbiertaDe devuelve null si no hay jornada para ese empleado', () => {
  db.ficharEntrada({ empleado: 'María' });
  expect(db.jornadaAbiertaDe('Otro', null)).toBeNull();
});

test('corregirJornada registra el cambio en correcciones sin perder el rastro', () => {
  const id = db.ficharEntrada({ empleado: 'María' });
  const entradaOriginal = db.getJornadas().find(x => x.id === id).entrada;

  db.corregirJornada(id, { entrada: '08:00', nota: 'Olvidó fichar a tiempo' });

  const j = db.getJornadas().find(x => x.id === id);
  expect(j.entrada).toBe('08:00');
  expect(j.nota).toBe('Olvidó fichar a tiempo');
  expect(j.correcciones).toHaveLength(2); // entrada + nota
  const corrEntrada = j.correcciones.find(c => c.campo === 'entrada');
  expect(corrEntrada.antes).toBe(entradaOriginal);
  expect(corrEntrada.despues).toBe('08:00');
});

test('getJornadas filtra por empleado (substring, case-insensitive)', () => {
  db.ficharEntrada({ empleado: 'María López' });
  db.ficharEntrada({ empleado: 'Juan Pérez' });

  const filtradas = db.getJornadas({ empleado: 'maría' });
  expect(filtradas).toHaveLength(1);
  expect(filtradas[0].empleado).toBe('María López');
});

test('getJornadas filtra por rango de fechas', () => {
  const id = db.ficharEntrada({ empleado: 'María' });
  const hoy = db.getJornadas().find(x => x.id === id).fecha;

  expect(db.getJornadas({ desde: hoy, hasta: hoy })).toHaveLength(1);
  expect(db.getJornadas({ desde: '2099-01-01' })).toHaveLength(0);
  expect(db.getJornadas({ hasta: '2000-01-01' })).toHaveLength(0);
});

test('una jornada no se borra: se anula con motivo, se conserva y queda en el Historial', () => {
  const id = db.ficharEntrada({ empleado: 'María' });
  expect(db.anularJornada(id, '')).toMatchObject({ ok: false });
  expect(db.anularJornada(id, 'Fichada por error')).toMatchObject({ ok: true });
  const j = db.getJornadas()[0];
  expect(db.getJornadas()).toHaveLength(1);
  expect(j.anulada).toMatchObject({ motivo: 'Fichada por error' });
  expect(j.correcciones.at(-1)).toMatchObject({ campo: 'anulada', despues: 'Fichada por error' });
  expect(db.getLogs({ tipo: 'jornada' })[0].descripcion).toMatch(/María.*Fichada por error/);
  // anulada: ni se corrige, ni se le ficha salida, ni cuenta como abierta
  db.corregirJornada(id, { entrada: '08:00' });
  expect(db.getJornadas()[0].entrada).toBe(j.entrada);
  expect(db.ficharSalida(id)).toMatchObject({ ok: false });
  expect(db.jornadaAbiertaDe('María')).toBeNull();
  expect(db.anularJornada(id, 'otra vez')).toMatchObject({ ok: false });
  // el nombre antiguo tampoco borra
  const id2 = db.ficharEntrada({ empleado: 'Luis' });
  db.borrarJornada(id2);
  expect(db.getJornadas()).toHaveLength(2);
});

describe('turno que cruza la medianoche', () => {
  afterEach(() => jest.useRealTimers());
  const a = (d, h, m) => { jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }); jest.setSystemTime(new Date(2026, 9, d, h, m)); };

  test('entrada a las 21:00 y salida a las 00:40: es la misma jornada, con la fecha de salida', () => {
    a(21, 21, 0);
    const id = db.ficharEntrada({ empleado: 'Ana' });
    a(22, 0, 40);
    expect(db.jornadaAbiertaDe('Ana')).toMatchObject({ id });
    expect(db.ficharSalida(id)).toMatchObject({ ok: true });
    expect(db.getJornadas()[0]).toMatchObject({ fecha: '2026-10-21', entrada: '21:00', salida: '00:40', salida_fecha: '2026-10-22' });
  });

  test('una de ayer olvidada sin salida no se cierra hoy con 24 h', () => {
    a(21, 9, 0);
    db.ficharEntrada({ empleado: 'Ana' });
    a(22, 9, 5);
    expect(db.jornadaAbiertaDe('Ana')).toBeNull();
  });
});

test('«Borrar historial» y el recorte a 500 conservan las anotaciones que pide la ley', () => {
  db.addLog('privacidad', 'Alumno anonimizado', []);
  db.addLog('exportacion', 'Datos exportados', []);
  for (let i = 0; i < 520; i++) db.addLog('relleno', `fila ${i}`, []);
  const logs = db.getLogs();
  expect(logs.filter(l => l.tipo === 'relleno')).toHaveLength(500);
  expect(logs.some(l => l.tipo === 'privacidad')).toBe(true);
  expect(logs.some(l => l.tipo === 'exportacion')).toBe(true);
  expect(db.clearLogs()).toBe(2);
  expect(db.getLogs().map(l => l.tipo).sort()).toEqual(['exportacion', 'privacidad']);
});
