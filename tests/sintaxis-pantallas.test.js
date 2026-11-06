// Jest corre sin pantalla: no ejecuta renderer/ ni la web móvil. Esta prueba al menos las COMPILA, para que un error de
// sintaxis (una comilla, un salto de línea mal escapado…) salte aquí y no al arrancar la app (pasó con registro-rapido.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const compila = (codigo, nombre) => { expect(() => new vm.Script(codigo, { filename: nombre })).not.toThrow(); };

describe('todo el JavaScript de las pantallas compila', () => {
  const renderer = fs.readdirSync(path.join(raiz, 'renderer')).filter(f => f.endsWith('.js'));
  test.each(renderer)('renderer/%s', f => compila(fs.readFileSync(path.join(raiz, 'renderer', f), 'utf8'), f));

  test('index.html carga solo scripts que existen', () => {
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    expect(scripts.length).toBeGreaterThan(30);
    for (const s of scripts) expect(fs.existsSync(path.join(raiz, s))).toBe(true);
  });

  const paginasWeb = fs.readdirSync(path.join(raiz, 'web-remote')).filter(f => f.endsWith('.html'));
  test.each(paginasWeb)('web-remote/%s (scripts de la página)', f => {
    const html = fs.readFileSync(path.join(raiz, 'web-remote', f), 'utf8');
    const bloques = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(b => b.trim());
    for (const b of bloques) compila(b, f);
  });
});
