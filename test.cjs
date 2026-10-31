const { chromium } = require("playwright"), http = require("http"), fs = require("fs"), path = require("path"), assert = require("assert");
const file = process.argv[2] || path.join(__dirname, "index.html");
const server = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end(fs.readFileSync(file)); });
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 1000 }, colorScheme: "dark" })).newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_|fonts\./.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__eq);
  const res = await page.evaluate(async () => {
    const Q = window.__eq, out = {};
    const at = (f) => { const a = new Float32Array([f]); return Q.response(a)[0]; };
    for (const layout of ["studio", "bell"]) {
      Q.setLayout(layout); out[layout] = { flat: Math.max(...Array.from(Q.response(Q.FREQ)).map(Math.abs)), bands: [] };
      const P = Q.params(layout);
      for (let i = 0; i < 10; i++) {
        Q.setGain(i, 12); const f = P[i].f; out[layout].bands.push([f, at(f)]);
        if (P[i].type === "lowshelf") out[layout].lowPast = at(20); if (P[i].type === "highshelf") out[layout].highPast = at(20000);
        Q.setGain(i, -12); out[layout].bands[i].push(at(f)); Q.setGain(i, 0);
      }
    }
    // offline: pink noise, boost band 4 of studio (1 kHz) by +12, compare band power
    Q.setLayout("studio"); const buf = Q.pink(6); Q.setBuf(buf);
    const pow = (sig, lo, hi) => { const N = 4096, re = new Float64Array(N), im = new Float64Array(N); let a = 0;
      for (let s0 = 0; s0 + N <= sig.length; s0 += N / 2) { for (let i = 0; i < N; i++) { re[i] = sig[s0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; }
        for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
        for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(ang * k), wi = Math.sin(ang * k), x = i + k, y = i + k + len / 2, tr = re[y] * wr - im[y] * wi, ti = re[y] * wi + im[y] * wr; re[y] = re[x] - tr; im[y] = im[x] - ti; re[x] += tr; im[x] += ti; } }
        for (let k = 1; k < N / 2; k++) { const f = k * 44100 / N; if (f >= lo && f < hi) a += re[k] * re[k] + im[k] * im[k]; } } return a; };
    const flat = (await Q.renderOffline()).getChannelData(0); Q.setGain(4, 12);
    const boosted = (await Q.renderOffline()).getChannelData(0);
    Q.setBypass(true); const byp = (await Q.renderOffline()).getChannelData(0); Q.setBypass(false);
    let diff = 0; for (let i = 0; i < flat.length; i++) diff = Math.max(diff, Math.abs(flat[i] - buf.getChannelData(0)[i]));
    out.render = { dBat1k: 10 * Math.log10(pow(boosted, 900, 1100) / pow(flat, 900, 1100)), dBat100: 10 * Math.log10(pow(boosted, 80, 120) / pow(flat, 80, 120)), dBat8k: 10 * Math.log10(pow(boosted, 7000, 9000) / pow(flat, 7000, 9000)), flatDiff: diff, bypDiff: Math.max(...byp.slice(0, 5000).map((v, i) => Math.abs(v - buf.getChannelData(0)[i]))) };
    return out;
  });
  console.log(JSON.stringify(res, (k, v) => typeof v === "number" ? +v.toFixed(2) : v));
  for (const l of ["studio", "bell"]) {
    assert(res[l].flat < 0.01, l + " flat is flat");
    res[l].bands.forEach(([f, up, down], i) => { const sh = (l === 'studio' && (i === 0 || i === 9)) || (l === 'bell' && i === 0); if (sh) { assert(Math.abs(up - 6) < 1 && Math.abs(down + 6) < 1, `${l} shelf corner is half gain: ${up}`); return; } assert(up > 9.5 && up < 13.5, `${l} band ${i} ${f} Hz boost ${up}`); assert(down < -9.5 && down > -13.5, `${l} band ${i} cut ${down}`); });
  }
  assert(res.studio.lowPast > 10 && res.studio.highPast > 10, "shelves hold level past the corner");
  assert(Math.abs(res.render.dBat1k - 12) < 1.5, "render +12 at 1k: " + res.render.dBat1k);
  assert(Math.abs(res.render.dBat100) < 1.5 && Math.abs(res.render.dBat8k) < 2, "render leaves far bands alone");
  assert(res.render.flatDiff < 1e-4, "flat EQ is transparent: " + res.render.flatDiff); assert(res.render.bypDiff < 1e-4);
  // UI: drag on the canvas sets a gain; preset; layout switch; play
  await page.evaluate(() => window.__eq.setLayout("studio")); await page.click("#pFlat"); await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.$eval("#cv", (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const bx = box.x + box.w * (Math.log(1000 / 20) / Math.log(1000));
  await page.mouse.move(bx, box.y + box.h / 2); await page.mouse.down(); await page.mouse.move(bx, box.y + box.h * 0.25, { steps: 5 }); await page.mouse.up();
  const g4 = await page.evaluate(() => window.__eq.S.gain.studio[4]); assert(g4 > 5, "dragging up boosts the 1 kHz band: " + g4);
  await page.click("#pTel"); assert.equal(await page.evaluate(() => window.__eq.S.gain.studio[0]), -15);
  await page.click("#lBell"); assert.equal(await page.evaluate(() => window.__eq.S.layout), "bell");
  await page.click("#play"); await page.waitForTimeout(700);
  assert.equal(await page.getAttribute("#play", "aria-pressed"), "true");
  await page.screenshot({ path: path.join(__dirname, "shot-dark.png"), fullPage: true });
  await page.click("#stop");
  const ph = await (await browser.newContext({ viewport: { width: 400, height: 900 }, colorScheme: "light" })).newPage();
  await ph.goto(`http://127.0.0.1:${server.address().port}/`); await ph.waitForFunction(() => window.__eq); await ph.screenshot({ path: path.join(__dirname, "shot-phone.png"), fullPage: true });
  assert((await ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, "no horizontal overflow");
  assert.equal(errs.length, 0, errs.join("\n"));
  console.log("eq tests ok; save button:", !!(await page.$("#dl")));
  await browser.close(); server.close();
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
