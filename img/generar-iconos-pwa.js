// Genera los iconos de la web del móvil instalable como app (PWA: Android
// «Instalar aplicación» e iOS «Añadir a pantalla de inicio») a partir de
// img/SINFONDO.png. Uso: node img/generar-iconos-pwa.js
//   icons/icon-192.png, icon-512.png        → transparentes (propósito "any")
//   icons/maskable-192.png, maskable-512.png → con fondo y margen de seguridad
//     (Android recorta el icono en círculo/gota: el logo ocupa el 64 % central)
//   icons/apple-touch-icon.png (180)         → con fondo (iOS pinta de negro lo transparente)
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'SINFONDO.png');
const OUT = path.resolve(__dirname, '..', 'web-remote', 'icons');
const FONDO = { r: 0xF3, g: 0xF2, b: 0xEE, alpha: 1 }; // --bg de la web
const TRANSP = { r: 0, g: 0, b: 0, alpha: 0 };

async function lienzo(logo, tam, proporcion, fondo) {
  const dentro = Math.round(tam * proporcion);
  const pieza = await sharp(logo).resize(dentro, dentro, { fit: 'contain', background: TRANSP }).png().toBuffer();
  return sharp({ create: { width: tam, height: tam, channels: 4, background: fondo } })
    .composite([{ input: pieza, gravity: 'center' }]).png({ compressionLevel: 9 });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const logo = await sharp(SRC).trim({ threshold: 10 }).toBuffer();
  for (const t of [192, 512]) {
    await (await lienzo(logo, t, 0.88, TRANSP)).toFile(path.join(OUT, `icon-${t}.png`));
    await (await lienzo(logo, t, 0.64, FONDO)).toFile(path.join(OUT, `maskable-${t}.png`));
  }
  await (await lienzo(logo, 180, 0.78, FONDO)).toFile(path.join(OUT, 'apple-touch-icon.png'));
  console.log('Iconos PWA generados en', OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
