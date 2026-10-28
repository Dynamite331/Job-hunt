import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { linkedInOffers, planLinkedInImport } from './linkedin-import.mjs';
import { resolveTrackerPath } from '../path-resolver.mjs';
import { withPipelineLock } from '../pipeline-lock.mjs';

const MAIL_EXT = new Set(['.eml', '.txt', '.mbox']);

/**
 * @param {string} dir
 * @returns {string[]}
 */
export function mailDropFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MAIL_EXT.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort()
    .map((name) => join(dir, name));
}

// Only a missing file reads as empty. An unreadable tracker would hide the
// jobs already in it, and the import would add them a second time.
function readIf(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return '';
    throw err;
  }
}

function park(file) {
  const dir = join(dirname(file), 'imported');
  mkdirSync(dir, { recursive: true });
  const base = file.slice(dirname(file).length + 1);
  let dest = join(dir, base);
  let n = 1;
  while (existsSync(dest)) {
    dest = join(dir, `${base}.${n}`);
    n += 1;
  }
  renameSync(file, dest);
}

/**
 * The pipeline and tracker resolve the way scan.mjs resolves them, so
 * CAREER_OPS_PIPELINE and CAREER_OPS_TRACKER point here too.
 *
 * The scheduled poll and linkedin-watch.mjs can run at once, so a real import
 * holds a lock on the folder from listing to parking. Without it both read the
 * same pipeline, add the same job, and the second park fails.
 *
 * @param {{ root: string, dir: string, dryRun?: boolean }} input
 * @returns {Promise<{ added: number, already: number, found: number, skipped: string[], unreadable: string[], message: string }>}
 */
export function importMailDrop(input) {
  if (input.dryRun) return importUnlocked(input);
  return withPipelineLock(join(input.dir, '.import'), () => importUnlocked(input));
}

async function importUnlocked({ root, dir, dryRun = false }) {
  const files = mailDropFiles(dir);
  const pipelinePath = process.env.CAREER_OPS_PIPELINE || join(root, 'data', 'pipeline.md');
  const applicationsPath = resolveTrackerPath(root);
  let seen = `${readIf(pipelinePath)}\n${readIf(applicationsPath)}`;
  const added = [];
  const already = [];
  let found = 0;
  const parked = [];
  const skipped = [];
  const unreadable = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      unreadable.push(basename(file));
      continue;
    }
    const plan = planLinkedInImport(text, seen);
    found += plan.found;
    if (plan.error) {
      skipped.push(basename(file));
      continue;
    }
    for (const job of plan.added) {
      added.push(job);
      seen += `\n${job.url}`;
    }
    already.push(...plan.already);
    parked.push(file);
  }
  if (!dryRun && added.length > 0) {
    const { appendToPipeline, appendToScanHistory } = await import('../scan.mjs');
    const { localToday } = await import('./local-today.mjs');
    const offers = linkedInOffers(added);
    mkdirSync(dirname(pipelinePath), { recursive: true });
    await appendToPipeline(offers, { pipelinePath });
    await appendToScanHistory(offers, localToday(), 'added');
  }
  if (!dryRun) {
    for (const file of parked) park(file);
  }
  const jobs = `${added.length} LinkedIn job${added.length === 1 ? '' : 's'}`;
  let message = added.length === 0
    ? (found === 0 ? 'No LinkedIn jobs found in the alert folder.' : `${already.length} LinkedIn job${already.length === 1 ? ' was' : 's were'} already in your list.`)
    : dryRun ? `${jobs} found. Nothing was saved.` : `${jobs} added.`;
  if (skipped.length > 0) {
    message += ` Skipped ${skipped.length === 1 ? 'a file' : `${skipped.length} files`} too large to read: ${skipped.join(', ')}. Split it into smaller files or export single emails.`;
  }
  if (unreadable.length > 0) {
    message += ` Could not read ${unreadable.join(', ')}. Check the file permissions; it stays in the folder for the next run.`;
  }
  return { added: added.length, already: already.length, found, skipped, unreadable, message };
}
