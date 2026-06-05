// Click-through screenshot harness:
//   node _qa_clickshot.mjs <route> <click-text>... -> save .qa/<slug>.png
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const tokens = JSON.parse(readFileSync("../backend/_qa_tokens.json", "utf8"));
const [route, ...clicks] = process.argv.slice(2);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

await page.goto("http://localhost:5173/__init", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.evaluate(({ a, r }) => {
  localStorage.setItem("hrms-auth", JSON.stringify({ state: { accessToken: a, refreshToken: r }, version: 0 }));
}, { a: tokens.admin.access, r: tokens.admin.refresh });
await page.goto("http://localhost:5173" + route, { waitUntil: "networkidle" });

for (const txt of clicks) {
  // Allow `aria:Foo` to target a button by aria-label.
  if (txt.startsWith("aria:")) {
    await page.locator(`button[aria-label="${txt.slice(5)}"]`).first().click();
  } else {
    await page.locator(`text=${txt}`).first().click();
  }
  await page.waitForTimeout(700);
}

const slug = (route + "_" + clicks.join("_")).replace(/[^a-z0-9]+/gi, "_");
const file = `.qa/click_${slug}.png`;
await page.screenshot({ path: file, fullPage: false });
console.log(`-> ${file}  errs=${errs.length}`);
for (const e of errs.slice(0, 4)) console.log("    " + e.slice(0, 220));

await browser.close();
