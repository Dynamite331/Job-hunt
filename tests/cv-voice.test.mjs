import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { voiceIssues, voiceTellMessage } from '../cv-voice.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const SOURCE = `# Jane Doe

jane@example.com

## Experience

### Program Manager, Northwind Payments
2021 - 2024

- Ran the weekly release train for the payments app
- Cut deploy time from 2 weeks to 4 hours by writing a checklist the engineers follow
- Worked with support to rewrite the refund help page
`;

const WITH_OWN_VERB = `${SOURCE}- Spearheaded the on-call rota the team already had\n`;

test('a line the candidate wrote is kept, stock verb included', () => {
  const copied = 'Spearheaded the on-call rota the team already had';
  assert.deepEqual(voiceIssues(copied, WITH_OWN_VERB).filter((issue) => issue.kind !== 'invented-number'), []);
  const reused = voiceIssues('Spearheaded the refund help page with support', WITH_OWN_VERB);
  assert.equal(reused.some((issue) => issue.value === 'spearheaded'), false);
});

test('a generated line that adds spearheaded, leveraged, or an em dash fails', () => {
  const generated = [
    'Results-driven program manager who spearheaded cross-functional launches \u2014 leveraging SQL \u2014 to drive significant impact.',
    'Ran the weekly release train for the payments app',
  ].join('\n');
  const issues = voiceIssues(generated, SOURCE);
  const values = issues.map((issue) => issue.value);
  assert.ok(values.includes('spearheaded'));
  assert.ok(values.includes('leveraging'));
  assert.ok(values.includes('results-driven'));
  assert.ok(values.includes('significant impact'));
  assert.ok(values.includes('em dash'));
  assert.match(voiceTellMessage(issues, 'cv.html'), /Voice check failed for cv\.html/);
  assert.match(voiceTellMessage(issues, 'cv.html'), /Keep the candidate's own words/);
});

test('an en dash in a new line fails and a copied en dash does not', () => {
  const source = 'Northwind Payments \u2013 2021 to 2024';
  assert.deepEqual(voiceIssues(source, source).filter((issue) => issue.kind === 'em-dash'), []);
  const fresh = voiceIssues('Owned the payments calendar \u2013 the one the team prints', source);
  assert.deepEqual(fresh.filter((issue) => issue.kind === 'em-dash').map((issue) => issue.value), ['en dash']);
});

test('a number that is not in the source fails, and one that is does not', () => {
  const invented = voiceIssues('Cut deploy time by 40% with the same checklist', SOURCE);
  assert.ok(invented.some((issue) => issue.kind === 'invented-number' && issue.value === '40%'));
  assert.equal(voiceTellMessage(invented), null);
  const kept = voiceIssues('Cut deploy time from 2 weeks to 4 hours by writing a checklist the engineers follow', SOURCE);
  assert.deepEqual(kept, []);
});

test('leverage does not match inside a longer word the candidate used', () => {
  const source = 'Wrote the unleveraged cash report';
  assert.deepEqual(voiceIssues('Wrote the unleveraged cash report', source), []);
});

test('generate-latex blocks a stock verb and still blocks an invented metric', () => {
  const root = mkdtempSync(join(tmpdir(), 'cv-voice-latex-'));
  try {
    mkdirSync(join(root, 'output'));
    writeFileSync(join(root, 'cv.md'), SOURCE);
    const tex = (bullet) => `\\documentclass{article}\n\\begin{document}\n\\resumeItem{${bullet}}\n\\end{document}\n`;
    writeFileSync(join(root, 'output', 'stock.tex'), tex('Spearheaded the weekly release train for the payments app'));
    const stock = spawnSync(process.execPath, [join(ROOT, 'generate-latex.mjs'), 'output/stock.tex', '--compile-only'], {
      cwd: root,
      encoding: 'utf-8',
      timeout: 30_000,
      env: { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '' },
    });
    const stockReport = JSON.parse(stock.stdout);
    assert.equal(stockReport.factCheck.verdict, 'block');
    assert.match(stockReport.factCheck.reason, /spearheaded/);
    assert.equal(stockReport.compiled, false);

    writeFileSync(join(root, 'output', 'number.tex'), tex('Cut deploy time by 40\\% with the same checklist'));
    const number = spawnSync(process.execPath, [join(ROOT, 'generate-latex.mjs'), 'output/number.tex', '--compile-only'], {
      cwd: root,
      encoding: 'utf-8',
      timeout: 30_000,
      env: { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '' },
    });
    const numberReport = JSON.parse(number.stdout);
    assert.equal(numberReport.factCheck.verdict, 'block');
    assert.match(numberReport.factCheck.reason, /40%/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
