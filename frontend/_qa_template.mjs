// Build a template with a few components added, screenshot it.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const tokens = JSON.parse(readFileSync("../backend/_qa_tokens.json", "utf8"));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

await page.goto("http://localhost:5173/__init", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.evaluate(({ a, r }) => {
  localStorage.setItem("hrms-auth", JSON.stringify({ state: { accessToken: a, refreshToken: r }, version: 0 }));
}, { a: tokens.admin.access, r: tokens.admin.refresh });

await page.goto("http://localhost:5173/settings/salary-templates", { waitUntil: "networkidle" });
await page.click("text=New Template");
await page.waitForTimeout(400);

// Set CTC + name
await page.fill('input[placeholder="e.g. Engineer L3"]', "Engineer L3");
await page.fill('input[type="number"]', "1200000");
await page.waitForTimeout(200);

// Add components by clicking them in the picker
for (const name of ["Basic", "House Rent Allowance", "Conveyance Allowance", "Professional Tax"]) {
  await page.locator(`button:has-text("${name}")`).first().click();
  await page.waitForTimeout(180);
}

await page.screenshot({ path: ".qa/click_template_builder_filled.png", fullPage: false });
console.log(`builder filled errs=${errs.length}`);
for (const e of errs.slice(0, 4)) console.log("    " + e.slice(0, 220));
await browser.close();
