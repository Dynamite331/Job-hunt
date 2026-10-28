// tests/openrouter-wait-for-jd.test.mjs — openrouter-runner waits for a slow
// single-page app to render the job description instead of reading the page
// after a fixed 2 s.
//
// A page that adds its description 3 s after load used to come back as its
// loading shell and was rejected as unreadable. waitForJobText waits until the
// body holds real text (up to 15 s).
//
// Run:  node --test tests/openrouter-wait-for-jd.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { waitForJobText } from '../openrouter-runner.mjs';
import { toolRequired } from './required-tools.mjs';

const SENTENCE =
  'You will own the internal deploy pipeline across three regions, review infrastructure changes, ' +
  'and mentor two engineers working on production systems. ';
const JD = ('Senior Platform Engineer at Acme Corp. ' + SENTENCE.repeat(30)).slice(0, 3000);

const PAGE = `<!doctype html><html><head><title>Job</title></head><body>
<div id="app">Loading...</div>
<script>
  setTimeout(() => {
    document.getElementById('app').textContent = ${JSON.stringify(JD)};
  }, 3000);
</script></body></html>`;

// Needs a real Chromium: skip where none is installed (the plain test job),
// except under `test-all.mjs --needs browser`, where a missing browser fails.
let browser;
let launchError = null;

before(async () => {
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    launchError = err;
  }
});

after(async () => {
  await browser?.close().catch(() => {});
});

test('waitForJobText waits for a job description that renders after 3 s', { timeout: 60_000 }, async (t) => {
  if (launchError) {
    if (toolRequired('browser')) throw launchError;
    t.skip('no Chromium');
    return;
  }
  const page = await browser.newPage();
  await page.setContent(PAGE);
  await waitForJobText(page);
  const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim());
  assert.ok(text.length >= 2500, `expected the rendered description, got ${text.length} chars: ${text.slice(0, 80)}`);
  assert.ok(text.includes('Senior Platform Engineer at Acme Corp.'));
});
