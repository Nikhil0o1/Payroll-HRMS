// Quick screenshot harness. Usage:
//   node _qa_shot.mjs admin:/settings/organisation employee:/holidays guest:/login
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const tokens = JSON.parse(readFileSync("../backend/_qa_tokens.json", "utf8"));

const targets = process.argv.slice(2).map((s) => {
  const [role, ...rest] = s.split(":");
  const path = rest.join(":");
  return { role, path };
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const t of targets) {
  const errs = [];
  page.removeAllListeners("console");
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(m.text());
  });

  // Seed auth in localStorage before navigation (only for non-guest).
  const BASE = process.env.QA_BASE || "http://localhost:5174";
  await page.goto(BASE + "/__init", { waitUntil: "domcontentloaded" }).catch(() => {});
  if (t.role !== "guest") {
    const tok = tokens[t.role];
    await page.evaluate(({ a, r }) => {
      localStorage.setItem(
        "hrms-auth",
        JSON.stringify({
          state: { accessToken: a, refreshToken: r },
          version: 0,
        }),
      );
    }, { a: tok.access, r: tok.refresh });
  }

  await page.goto(BASE + t.path, { waitUntil: "networkidle", timeout: 25000 });
  await page.waitForTimeout(700);
  const slug = (t.role + "_" + t.path).replace(/[^a-z0-9]+/gi, "_") || "_";
  const file = `.qa/shot_${slug}.png`;
  const vh = page.viewportSize().height;
  const sh = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`${t.role} ${t.path} -> ${file}  errs=${errs.length}  scrollH=${sh}/${vh}${sh > vh + 2 ? "  <<<SCROLLS" : "  [fits]"}`);
  for (const e of errs.slice(0, 4)) console.log("    " + e.slice(0, 220));
}

await browser.close();
