// Headless Chromium embeds Helvetica Neue for the Latin stack and does not
// embed Hiragino, PingFang, or Noto when those are only named. 山 (U+5C71)
// and 田 (U+7530) then come back as the Kangxi radicals U+2F2D and U+2F65.
// Arial Unicode MS is the face this renderer actually embeds. It has to sit
// after the Latin faces and before the generic family.
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { inflateSync } from 'zlib';
import { pass, fail, warn, ROOT, toolUnavailable } from './helpers.mjs';

console.log('\nCV templates — Han text stays Han in the PDF');

const FONT_FILES = [
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/Library/Fonts/Arial Unicode.ttf',
  '/Library/Fonts/Arial Unicode MS.ttf',
];

function htmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function inflated(pdf) {
  const chunks = [];
  let i = 0;
  while (i < pdf.length) {
    const idx = pdf.indexOf('stream', i);
    if (idx < 0) break;
    const dictStart = pdf.lastIndexOf('<<', idx);
    const dict = dictStart >= 0 ? pdf.subarray(dictStart, idx).toString('latin1') : '';
    let start = idx + 6;
    if (pdf[start] === 0x0d) start++;
    if (pdf[start] === 0x0a) start++;
    const end = pdf.indexOf('endstream', start);
    if (end < 0) break;
    if (dict.includes('/FlateDecode')) {
      let data = pdf.subarray(start, end);
      while (data.length && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) {
        data = data.subarray(0, data.length - 1);
      }
      chunks.push(inflateSync(data).toString('latin1'));
    }
    i = end + 9;
  }
  return chunks.join('\n');
}

function hanFallbackLast(decl) {
  const faces = decl.split(',').map((s) => s.trim());
  const generic = faces.at(-1);
  const han = faces.at(-2);
  const first = faces[0];
  return (generic === 'sans-serif' || generic === 'serif')
    && (han === "'Arial Unicode MS'" || han === '"Arial Unicode MS"')
    && (first.includes('Liberation') || first === '"Helvetica"');
}

let stacks = 0;
for (const file of htmlFiles(join(ROOT, 'templates'))) {
  const rel = file.slice(ROOT.length + 1);
  const decls = [...readFileSync(file, 'utf8').matchAll(/--font-family:\s*([^;]+);/g)].map((m) => m[1].trim());
  for (const decl of decls) {
    stacks++;
    if (hanFallbackLast(decl)) pass(`${rel} lists Arial Unicode MS after the Latin faces`);
    else fail(`${rel} --font-family must keep a Latin face first and Arial Unicode MS last: ${decl}`);
  }
}
if (stacks >= 8) pass(`checked ${stacks} template font stacks`);
else fail(`expected at least 8 --font-family lines, found ${stacks}`);

const fontFile = FONT_FILES.find((p) => existsSync(p));
if (!fontFile) {
  warn('Arial Unicode MS is not installed, so the PDF glyph check did not run');
} else {
  const decl = readFileSync(join(ROOT, 'templates/cv-template.html'), 'utf8').match(/--font-family:\s*([^;]+);/)[1].trim();
  let browser;
  try {
    const { chromium } = await import('playwright');
    try {
      browser = await chromium.launch({ headless: true });
    } catch (e) {
      toolUnavailable('browser', `Han PDF check skipped: Chromium cannot launch (${e.message.split('\n')[0]})`);
    }
    if (browser) {
      const page = await browser.newPage();
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>body{font-family:${decl};font-size:11px}</style></head><body><p>Jane Doe worked with 山田.</p></body></html>`;
      await page.setContent(html);
      const pdf = Buffer.from(await page.pdf({ format: 'Letter', printBackground: true }));
      const raw = pdf.toString('latin1');
      const text = inflated(pdf);
      const flags = {
        arialUnicode: raw.includes('ArialUnicode'),
        helvetica: raw.includes('Helvetica'),
        shan: text.includes('5C71'),
        tian: text.includes('7530'),
        radicalShan: text.includes('2F2D'),
        radicalTian: text.includes('2F65'),
      };
      if (flags.arialUnicode && flags.helvetica && flags.shan && flags.tian && !flags.radicalShan && !flags.radicalTian) {
        pass('the PDF stores 山 and 田 as U+5C71 and U+7530, and still embeds a Latin face');
      } else {
        fail(`PDF text layer: ${JSON.stringify(flags)}`);
      }
    }
  } finally {
    await browser?.close();
  }
}
