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

test('borrarJornada elimina el registro', () => {
  const id = db.ficharEntrada({ empleado: 'María' });
  expect(db.getJornadas()).toHaveLength(1);

  db.borrarJornada(id);
  expect(db.getJornadas()).toHaveLength(0);
});
