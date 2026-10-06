// Comprobaciones de campos (DNI/NIE/CIF, CP, teléfono, email, matrícula),
// escritura de fechas y que todo lo que carga index.html va en el instalador.
const fs = require('fs');
const path = require('path');
const V = require('../renderer/validaciones');
const { dpMascara, dpLeerFecha, dpTextoDe } = require('../renderer/datepicker');
const { buscarCodigoPostal } = require('../db/codigos-postales');

describe('documentos', () => {
  test('DNI con su letra correcta', () => {
    expect(V.validarDocumento('76735508X')).toMatchObject({ tipo: 'dni', valido: true, normalizado: '76735508X' });
    expect(V.validarDocumento(' 76.735.508-x ')).toMatchObject({ valido: true, normalizado: '76735508X' });
  });
  test('DNI con la letra mal propone la buena', () => {
    const r = V.validarDocumento('76735508A');
    expect(r.valido).toBe(false);
    expect(r.sugerido).toBe('76735508X');
    expect(r.mensaje).toMatch(/76735508X/);
  });
  test('DNI sin letra', () => {
    expect(V.validarDocumento('76735508')).toMatchObject({ valido: false, sugerido: '76735508X' });
  });
  test('DNI corto se completa con ceros', () => {
    // 1234567 → 01234567, 1234567 % 23 = 19 → L
    expect(V.validarDocumento('1234567L')).toMatchObject({ valido: true, normalizado: '01234567L' });
  });
  test('NIE', () => {
    expect(V.validarDocumento('X1234567L')).toMatchObject({ tipo: 'nie', valido: true });
    expect(V.validarDocumento('Y1234567X')).toMatchObject({ tipo: 'nie', valido: true });
    expect(V.validarDocumento('X1234567A')).toMatchObject({ tipo: 'nie', valido: false, sugerido: 'X1234567L' });
  });
  test('CIF', () => {
    expect(V.validarDocumento('B12345674')).toMatchObject({ tipo: 'cif', valido: true });
    expect(V.validarDocumento('B12345675')).toMatchObject({ tipo: 'cif', valido: false, sugerido: 'B12345674' });
    expect(V.validarDocumento('Q2826000H')).toMatchObject({ tipo: 'cif', valido: true });
  });
  test('pasaporte u otro documento: no se da por malo', () => {
    expect(V.validarDocumento('PAA123456')).toMatchObject({ tipo: 'otro', valido: true });
    expect(V.documentoDudoso('PAA123456')).toBeNull();
    expect(V.documentoDudoso('')).toBeNull();
    expect(V.documentoDudoso('76735508A')).toMatch(/letra/);
  });
});

describe('código postal', () => {
  test('provincia por los dos primeros dígitos', () => {
    expect(V.validarCodigoPostal('32630')).toMatchObject({ valido: true, provincia: 'Ourense' });
    expect(V.validarCodigoPostal('8001')).toMatchObject({ valido: true, normalizado: '08001', provincia: 'Barcelona' });
    expect(V.validarCodigoPostal('53001').valido).toBe(false);
    expect(V.validarCodigoPostal('123').valido).toBe(false);
  });
  test('poblaciones de la lista de GeoNames', () => {
    const r = buscarCodigoPostal('32630');
    expect(r).toMatchObject({ cp: '32630', provincia: 'Ourense', municipios: ['Xinzo de Limia'] });
    const varias = buscarCodigoPostal('32631');
    expect(varias.municipios).toEqual(['Xinzo de Limia']);
    expect(varias.lugares.length).toBeGreaterThan(5);
    expect(buscarCodigoPostal('04001').municipios).toEqual(['Almería']);
    expect(buscarCodigoPostal('28755').municipios).toEqual(['La Acebeda']);
    expect(buscarCodigoPostal('99999')).toBeNull();
  });
});

