// The live preview's page count. A two-page CV switched to One page still
// said "2 pages" because the measurement read the iframe viewport, which
// keeps the previous height. These numbers are that session: the content
// box was 626px and the viewport was still 1515px.

import { test } from "node:test";
import assert from "node:assert/strict";
import { contentHeightPx, previewPageCount, PREVIEW_PAGE_PX } from "../../src/lib/cv-studio/page-estimate.mjs";

function doc({ content, viewport }) {
  return {
    body: {
      scrollHeight: content,
      querySelector(sel) {
        assert.equal(sel, ".page");
        return { scrollHeight: content };
      },
    },
    documentElement: { scrollHeight: viewport },
  };
}

test("a shorter CV estimates from the content box, not the iframe viewport", () => {
  assert.equal(contentHeightPx(doc({ content: 626, viewport: 1515 })), 626);
  assert.equal(previewPageCount(626), 1);
});

test("content taller than one page estimates two", () => {
  assert.equal(previewPageCount(1515), 2);
  assert.equal(previewPageCount(PREVIEW_PAGE_PX), 1);
  assert.equal(previewPageCount(PREVIEW_PAGE_PX + 1), 2);
});

test("an unmeasured preview estimates one page", () => {
  assert.equal(contentHeightPx(null), 0);
  assert.equal(previewPageCount(0), 1);
});
