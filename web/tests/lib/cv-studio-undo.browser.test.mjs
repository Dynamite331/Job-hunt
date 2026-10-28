import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { liveServerSkip } from "../helpers/live-server.mjs";

const url = process.env.CV_STUDIO_UNDO_TEST_URL;
const root = process.env.CV_STUDIO_UNDO_TEST_ROOT;
const section0Item0Bullet0 = "s0i0b0";

test("undo puts a hidden bullet back and the saved edits do not keep the hide", {
  skip: liveServerSkip("CV_STUDIO_UNDO_TEST_URL", "CV_STUDIO_UNDO_TEST_ROOT"),
  timeout: 120_000,
}, async (t) => {
  const origin = new URL(url);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
  const relative = path.relative(os.tmpdir(), fs.realpathSync(root));
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.match(fs.readFileSync(path.join(root, "cv.md"), "utf8"), /Not a real candidate/);

  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${origin.origin}/pipeline/11/cv-studio`);
  await page.getByRole("heading", { name: "Fixture Alpha", exact: true }).waitFor();
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.waitFor();
  assert.equal(await undo.isDisabled(), true);

  await page.getByRole("button", { name: "Hide bullet", exact: true }).click();
  await page.getByRole("button", { name: "Show bullet", exact: true }).waitFor();
  await undo.click();
  await page.getByRole("button", { name: "Hide bullet", exact: true }).waitFor();

  const editsPath = path.join(root, ".career-ops-web", "cv-studio", "011.json");
  const deadline = Date.now() + 8_000;
  let hidden = [section0Item0Bullet0];
  while (Date.now() < deadline) {
    if (fs.existsSync(editsPath)) {
      hidden = JSON.parse(fs.readFileSync(editsPath, "utf8")).hidden ?? [];
      if (!hidden.includes(section0Item0Bullet0)) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.deepEqual(hidden, []);
  assert.deepEqual(errors, []);
});
