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
  // A user template can lay its CV out as several sibling .page boxes.
  // Measure from the top of the first to the bottom of the last.
  const pages = typeof body.querySelectorAll === "function" ? [...body.querySelectorAll(".page")] : [];
  if (pages.length > 1) {
    const boxes = pages.map((p) => {
      const rect = p.getBoundingClientRect();
      return { top: rect.top, bottom: rect.top + Math.max(rect.height, p.scrollHeight || 0) };
    });
    const extent = Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top));
    return extent > 0 ? extent : 0;
  }
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
