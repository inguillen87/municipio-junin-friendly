// Rasterize the repository's own vector masters. No image generation or remote requests.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'output/brand');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BRAND_BROWSER_CHANNEL || 'chrome' });
try {
  async function render(source, destination, width, height, background = 'transparent') {
    const svg = await fs.readFile(path.join(root, source), 'utf8');
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    await page.setContent(`<html><style>html,body{margin:0;width:100%;height:100%;background:${background}}svg{width:100%;height:100%;display:block}</style><body>${svg}</body></html>`);
    await page.screenshot({ path: path.join(root, destination), omitBackground: background === 'transparent' });
    await page.close();
  }
  for (const size of [180, 192, 512]) await render('assets/pwa/icon.svg', `assets/pwa/icon-${size}.png`, size, size);
  await render('assets/brand/avatar.svg', 'assets/pwa/icon-maskable-512.png', 512, 512);
  await render('assets/brand/avatar.svg', 'output/brand/municontrol-whatsapp-redes-1080.png', 1080, 1080);
  await render('assets/brand/logo-horizontal.svg', 'output/brand/municontrol-logo-completo-transparente.png', 2580, 540);
  await render('assets/brand/logo-horizontal.svg', 'output/brand/municontrol-logo-fondo-claro.png', 2580, 540, '#f6f5f0');
  await render('assets/brand/logo-horizontal-inverse.svg', 'output/brand/municontrol-logo-blanco-transparente.png', 2580, 540);
  await render('assets/brand/municontrol-mark.svg', 'output/brand/municontrol-simbolo-transparente.png', 1080, 1080);
  await render('assets/pwa/icon.svg', 'output/brand/favicon-32.png', 32, 32);
  await render('assets/pwa/icon.svg', 'output/brand/favicon-48.png', 48, 48);
  for (const [source, name] of [['assets/brand/logo-horizontal.svg','municontrol-logo-completo.svg'],['assets/brand/logo-horizontal-inverse.svg','municontrol-logo-blanco.svg'],['assets/brand/municontrol-mark.svg','municontrol-simbolo.svg'],['assets/pwa/icon.svg','favicon.svg']]) {
    await fs.copyFile(path.join(root, source), path.join(output, name));
  }
  const socialPage = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await socialPage.route('**/*', route => route.abort());
  const logo = await fs.readFile(path.join(root, 'assets/brand/logo-horizontal.svg'), 'utf8');
  const icon = await fs.readFile(path.join(root, 'assets/brand/avatar.svg'), 'utf8');
  await socialPage.setContent(`<!doctype html><html lang="es"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#f6f5f0;color:#153a4b;font-family:'Segoe UI',Arial,sans-serif;width:1200px;height:630px;border-top:12px solid #167468;padding:60px 72px}
    .logo{width:350px;height:74px}.logo svg,.icon svg{width:100%;height:100%}.row{display:flex;align-items:center;justify-content:space-between;margin-top:43px;gap:40px}
    h1{font-size:64px;line-height:1.08;letter-spacing:-2.5px;margin:0;font-weight:700}.icon{width:246px;height:246px;border-radius:34px;overflow:hidden;flex:none}
    p{font-size:24px;color:#54717c;margin:24px 0 0}footer{border-top:1px solid #d5e3e4;margin-top:38px;padding-top:24px;font-size:22px;color:#167468;font-weight:600}
    </style><body><div class="logo">${logo}</div><div class="row"><div><h1>Gestión municipal,<br>más simple.</h1><p>Personas · Sueldos · Gestión</p></div><div class="icon">${icon}</div></div><footer>MuniControl · Plataforma de gestión municipal</footer></body></html>`);
  await socialPage.screenshot({ path: path.join(root, 'assets/brand/municontrol-social-card-v1.png') });
  await socialPage.close();
  await fs.copyFile(path.join(root, 'assets/brand/municontrol-social-card-v1.png'), path.join(output, 'municontrol-tarjeta-redes-1200x630.png'));
  console.log('Brand exports ready: standalone vector logos, transparent PNGs, social avatar and favicons.');
} finally { await browser.close(); }
