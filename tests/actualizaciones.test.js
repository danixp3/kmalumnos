// Reglas de las actualizaciones automáticas (actualizaciones.js): cuándo mirar y
// cuándo es seguro instalar sola.
const fs = require('fs');
const path = require('path');
const A = require('../actualizaciones');

describe('preferencias', () => {
  test('por defecto: descarga e instalación automáticas', () => {
    expect(A.normalizarPrefs(null)).toEqual({ descargarSolas: true, instalarSolas: true });
    expect(A.normalizarPrefs({ descargarSolas: 'sí', instalarSolas: 3 })).toEqual({ descargarSolas: true, instalarSolas: true });
  });
  test('se respeta lo que el usuario apague', () => {
    expect(A.normalizarPrefs({ descargarSolas: false })).toEqual({ descargarSolas: false, instalarSolas: true });
    expect(A.normalizarPrefs({ instalarSolas: false })).toEqual({ descargarSolas: true, instalarSolas: false });
  });
});

describe('cuándo volver a mirar si hay versión nueva', () => {
  const MIN = 60 * 1000;
  test('la primera vez siempre', () => { expect(A.tocaComprobar(1e9, 0)).toBe(true); });
  test('no se insiste antes del mínimo (al volver a la ventana varias veces seguidas)', () => {
    expect(A.tocaComprobar(1e9 + 3 * MIN, 1e9)).toBe(false);
    expect(A.tocaComprobar(1e9 + 5 * MIN, 1e9)).toBe(true);
  });
  test('la mirada periódica es de unos 20 minutos', () => {
    expect(A.COMPROBAR_CADA_MS).toBe(20 * MIN);
  });
});

describe('cuándo se instala sola', () => {
  const lista = { fase: 'descargada', prefs: null, inactivoSeg: 15 * 60, sincronizando: false, ocupada: false };
  test('descargada, nadie usa el ordenador y nada abierto → sí', () => {
    expect(A.puedeInstalarSola(lista).ok).toBe(true);
  });
  test('si no está descargada, no', () => {
    for (const fase of ['nada', 'disponible', 'descargando']) expect(A.puedeInstalarSola({ ...lista, fase }).ok).toBe(false);
  });
  test('mientras se usa el ordenador no: hace falta más de 10 minutos sin tocarlo', () => {
    expect(A.puedeInstalarSola({ ...lista, inactivoSeg: 9 * 60 }).ok).toBe(false);
    expect(A.puedeInstalarSola({ ...lista, inactivoSeg: 10 * 60 }).ok).toBe(true);
  });
  test('no mientras sincroniza ni con una ventana o formulario abierto', () => {
    expect(A.puedeInstalarSola({ ...lista, sincronizando: true }).ok).toBe(false);
    expect(A.puedeInstalarSola({ ...lista, ocupada: true }).ok).toBe(false);
  });
  test('respeta la preferencia del PC (y sin descarga automática tampoco instala a ciegas)', () => {
    expect(A.puedeInstalarSola({ ...lista, prefs: { instalarSolas: false } }).ok).toBe(false);
    expect(A.puedeInstalarSola({ ...lista, prefs: { descargarSolas: false } }).ok).toBe(false);
  });
});

describe('instalador', () => {
  // La 1.16.0 no arrancaba porque main.js pedía un archivo que no iba en el instalador.
  test('todo archivo local que main.js o preload.js cargan va en build.files', () => {
    const raiz = path.join(__dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
    const patrones = pkg.build.files.map(f => new RegExp('^' + f.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/\*/g, '.*').replace(/\*/g, '[^/]*') + '$'));
    const requeridos = new Set();
    for (const f of ['main.js', 'preload.js', 'sync.js']) {
      const src = fs.readFileSync(path.join(raiz, f), 'utf8');
      for (const m of src.matchAll(/require\('(\.\/[^']+)'\)/g)) {
        const rel = m[1].replace(/^\.\//, '');
        const archivo = fs.existsSync(path.join(raiz, rel + '.js')) ? rel + '.js' : (fs.existsSync(path.join(raiz, rel, 'index.js')) ? rel + '/index.js' : rel);
        requeridos.add(archivo);
      }
    }
    expect([...requeridos].length).toBeGreaterThan(3);
    const fuera = [...requeridos].filter(r => !patrones.some(re => re.test(r)));
    expect(fuera).toEqual([]);
  });
});
