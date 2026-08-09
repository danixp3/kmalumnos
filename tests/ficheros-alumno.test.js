const { sanitizarNombre, extensionDeDataUrl } = require('../utils-ficheros');

describe('sanitizarNombre', () => {
  test('quita barras y secuencias de traversal', () => {
    const entrada = ['..', '..', 'etc', 'passwd'].join('/');
    const r = sanitizarNombre(entrada);
    expect(r).not.toMatch(/\.\.[\\/]/);
    expect(r).not.toContain('/');
    expect(r).not.toContain('\\');
  });
  test('conserva nombres normales', () => {
    expect(sanitizarNombre('DNI_Ana Garcia.pdf')).toMatch(/DNI.*Ana.*Garcia.*\.pdf$/i);
  });
  test('recorta a 120 caracteres', () => {
    const largo = 'a'.repeat(200) + '.pdf';
    expect(sanitizarNombre(largo).length).toBeLessThanOrEqual(120);
  });
});

describe('extensionDeDataUrl', () => {
  test('reconoce jpeg/png/webp', () => {
    expect(extensionDeDataUrl('data:image/jpeg;base64,abc')).toBe('jpg');
    expect(extensionDeDataUrl('data:image/png;base64,abc')).toBe('png');
    expect(extensionDeDataUrl('data:image/webp;base64,abc')).toBe('webp');
  });
  test('rechaza dataURL no-imagen', () => {
    expect(extensionDeDataUrl('data:application/pdf;base64,abc')).toBeNull();
    expect(extensionDeDataUrl('no-es-un-dataurl')).toBeNull();
  });
});
