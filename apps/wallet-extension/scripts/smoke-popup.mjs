/**
 * Serves dist/ and verifies the popup renders onboarding UI without React errors.
 * Run after: npm run build
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = 5210 + Math.floor(Math.random() * 100);

const preview = spawn(
  "npx",
  ["vite", "preview", "--port", String(port), "--strictPort"],
  { cwd: root, stdio: "pipe" }
);

function waitForServer(ms = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(`http://localhost:${port}/`);
        if (res.ok) return resolve();
      } catch {
        /* retry */
      }
      if (Date.now() - start > ms) reject(new Error("Preview server did not start"));
      else setTimeout(tick, 400);
    };
    tick();
  });
}

const errors = [];
let browser;

try {
  await waitForServer();
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("404")) {
      errors.push(`[console] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));

  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle0", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2000));

  const text = await page.evaluate(() => document.body.innerText);
  console.log("Body:", text.slice(0, 400).replace(/\n/g, " | "));

  if (errors.some((e) => e.includes("Maximum update depth") || e.includes("getSnapshot"))) {
    console.error("FAIL: React infinite loop");
    errors.forEach((e) => console.error(e));
    process.exitCode = 1;
  } else if (text.includes("Something went wrong")) {
    console.error("FAIL: Error boundary shown");
    errors.forEach((e) => console.error(e));
    process.exitCode = 1;
  } else if (
    text.includes("Veilum") &&
    (text.includes("Create new wallet") || text.includes("Welcome back") || text.includes("Unlock"))
  ) {
    console.log("PASS: onboarding welcome rendered");
    const buttons = await page.$$("button");
    let clicked = false;
    for (const btn of buttons) {
      const label = await page.evaluate((el) => el.textContent ?? "", btn);
      if (label.includes("Create new wallet")) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked && text.includes("Welcome back")) {
      console.log("PASS: welcome back screen (existing vault in profile)");
      process.exitCode = 0;
    } else if (!clicked) {
      console.error("FAIL: could not find Create new wallet button");
      process.exitCode = 1;
    } else {
      await new Promise((r) => setTimeout(r, 800));
      const createText = await page.evaluate(() => document.body.innerText);
      if (!createText.includes("Create wallet") || !/password/i.test(createText)) {
        console.error("FAIL: create wallet screen missing:", createText.slice(0, 200));
        process.exitCode = 1;
      } else {
        console.log("PASS: create wallet screen rendered");
        await page.type('input[type="password"]', "testpassword123");
        const pwInputs = await page.$$('input[type="password"]');
        if (pwInputs.length >= 2) {
          await pwInputs[1].type("testpassword123");
        }
        const continueBtn = await page.evaluate(() => {
          const btn = [...document.querySelectorAll("button")].find((b) =>
            b.textContent?.trim().includes("Continue")
          );
          btn?.click();
        });
        await new Promise((r) => setTimeout(r, 2000));
        const mnemonicText = await page.evaluate(() => document.body.innerText);
        if (mnemonicText.includes("process is not defined") || mnemonicText.includes("Something went wrong")) {
          console.error("FAIL: mnemonic step error:", mnemonicText.slice(0, 300));
          process.exitCode = 1;
        } else if (mnemonicText.includes("Save recovery phrase") || mnemonicText.includes("recovery phrase")) {
          console.log("PASS: mnemonic screen rendered");
        } else {
          console.error("FAIL: mnemonic screen missing:", mnemonicText.slice(0, 300));
          process.exitCode = 1;
        }
      }
    }
  } else {
    console.error("FAIL: unexpected content");
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  preview.kill("SIGTERM");
}
