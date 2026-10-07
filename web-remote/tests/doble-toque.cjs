// Prueba manual (no forma parte de `npm run test:api`): pulsa 3 veces seguidas cada botón que escribe datos
// de la web móvil y comprueba que al servidor llega UNA sola petición (el servidor responde con 900 ms de
// retraso, como una cobertura mala). Necesita Playwright instalado (`npm i -D playwright`) y Chromium:
//   node web-remote/tests/doble-toque.cjs        (CHROMIUM_PATH=ruta si hace falta indicar el Chromium)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const srv = spawn('node', ['--import', './web-remote/tests/register.mjs', 'web-remote/tests/servidor-local.mjs'], { cwd: require('path').join(__dirname, '..', '..'), stdio: 'pipe' });
  await new Promise(r => srv.stdout.on('data', d => { if (/listo/.test(String(d))) r(); }));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const tok = 'x.' + Buffer.from(JSON.stringify({ sub: 'emp1' })).toString('base64url') + '.y';
  await ctx.addInitScript(([tok]) => {
    localStorage.setItem('km_sesion', JSON.stringify({ access_token: tok, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3000, user: { id: 'emp1', email: 'a@b.c' } }));
    localStorage.setItem('kmalumnos_profesor:emp1', JSON.stringify({ id: 1, nombre: 'JAVIER PÉREZ ALONSO' }));
    localStorage.setItem('km_mifirma_visto', '1');
  }, [tok]);
  const page = await ctx.newPage();
  const errores = []; const posts = {};
  page.on('pageerror', e => errores.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('CONSOLE ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.route('**/api/**', async route => {
    const r = route.request();
    if (r.method() === 'POST') { const k = new URL(r.url()).pathname; posts[k] = (posts[k] || 0) + 1; await new Promise(res => setTimeout(res, 900)); }
    await route.continue();
  });
  const cuenta = k => posts['/api/' + k] || 0;
  const resultados = [];
  const prueba = (nombre, esperado, real) => { resultados.push(`${real === esperado ? 'OK ' : 'MAL'} ${nombre}: ${real} (esperado ${esperado})`); };
  await page.goto('http://localhost:8123/');
  await page.waitForSelector('#v-hoy.on'); await page.waitForTimeout(800);

  // A) Empezar práctica ×3 clics reales
  await page.evaluate(() => { abrirIniciar({ alumno_id: 1, vehiculo_id: 1 }); });
  await page.waitForSelector('#btn-empezar'); await page.waitForTimeout(300);
  await page.click('#btn-empezar', { clickCount: 3, delay: 15 });
  await page.waitForSelector('#v-curso.on', { timeout: 6000 }); await page.waitForTimeout(300);
  prueba('iniciar-practica (3 clics)', 1, cuenta('iniciar-practica'));

  // B) Km final ×3 (clics) → finalizar
  await page.evaluate(() => { abrirKmFinal(); }); await page.waitForSelector('#btn-firma');
  await page.evaluate(() => { S.kmFinal = String(S.flujo.km_inicial + 30); renderKmFinal(); }); await page.waitForTimeout(300);
  await page.click('#btn-firma', { clickCount: 3, delay: 15 });
  await page.waitForSelector('#v-firma.on', { timeout: 6000 }); await page.waitForTimeout(400);
  prueba('finalizar-practica (3 clics)', 1, cuenta('finalizar-practica'));

  // C) Firma ×3 → firmar
  const cv = await page.locator('#firma-cv').boundingBox();
  await page.mouse.move(cv.x + 30, cv.y + 40); await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(cv.x + 30 + i * 8, cv.y + 40 + (i % 5) * 9);
  await page.mouse.up(); await page.waitForTimeout(200);
  await page.click('#btn-conf', { clickCount: 3, delay: 15 });
  await page.waitForTimeout(2500);
  prueba('firmar-practica (3 clics)', 1, cuenta('firmar-practica'));

  // D) Anotar clase pasada: la función 3 veces seguidas (sin pasar por el guardián de clics)
  await page.evaluate(() => { go('hoy'); abrirAnotar({ alumno_id: 2, volverA: 'hoy' }); }); await page.waitForSelector('#btn-anotar'); await page.waitForTimeout(600);
  await page.evaluate(() => { S.anotar.kmModo = 'sin'; S.anotar.hora = '15:00'; renderAnotar(); }); await page.waitForTimeout(300);
  await page.evaluate(() => { enviarAnotar(); enviarAnotar(); enviarAnotar(); });
  await page.waitForTimeout(2800);
  prueba('anotar-practica (3 llamadas)', 1, cuenta('anotar-practica'));

  // E) Crear alumno ×3 (clics)
  await page.evaluate(() => { go('nuevo'); }); await page.waitForSelector('#btn-nuevo');
  await page.fill('#n-nombre', 'Prueba'); await page.fill('#n-ape1', 'Doble');
  await page.click('#btn-nuevo', { clickCount: 3, delay: 15 });
  await page.waitForTimeout(2800);
  prueba('crear-alumno (3 clics)', 1, cuenta('crear-alumno'));

  // F) Registrar sin cronómetro (3 llamadas)
  await page.evaluate(() => { abrirIniciar({ alumno_id: 2, vehiculo_id: 1 }); }); await page.waitForTimeout(500);
  await page.evaluate(() => { registrarSinCronometro(); registrarSinCronometro(); registrarSinCronometro(); });
  await page.waitForTimeout(2800);
  prueba('practica (registrar sin cronómetro, 3 llamadas)', 1, cuenta('practica'));

  // G) Cancelar práctica en curso ×3
  await page.evaluate(() => { go('hoy'); abrirIniciar({ alumno_id: 2, vehiculo_id: 1 }); }); await page.waitForSelector('#btn-empezar'); await page.waitForTimeout(300);
  await page.evaluate(() => { S.iniciar.km = String((vehiculo(1).ultimo || {}).km_final || vehiculo(1).km_actual); renderIniciar(); });
  await page.click('#btn-empezar'); await page.waitForSelector('#v-curso.on', { timeout: 6000 }); await page.waitForTimeout(400);
  await page.evaluate(() => { cancelarCurso(); cancelarCurso(); cancelarCurso(); });
  await page.waitForTimeout(7000);
  prueba('cancelar-practica (3 llamadas)', 1, cuenta('cancelar-practica'));

  // H) La pantalla no se queda bloqueada
  await page.waitForTimeout(1500);
  console.log('EN_MARCHA al final:', await page.evaluate(() => JSON.stringify([...EN_MARCHA.keys()])), 'vista', await page.evaluate(() => S.vista));
  prueba('sin bloqueo al terminar', false, await page.evaluate(() => document.body.classList.contains('trabajando')));
  console.log(resultados.join('\n'));
  console.log('POSTs:', JSON.stringify(posts));
  console.log('errores:', JSON.stringify(errores));
  await browser.close(); srv.kill();
})().catch(e => { console.error('FALLO', e); process.exit(1); });
