import { metricClaims, stripMarkup } from './verify-cv-facts.mjs';

export const BANNED_PHRASES = [
  'passionate about',
  'results-oriented',
  'results-driven',
  'proven track record',
  'leveraged',
  'leveraging',
  'leverage',
  'spearheaded',
  'spearheading',
  'spearhead',
  'facilitated',
  'facilitating',
  'synergies',
  'synergy',
  'cutting-edge',
  'cutting edge',
  "in today's fast-paced world",
  'demonstrated ability to',
  'best practices',
  'significant impact',
  'measurable impact',
  'orchestrated',
  'championed',
  'utilized',
  'delve',
  'tapestry',
  'pivotal',
];

const EM_DASH = '\u2014';
const EN_DASH = '\u2013';

function norm(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function linesOf(text) {
  const broken = String(text)
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|li|h\d|div|tr|section|article)>/gi, '\n');
  return stripMarkup(broken, { keepLineBreaks: true })
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function hasPhrase(text, phrase) {
  const body = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

/**
 * @param {string} generated
 * @param {string} source
 * @returns {{kind: 'banned-phrase'|'em-dash'|'invented-number', value: string}[]}
 */
export function voiceIssues(generated, source) {
  const sourceText = String(source ?? '');
  const sourceNorm = norm(stripMarkup(sourceText));
  const issues = [];
  const seen = new Set();
  const push = (kind, value) => {
    const key = `${kind}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ kind, value });
  };

  for (const line of linesOf(generated)) {
    const alreadyInSource = norm(line).length >= 12 && sourceNorm.includes(norm(line));
    if (alreadyInSource) continue;
    if (line.includes(EM_DASH)) push('em-dash', 'em dash');
    if (line.includes(EN_DASH)) push('em-dash', 'en dash');
    for (const phrase of BANNED_PHRASES) {
      if (!hasPhrase(line, phrase)) continue;
      if (hasPhrase(sourceText, phrase)) continue;
      push('banned-phrase', phrase);
    }
  }

  const allowed = metricClaims(sourceText);
  for (const claim of metricClaims(String(generated ?? ''))) {
    if (!allowed.has(claim)) push('invented-number', claim);
  }
  return issues;
}

/**
 * The wording failure a renderer shows. Null when the only issues are
 * numbers, which the fact gate already reports.
 *
 * @param {{kind: string, value: string}[]} issues
 * @param {string} [label]
 * @returns {string|null}
 */
export function voiceTellMessage(issues, label) {
  const tells = issues.filter((issue) => issue.kind !== 'invented-number');
  if (!tells.length) return null;
  const where = label ? ` for ${label}` : '';
  const bits = tells.map((issue) => (issue.kind === 'em-dash' ? `an ${issue.value}` : `"${issue.value}"`));
  return `Voice check failed${where}: ${bits.join(', ')}. That wording is not in the source CV. Keep the candidate's own words.`;
}
