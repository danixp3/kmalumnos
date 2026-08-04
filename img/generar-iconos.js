// Genera los iconos de AulaMovil a partir de img/SINFONDO.png (PNG transparente).
// Recorta el margen transparente, cuadra con padding y exporta los tamaños + el .ico.
// Uso: node img/generar-iconos.js
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(__dirname, 'SINFONDO.png');
const TMP = path.join(__dirname, '_tmp_ico');

async function main() {
  // 1) Recortar el margen transparente y cuadrar en un master de 512 con 6% de padding
  const trimmed = await sharp(SRC).trim({ threshold: 10 }).toBuffer();
  const S = 512, pad = Math.round(S * 0.06), inner = S - 2 * pad;
  const master = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const png = (buf, size) => sharp(buf).resize(size, size).png({ compressionLevel: 9 });

  // 2) Icono de la app (ventana + UI) y logo de la web
  await png(master, 256).toFile(path.join(ROOT, 'icon.png'));
  await png(master, 192).toFile(path.join(ROOT, 'web-remote', 'logo.png'));

  // 3) .ico multi-tamaño para el instalador/taskbar de Windows
  fs.mkdirSync(TMP, { recursive: true });
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoFiles = [];
  for (const s of icoSizes) {
    const f = path.join(TMP, `${s}.png`);
    await png(master, s).toFile(f);
    icoFiles.push(f);
  }
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  const ico = await pngToIco(icoFiles);
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), ico);
  fs.rmSync(TMP, { recursive: true, force: true });

  const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1) + ' KB';
  console.log('GENERADO:');
  console.log('  icon.png            ', kb(path.join(ROOT, 'icon.png')));
  console.log('  web-remote/logo.png ', kb(path.join(ROOT, 'web-remote', 'logo.png')));
  console.log('  build/icon.ico      ', kb(path.join(ROOT, 'build', 'icon.ico')));
}

main().catch(e => { console.error(e); process.exit(1); });
