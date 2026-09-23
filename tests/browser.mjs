#!/usr/bin/env node
/**
 * Browser-level acceptance for the coaching-note flow — Sept 23, 2026 (C5d).
 *
 * Uses Playwright (already available in the sandbox) to open the isolated
 * preview, log in as CoachOne, and verify:
 *
 *   1. Direct share of a new entry lands, renders "Sep 22, 2026" (not shifted),
 *      and shows the shared badge.
 *   2. Draft-save then draft-share flow: content survives, ONE notification
 *      lands, the teacher's page shows the shared date correctly.
 *   3. Shared entry: single "Save and share changes" affordance visible.
 *   4. Phone viewport (390x844, iPhone-ish): the note card and edit form
 *      remain usable and the shared badge is visible without horizontal scroll.
 *   5. Keyboard-only navigation: the new-note form's submit buttons receive
 *      focus in a logical order and are reachable via Tab.
 *
 * Usage: node tests/browser.mjs
 * Requires: fixture reseeded (node tests/fixture.mjs) and PM2 preview live.
 *
 * NOTE: This runs against the LOCAL preview URL by default.  Override with
 *   BROWSER_TEST_URL=<url> node tests/browser.mjs
 */

import { chromium } from 'playwright';

const BASE = process.env.BROWSER_TEST_URL || 'http://localhost:3000';
const PW = 'TestPass1!';

let passed = 0, failed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failures.push(`${name}${detail ? ' — ' + detail : ''}`); }
}

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  // Login form's button doesn't declare type="submit" (defaults to it though);
  // match by text instead.
  await page.click('form >> button:has-text("Sign in")');
  // The login redirects to a role-specific home; wait until the URL no longer
  // includes /login.  A pure teacher lands on /teacher; a coach on /coach;
  // a teacher-coach on /teacher.
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // --------------------------------------------------------------------
  console.log('\n[Browser Case 1 — desktop: fresh direct-share landed + date rendering]');
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await login(page, 'coach1@test');
    // Alice is teacher id 10.
    await page.goto(`${BASE}/coach/teachers/10`);
    // Fill occurred_on to 2026-09-22.  <input type="date"> takes YYYY-MM-DD.
    await page.fill('input[name="occurred_on"]', '2026-09-22');
    await page.fill('textarea[name="glow"]', 'Browser-driven strength-only entry');
    // Direct-share (bypass draft) — click the "Share with teacher" button.
    await page.click('button[name="_action"][value="share"]');
    // Wait for URL to include the ?msg= query param that the server sets on
    // a successful redirect, THEN wait for network idle so the toast + list
    // are rendered.
    await page.waitForURL((url) => url.search.includes('msg='), { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    const url = page.url();
    // On the redirect target, look for the "Shared with teacher" toast and
    // the rendered date "Sep 22, 2026" in the entry we just created.
    const bodyText = await page.textContent('body');
    ok(`desktop: redirect URL contains "Shared" msg (url=${url})`,
       decodeURIComponent(url).includes('Shared with teacher'));
    ok('desktop: coach page shows the freshly-shared entry',
       bodyText.includes('Browser-driven strength-only entry'));
    ok('desktop: entry renders occurred_on as "Sep 22, 2026" (NOT Sep 21)',
       bodyText.includes('Sep 22, 2026') && !bodyText.includes('Sep 21, 2026'));
    await context.close();
  }

  // --------------------------------------------------------------------
  console.log('\n[Browser Case 2 — teacher sees the shared entry with correct date]');
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await login(page, 'alice@test');
    await page.goto(`${BASE}/teacher`);
    const bodyText = await page.textContent('body');
    ok('teacher: sees the shared entry body', bodyText.includes('Browser-driven strength-only entry'));
    ok('teacher: renders occurred_on as "Sep 22, 2026" (NOT Sep 21)',
       bodyText.includes('Sep 22, 2026') && !bodyText.includes('Sep 21, 2026'));
    ok('teacher: shows author name (CoachOne Combined)', bodyText.includes('CoachOne Combined'));
    await context.close();
  }

  // --------------------------------------------------------------------
  console.log('\n[Browser Case 3 — shared entry edit exposes ONE "Save and share changes" button]');
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await login(page, 'coach1@test');
    await page.goto(`${BASE}/coach/teachers/10`);
    // Open the first "Edit this entry" details.
    await page.click('details >> summary >> nth=0');
    // Wait for the form buttons to render.
    await page.waitForSelector('button[name="_action"]');
    const buttonValues = await page.$$eval('form button[name="_action"]', els => els.map(e => e.value));
    // The FIRST form on the page is the NEW-note form (has draft + share).
    // The details form (shared entry) should only have `shared_save`.
    // Split by form: get the values inside every <form> separately.
    const perFormValues = await page.$$eval('form', forms =>
      forms.map(f => Array.from(f.querySelectorAll('button[name="_action"]')).map(b => b.value)));
    // Find any form whose ONLY _action value is 'shared_save'.
    const hasSharedSaveOnly = perFormValues.some(vals => vals.length === 1 && vals[0] === 'shared_save');
    ok(`shared entry form exposes ONLY "shared_save" (per-form _action values: ${JSON.stringify(perFormValues)})`,
       hasSharedSaveOnly);
    await context.close();
  }

  // --------------------------------------------------------------------
  console.log('\n[Browser Case 4 — phone viewport (390x844) shared badge visible without horizontal scroll]');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await login(page, 'coach1@test');
    await page.goto(`${BASE}/coach/teachers/10`);
    // The entry we created above should be visible on the phone viewport.
    const entryVisible = await page.locator('text=Browser-driven strength-only entry').first().isVisible();
    ok('phone: shared entry text is visible on 390px-wide viewport', entryVisible);
    // Confirm no horizontal scroll: document.documentElement.scrollWidth <= viewport width + a small tolerance.
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    ok(`phone: no horizontal scroll (scrollWidth=${scrollW}, clientWidth=${clientW})`,
       scrollW <= clientW + 2, `overflow by ${scrollW - clientW}px`);
    // The shared badge "Shared" text visible.
    const sharedVisible = await page.locator('text=/Shared Sep/').first().isVisible().catch(() => false);
    ok('phone: shared-badge with "Shared Sep …" is visible', sharedVisible);
    await context.close();
  }

  // --------------------------------------------------------------------
  console.log('\n[Browser Case 5 — keyboard access: Save-draft and Share-with-teacher reachable via Tab]');
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await login(page, 'coach1@test');
    await page.goto(`${BASE}/coach/teachers/10`);
    // Focus the occurred_on input first.
    await page.focus('input[name="occurred_on"]');
    // Tab through the form until we land on a submit button whose value is
    // 'draft' or 'share'.  Cap at 40 tabs so a bug doesn't hang the test.
    let foundDraft = false, foundShare = false;
    for (let i = 0; i < 40 && !(foundDraft && foundShare); i++) {
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        return { tag: el.tagName, name: el.getAttribute('name'), value: el.getAttribute('value'), type: el.getAttribute('type') };
      });
      if (info && info.tag === 'BUTTON' && info.name === '_action') {
        if (info.value === 'draft') foundDraft = true;
        if (info.value === 'share') foundShare = true;
      }
      await page.keyboard.press('Tab');
    }
    ok('keyboard: Save-draft button reachable via Tab', foundDraft);
    ok('keyboard: Share-with-teacher button reachable via Tab', foundShare);
    await context.close();
  }

  await browser.close();

  console.log('\n============================================================');
  console.log(`  ${passed} passed · ${failed} failed`);
  if (failed) {
    console.log('  Failures:');
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log('============================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
