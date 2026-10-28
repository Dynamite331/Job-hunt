// Client-safe (no node). Deterministic "is this CV good enough to score?" signal —
// ZERO tokens. Advisory only: it drives a green-check vs amber hint, NEVER blocks
// saving (the minimal-CV principle: even a rough parse is enough for a first score).

/** @typedef {{ scoreable: boolean; words: number; hasExperience: boolean; hasSkills: boolean; hint?: string }} CvReadiness */

const ROLE_HEADING = /^(#{1,3})\s*(?:work\s+experience|professional\s+experience|experience|work|employment|empleo|experiencia)\s*:?\s*#*\s*$/i;
const YEAR_RANGE = /\b(20\d\d)\s*[-–—]\s*(20\d\d|present|now|actualidad)/i;

/** @param {string} text */
function experienceHeading(text) {
  return text.split("\n").some((line) => ROLE_HEADING.test(line));
}

// A year range, a line under the heading, or a deeper heading such as
// "### Floor lead" counts. "Work Authorization" is not that heading, and a
// sibling section such as "## Skills" is not a role under it.
/** @param {string} text */
function experienceHasRole(text) {
  if (YEAR_RANGE.test(text)) return true;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(ROLE_HEADING);
    if (!heading) continue;
    const level = heading[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j].trim();
      if (!line) continue;
      const sub = /^(#+)\s+\S/.exec(line);
      if (sub) {
        if (sub[1].length <= level) break;
        return true;
      }
      return true;
    }
  }
  return false;
}

// An HTML comment never renders, so a template note under the heading is not a
// role. Repeat until nothing changes, so "<!-<!-- x -->- y -->" leaves no comment.
/** @param {string} md */
function withoutHtmlComments(md) {
  let text = md;
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(/<!--[\s\S]*?-->/g, "");
  }
  return text;
}

/**
 * @param {string} md
 * @returns {CvReadiness}
 */
export function cvReadiness(md) {
  const text = withoutHtmlComments(md || "").trim();
  const words = text ? text.split(/\s+/).length : 0;
  const hasExperience = experienceHeading(text) || YEAR_RANGE.test(text);
  const hasSkills = /(^|\n)#{1,3}\s*(skills|technologies|competenc|habilidad)/i.test(text);
  const hasRole = experienceHasRole(text);
  const scoreable = hasRole || (words >= 80 && (hasSkills || words >= 200));
  /** @type {string | undefined} */
  let hint;
  if (!scoreable) hint = words < 40 ? "That's very short — add your experience for real matches (you can save anyway)." : "Looks thin — add a role or two for better matches (you can save anyway).";
  return { scoreable, words, hasExperience, hasSkills, hint };
}
