// esc / escJs (renderer/utils-ui.js): los textos de la gente (apóstrofos, comillas, &, barras) tienen que salir
// idénticos en pantalla, en los campos de los formularios y en los botones, y no romper el HTML.
// Los scripts del renderer son globales y no hay DOM en Jest, así que se saca el código de las dos funciones
// del propio archivo y se prueba el viaje completo: texto → HTML → lo que lee el navegador → texto.
const fs = require('fs');
const path = require('path');

const origen = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'utils-ui.js'), 'utf8');
function extraer(nombre) {
  const i = origen.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error('No está ' + nombre);
  let fin = origen.indexOf('\n}', i);
  return origen.slice(i, fin + 2);
}
const { esc, escJs } = new Function(`${extraer('esc')}\n${extraer('escJs')}\nreturn { esc, escJs };`)();

// Lo que hace el navegador al leer un atributo o un texto: quitar las entidades
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const leerHtml = s => s.replace(/&(amp|lt|gt|quot|#39);/g, m => ENT[m]);

const TEXTOS = [
  "D'Angelo", 'O\'Neill "el Rubio"', "Clase de 20' con rotonda", 'Marta & Luis', 'a\\b', "termina en barra\\", "comilla ' y barra \\' juntas",
  '<script>alert(1)</script>', 'Línea 1\nLínea 2', 'Cal·la; "x"; \'y\'', '100% (50%)', '${no} se evalúa', '`tilde`'
];

describe('esc: texto y atributos', () => {
  test.each(TEXTOS)('recupera el texto original: %j', t => {
    expect(leerHtml(esc(t))).toBe(t);
  });
  test('no deja comillas ni < > sueltos que rompan un atributo o una etiqueta', () => {
    for (const t of TEXTOS) { const e = esc(t); expect(e).not.toMatch(/["'<>]/); expect(e).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#39;)/); }
  });
  test('no pone barras que no estaban (antes «D\'Angelo» salía «D\\\'Angelo»)', () => {
    expect(esc("D'Angelo")).not.toContain('\\');
    expect(leerHtml(esc("D'Angelo"))).toBe("D'Angelo");
  });
  test('vacío, null y 0 siguen dando cadena vacía', () => {
    expect(esc('')).toBe(''); expect(esc(null)).toBe(''); expect(esc(undefined)).toBe(''); expect(esc(0)).toBe('');
  });
  test('un valor con JSON.stringify en un atributo con comillas dobles llega entero', () => {
    const ruta = 'C:\\Users\\Ana\\Documentos\\export "2026"';
    const atributo = `window.api.mostrar(${esc(JSON.stringify(ruta))})`;
    const recibido = [];
    new Function('window', leerHtml(atributo))({ api: { mostrar: v => recibido.push(v) } });
    expect(recibido).toEqual([ruta]);
  });
});

describe('escJs: textos dentro de onclick="f(\'…\')"', () => {
  test.each(TEXTOS)('el manejador recibe el texto original: %j', t => {
    const html = `onclick="abrir(7,'${escJs(t)}')"`;
    // el navegador toma lo que hay entre las comillas dobles del atributo, quita las entidades y lo ejecuta como JavaScript
    const m = html.match(/^onclick="(.*)"$/s);
    expect(m).not.toBeNull();
    const recibido = [];
    new Function('abrir', leerHtml(m[1]))((id, s) => recibido.push([id, s]));
    // los saltos de línea se cambian por espacios (no caben en un texto JS de una línea)
    expect(recibido).toEqual([[7, t.replace(/\r\n|\r|\n/g, ' ')]]);
  });
  test('el atributo no se corta: dentro no queda ninguna comilla doble', () => {
    for (const t of TEXTOS) expect(escJs(t)).not.toContain('"');
  });
  test('vacío da cadena vacía', () => { expect(escJs('')).toBe(''); expect(escJs(null)).toBe(''); });
});

describe('ningún botón del renderer mete texto de la gente sin escJs', () => {
  const dir = path.join(__dirname, '..', 'renderer');
  const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  test('no queda ningún on…="…\'${esc(…)}\'…" (se usa escJs)', () => {
    const malos = [];
    for (const f of archivos) {
      fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).forEach((l, i) => {
        if (/on[a-z]+="[^"]*'\$\{esc\(/.test(l)) malos.push(`${f}:${i + 1}`);
      });
    }
    expect(malos).toEqual([]);
  });
  test('ninguna variable con «Arg» guarda un esc() para un manejador', () => {
    const malos = [];
    for (const f of archivos) {
      fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).forEach((l, i) => {
        if (/\b(nombreArg|claveJs|matArg)\s*=\s*esc\(/.test(l)) malos.push(`${f}:${i + 1}`);
      });
    }
    expect(malos).toEqual([]);
  });
});
