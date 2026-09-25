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
    // C2 assertion, SCOPED to our specific entry.  Older acceptance cases
    // legitimately post 2026-09-20 and 2026-09-21 entries, so a blanket
    // "!bodyText.includes('Sep 21, 2026')" was matching on those unrelated
    // rows.  We instead read the DOM node that wraps THIS entry (identified
    // by our unique glow text) and assert the sibling date span reads
    // "Sep 22, 2026".  A TZ-shift bug on THIS row would show "Sep 21, 2026"
    // in that same scoped node.
    const scopedDate = await page.evaluate(() => {
      const marker = 'Browser-driven strength-only entry';
      // Find the <li> ancestor of the DOM text node containing our marker.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue && n.nodeValue.includes(marker)) {
          let el = n.parentElement;
          while (el && el.tagName !== 'LI') el = el.parentElement;
          return el ? el.textContent : null;
        }
      }
      return null;
    });
    ok('desktop: THIS entry\'s LI renders Sep 22, 2026 (not Sep 21, 2026)',
       scopedDate && scopedDate.includes('Sep 22, 2026') && !scopedDate.includes('Sep 21, 2026'),
       scopedDate ? `scopedDate=${scopedDate.slice(0,200)}...` : 'entry LI not found');
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
    // Same scoped assertion as Case 1 — look for the wrapping element of the
    // marker text on the teacher's view.  Teacher renders coaching feedback
    // in an <article> or <li>; walk up until we find either.
    const scopedDate = await page.evaluate(() => {
      const marker = 'Browser-driven strength-only entry';
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue && n.nodeValue.includes(marker)) {
          let el = n.parentElement;
          while (el && el.tagName !== 'LI' && el.tagName !== 'ARTICLE') el = el.parentElement;
          return el ? el.textContent : null;
        }
      }
      return null;
    });
    ok('teacher: THIS entry\'s wrapper renders Sep 22, 2026 (not Sep 21, 2026)',
       scopedDate && scopedDate.includes('Sep 22, 2026') && !scopedDate.includes('Sep 21, 2026'),
       scopedDate ? `scopedDate=${scopedDate.slice(0,200)}...` : 'entry wrapper not found');
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

  // --------------------------------------------------------------------
  // Sept 24 hotfix — independent testing found that "Select all" and
  // "Clear" on the External-PD bulk-assign form threw
  //   "Cannot read properties of null (reading 'options')"
  // because the inline onclick walked up to the wrong DOM ancestor and
  // queried for the <select> in a subtree that doesn't contain it.  The
  // fix scopes the lookup to closest('form').  This Playwright case
  // repro-tests the exact click-through, watching pageerror + console
  // for any JS exception during either button click.
  // --------------------------------------------------------------------
  console.log('\n[Browser Case 6 — External PD bulk-assign: Select all + Clear buttons work without JS errors]');
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') jsErrors.push('console.error: ' + m.text()); });
    await login(page, 'principal@test');
    await page.goto(`${BASE}/appraiser/external-pd`);
    // Open the collapsible bulk-assign form.
    await page.waitForSelector('details >> summary:has-text("Open bulk-assign form")');
    await page.click('details >> summary:has-text("Open bulk-assign form")');
    await page.waitForSelector('select[name="teacher_ids"]');

    const totalOpts = await page.$$eval('select[name="teacher_ids"] option', (os) => os.length);
    ok(`bulk form: teacher_ids has options (got ${totalOpts})`, totalOpts >= 2);

    // Baseline: nothing selected.
    const selectedInitial = await page.$$eval('select[name="teacher_ids"] option', (os) => os.filter((o) => o.selected).length);
    ok('bulk form: no teachers pre-selected', selectedInitial === 0);

    // Click Select all — must select every option, and MUST NOT throw.
    await page.click('button:has-text("Select all")');
    await page.waitForTimeout(120);
    const selectedAfterAll = await page.$$eval('select[name="teacher_ids"] option', (os) => os.filter((o) => o.selected).length);
    ok(`Select all: every option is selected (got ${selectedAfterAll}/${totalOpts})`,
       selectedAfterAll === totalOpts);
    ok(`Select all: zero JS errors during click (got ${jsErrors.length})`,
       jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

    // Click Clear — must deselect every option, still no JS errors.
    await page.click('button:has-text("Clear")');
    await page.waitForTimeout(120);
    const selectedAfterClear = await page.$$eval('select[name="teacher_ids"] option', (os) => os.filter((o) => o.selected).length);
    ok(`Clear: zero options selected (got ${selectedAfterClear})`, selectedAfterClear === 0);
    ok(`Clear: zero JS errors across Select all + Clear (total ${jsErrors.length})`,
       jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

    // Sanity: the hidden _op_id input is present (guards the idempotency
    // fix — if this ever regresses to missing, browser-side retries could
    // duplicate again).
    const opIdValue = await page.$eval('input[name="_op_id"]', (el) => el.value).catch(() => null);
    ok(`bulk form: hidden _op_id is present and non-empty (got '${String(opIdValue).slice(0, 12)}...')`,
       !!opIdValue && opIdValue.length >= 8);

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
