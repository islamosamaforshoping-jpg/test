import { readFile } from 'node:fs/promises';
import { chromium as playwrightChromium } from 'playwright';
import serverlessChromium from '@sparticuz/chromium';

const fontDirectory = new URL('../node_modules/@fontsource/ibm-plex-sans-arabic/files/', import.meta.url);
let arabicFontCss;

async function embeddedArabicFontCss() {
  if (!arabicFontCss) {
    arabicFontCss = Promise.all([
      readFile(new URL('ibm-plex-sans-arabic-arabic-400-normal.woff2', fontDirectory)),
      readFile(new URL('ibm-plex-sans-arabic-arabic-700-normal.woff2', fontDirectory))
    ]).then(([regular, bold]) => `<style>
      @font-face{font-family:IBMPlexSansArabic;src:url(data:font/woff2;base64,${regular.toString('base64')}) format('woff2');font-style:normal;font-weight:400;font-display:block}
      @font-face{font-family:IBMPlexSansArabic;src:url(data:font/woff2;base64,${bold.toString('base64')}) format('woff2');font-style:normal;font-weight:700;font-display:block}
      body{font-family:IBMPlexSansArabic,Arial,sans-serif!important}
    </style>`);
  }
  return arabicFontCss;
}

export async function renderPdf(html, options) {
  const browser = process.env.VERCEL
    ? await playwrightChromium.launch({
      args: serverlessChromium.args,
      executablePath: await serverlessChromium.executablePath(),
      headless: true
    })
    : await playwrightChromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const fontCss = await embeddedArabicFontCss();
    await page.setContent(html.replace('</html>', `${fontCss}</html>`), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf(options);
  } finally {
    await browser.close();
  }
}