describe('teléfono, email y matrícula', () => {
  test('teléfonos españoles y extranjeros', () => {
    expect(V.validarTelefono('600123456')).toMatchObject({ valido: true, normalizado: '600 123 456' });
    expect(V.validarTelefono('+34 988 46 12 34')).toMatchObject({ valido: true, normalizado: '+34 988 46 12 34' });
    expect(V.validarTelefono('60012345').valido).toBe(false);
    expect(V.validarTelefono('500123456').valido).toBe(false);
    expect(V.validarTelefono('+351 912 345 678').valido).toBe(true);
  });
  test('email con errata típica', () => {
    expect(V.validarEmail('ana@gmail.com').valido).toBe(true);
    expect(V.validarEmail('ana@gmail.con')).toMatchObject({ valido: false, sugerido: 'ana@gmail.com' });
    expect(V.validarEmail('ana gmail.com').valido).toBe(false);
  });
  test('matrículas', () => {
    expect(V.validarMatricula('1234bcd')).toMatchObject({ valido: true, normalizado: '1234 BCD' });
    expect(V.validarMatricula('OR-1234-AB').valido).toBe(true);
    expect(V.validarMatricula('1234ABC').valido).toBe(false); // vocales
  });
  test('avisos antes de guardar', () => {
    const avisos = V.avisosDatosDudosos([['DNI', '76735508A', 'documento'], ['Teléfono', '600123456', 'telefono'],
      ['Nacimiento', '2030-01-01', 'nacimiento'], ['Nacimiento', '2020-05-01', 'nacimiento']], '2026-10-07');
    expect(avisos).toHaveLength(3);
    expect(avisos[1]).toMatch(/futura/);
    expect(avisos[2]).toMatch(/6 años/);
  });
});

describe('escribir fechas a mano', () => {
  test('las barras salen solas', () => {
    expect(dpMascara('14')).toBe('14');
    expect(dpMascara('140')).toBe('14/0');
    expect(dpMascara('1404')).toBe('14/04');
    expect(dpMascara('14042026')).toBe('14/04/2026');
    expect(dpMascara('140420261')).toBe('14/04/2026');
    expect(dpMascara('1/')).toBe('01/');
    expect(dpMascara('1/4/26')).toBe('01/04/26');
    expect(dpMascara('14.04.2026')).toBe('14/04/2026');
  });
  test('leer lo escrito', () => {
    expect(dpLeerFecha('14/04/2026')).toBe('2026-04-14');
    expect(dpLeerFecha('1/4/26')).toBe('2026-04-01');
    expect(dpLeerFecha('2026-04-14')).toBe('2026-04-14');
    expect(dpLeerFecha('140426')).toBe('2026-04-14');
    expect(dpLeerFecha('31/02/2026')).toBeNull();
    expect(dpLeerFecha('14/04')).toBeNull();
    expect(dpLeerFecha('')).toBe('');
    // Nacimiento con año de dos cifras: siempre en el pasado
    const dosCifras = String(new Date().getFullYear() + 1).slice(2);
    expect(dpLeerFecha(`01/01/${dosCifras}`, 'nacimiento')).toBe(`19${dosCifras}-01-01`);
    expect(dpLeerFecha('01/01/05', 'nacimiento')).toBe('2005-01-01');
    expect(dpTextoDe('2026-04-14')).toBe('14/04/2026');
  });
});

describe('instalador', () => {
  // La 1.30.0 cargaba date-utils.js desde index.html pero no iba en el
  // instalador: las flechas de día de Registro rápido fallaban en los PCs.
  test('todo <script src> de index.html va en build.files', () => {
    const raiz = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
    const patrones = pkg.build.files.map(f => new RegExp('^' + f.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/\*/g, '.*').replace(/\*/g, '[^/]*') + '$'));
    const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    expect(srcs.length).toBeGreaterThan(10);
    const fuera = srcs.filter(s => !patrones.some(re => re.test(s)));
    expect(fuera).toEqual([]);
    for (const s of srcs) expect(fs.existsSync(path.join(raiz, s))).toBe(true);
  });
});
