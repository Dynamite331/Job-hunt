// One US Letter page in the preview iframe, at 96px per inch.
export const PREVIEW_PAGE_PX = 1056;

/**
 * Height of the CV content.
 *
 * The iframe's own height is the previous measurement. Reading
 * documentElement.scrollHeight then repeats that viewport, so a shorter CV
 * stays on the old page count. The content box does not stretch with the iframe.
 *
 * @param {Document | null | undefined} doc
 * @returns {number}
 */
export function contentHeightPx(doc) {
  const body = doc?.body;
  if (!body) return 0;
  const page = typeof body.querySelector === "function" ? body.querySelector(".page") : null;
  const box = page || body;
  const height = box.scrollHeight || box.offsetHeight || 0;
  return height > 0 ? height : 0;
}

/** @param {number} contentPx */
export function previewPageCount(contentPx) {
  if (!contentPx || contentPx <= 0) return 1;
  return Math.max(1, Math.ceil(contentPx / PREVIEW_PAGE_PX));
}
