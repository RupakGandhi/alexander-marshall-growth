// ============================================================================
// teacher_labels.ts — Fix 2 (June 2, 2026 brief)
// ============================================================================
// Britney's verbatim concern from the leadership meeting: "Teachers shouldn't
// feel like the platform is shouting their score at them every time they see a
// PD title. Calling it 'Level 1 → 2: Anchor charts' is correct for an admin
// who needs to see the gap, but for the teacher it just reads as 'you're at a
// 1, here's your homework.'"
//
// Rule (per brief Section 3, Fix 2 acceptance criteria):
//   1. Strip the "Level X → Y:" prefix from PD module titles when shown to a
//      teacher. Internal admin / coach / appraiser views must remain unchanged.
//   2. Hide the bare numeric source_score_level on the teacher's "Recommended"
//      and "Started" cards — replace with friendlier phrasing.
//   3. Never invent labels for the teacher; if the title has no prefix the
//      function returns it untouched.
//
// This module is intentionally tiny and pure so it can be unit-tested and
// imported anywhere we render a teacher-facing string. Admin / coach /
// appraiser surfaces simply DO NOT import from this file — that is the
// guardrail that keeps the no-scores-for-coaches and full-fidelity-for-admins
// rules intact.
// ============================================================================

/**
 * Strip leading "Level N → M:" (or any case / dash / colon variant) from a
 * PD-module title so a teacher sees just the friendly title.
 *
 * Examples (input → output):
 *   "Level 1 → 2: Anchor charts that travel"  → "Anchor charts that travel"
 *   "Level 2 → 3: Cold-call protocol"         → "Cold-call protocol"
 *   "Level 1 -> 2 — Wait-time"                → "Wait-time"
 *   "Anchor charts that travel"               → "Anchor charts that travel"  (no-op)
 */
export function softenTitleForTeacher(title?: string | null): string {
  if (!title) return '';
  const t = String(title);
  // Match either "Level N → M" or "Level N -> M" (en-dash, em-dash, ASCII arrow)
  // followed by a colon, en-dash, em-dash, or hyphen, then trim.
  const re = /^\s*Level\s*\d+\s*(?:→|->|⇒|—|–|-)\s*\d+\s*[:\-–—]\s*/i;
  return t.replace(re, '').trim();
}

/**
 * "Recommended for You" friendly phrasing for a teacher card. Replaces the
 * raw "source level 1" hint with growth-oriented language. Returns null when
 * there is nothing to say (e.g. self-enrolled module) so callers can hide
 * the line entirely instead of rendering an empty pill.
 *
 * Marshall-aligned tone (updated June 2026 per Dr. Gandhi / ChatGPT analysis):
 *   - Score 1  → Priority *support* recommended (corrective, below standard).
 *   - Score 2  → Growth module recommended to reach *Effective* practice.
 *   - Score 3  → "Optional stretch" — never auto-assigned. The teacher is
 *               meeting the Marshall standard; Highly Effective is aspirational,
 *               not a deficiency. (If a Level 3 → 4 module is ever surfaced as
 *               auto-source we still soften it as optional/leadership-oriented.)
 *   - No level → fall back to generic "after a recent observation" wording.
 */
export function softenSourceForTeacher(
  enrollment: { source?: string | null; source_score_level?: number | null; recommender_first?: string | null; recommender_last?: string | null }
): string | null {
  const source = enrollment.source || '';
  const lvl = typeof enrollment.source_score_level === 'number' ? enrollment.source_score_level : null;
  if (source === 'auto') {
    // Don't disclose the raw level number — frame it as growth, but route the
    // tone (support vs. stretch) by the score so teachers feel the right signal.
    if (lvl === 1) return 'Priority support recommended after a recent observation';
    if (lvl === 2) return 'Growth module recommended to reach Effective practice';
    if (lvl === 3) return 'Optional stretch — you are meeting the Marshall standard';
    return 'Recommended after a recent observation';
  }
  if (source === 'assigned') {
    const who = [enrollment.recommender_first, enrollment.recommender_last].filter(Boolean).join(' ');
    // If a coach/appraiser hand-picked a stretch module, honor the leadership framing.
    if (lvl === 3) {
      return who ? `Optional stretch — recommended by ${who}` : 'Optional stretch — recommended for you';
    }
    return who ? `Recommended by ${who}` : 'Recommended for you';
  }
  if (source === 'self') return null; // they picked it themselves — no caption needed
  return null;
}

/**
 * Whether a given PD enrollment row's "growth signals" (target_level,
 * source_score_level) should be hidden from a teacher-facing render.
 * Admin / coach / appraiser code paths ignore this; only the teacher PD list
 * + teacher home + teacher PDF export use it.
 */
export function hideGrowthSignalsForTeacher(): boolean {
  return true;
}
