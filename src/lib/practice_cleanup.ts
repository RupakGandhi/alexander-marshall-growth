// ============================================================================
// practice_cleanup.ts — Practice-data cleanup workflow (super-admin only)
// ----------------------------------------------------------------------------
// The training-cleanup surface at /admin/data/practice-cleanup follows a
// two-phase review-scope → confirm → results workflow.  Records are ONLY
// eligible if an admin has explicitly tagged them with is_practice=1 via the
// same page (never by date, never by author, never by "everything in category").
//
// Two-phase design (F6 correction, Sept 24, 2026):
//
//   1. previewBatch() — snapshots the currently-tagged is_practice=1 set into
//      practice_cleanup_batches (status='preview') + practice_cleanup_row
//      (one row per parent) + a scope_hash fingerprint over that set.
//      This freezes the reviewed scope.
//
//   2. executeCleanup(batchId) — recomputes a scope_hash from the CURRENT
//      is_practice=1 set and compares to the batch's frozen hash.  If they
//      differ (e.g. another tab tagged record B after the admin reviewed A),
//      execute REJECTS with 'scope_changed'.  Otherwise it runs the cascade
//      atomically per parent via db.batch() and flips status='executed' in
//      the same transaction.
//
// Atomicity (F3 correction):
//
//   Every per-parent cascade is a single db.batch([...]) call — SQLite runs
//   all of that parent's UPDATE/DELETE + child-manifest INSERTs in one
//   transaction.  If any statement in the batch throws, D1 rolls back the
//   ENTIRE batch, leaving that parent + its cascade untouched.  The remaining
//   parents may still process (independent batches), and the final
//   'executed' flip records what actually happened.  A retry against the same
//   batch id is safe because every parent-level batch's UPDATEs are guarded
//   by WHERE deleted_at IS NULL (idempotent no-op on rerun) and the child
//   manifest uses UNIQUE(batch_id, child_kind, child_id).
//
// Per-child ownership (F4 correction):
//
//   The child manifest table (practice_cleanup_child) records ONE row per
//   dependent record this batch actually soft-deleted, including the child's
//   prior_deleted_at value (which the batch captured with a SELECT immediately
//   before the UPDATE).  Restore only clears deleted_at where
//   prior_deleted_at IS NULL — i.e. only where THIS batch was the deleter.
//   A child that was already soft-deleted before this batch (prior_deleted_at
//   IS NOT NULL) is NOT tracked and NOT touched by restore.
//
// Delivery-history preservation (F5 correction):
//
//   The coaching_note_share_delivery ledger is now SOFT-DELETED (not hard-
//   deleted) during cleanup and un-soft-deleted on restore.  Reads that
//   need "is this note deliverable / already delivered" filter deleted_at
//   IS NULL — during the cleanup window a soft-deleted ledger row is
//   invisible, but so is the parent note; on restore both come back with
//   their prior status intact.  A previously-'delivered' shared note whose
//   cleanup was restored still reports 'delivered' — no false failure, no
//   duplicate first-share alert.
//
// Historical ambiguous notifications (F7 correction):
//
//   The old auto-enroll path wrote notifications with
//   entity_type='pd_enrollment' but entity_id=module_id.  Cleaning up an
//   enrollment based on that assumption could either miss real practice
//   notifications or delete unrelated ones (if a module id collides with
//   the enrollment id).  The new path in src/lib/pd.ts writes real
//   enrollment ids.  For LEGACY rows, executeCleanup() DOES NOT guess: it
//   detects rows where entity_id resolves to a pd_modules.id (not a
//   pd_enrollments.id) and records them in practice_cleanup_ambiguous_notif
//   for admin review on the results page.
//
// Dependency ordering:
//   coaching_note                 → coaching_note_share_delivery (soft),
//                                    coaching_note_audit (soft),
//                                    notifications rows keyed on entity_id,
//                                    activity_log rows keyed on entity_id
//   pd_enrollment                 → pd_deliverables (soft),
//                                    pd_reflections (soft),
//                                    pd_deliverable_scores (soft),
//                                    notifications rows keyed on entity_id,
//                                    activity_log rows keyed on entity_id,
//                                    + historical-ambiguous-notif detection
//   external_pd_submission        → notifications, activity_log
//   observation                   → feedback_items (soft),
//                                    focus_areas (soft),
//                                    notifications, activity_log
//                                    (observation_scores has no deleted_at
//                                     — invisible via parent soft-delete)
//
// Notifications and activity_log are STILL hard-deleted at execute time
// (the inbox is user-facing state; restoring stale alerts would be
// surprising).  The results screen discloses this and restoration does
// NOT falsely report failed delivery — the ledger (now preserved) is the
// authoritative source of truth for delivery state.
// ============================================================================

export type EntityType = 'coaching_note' | 'pd_enrollment' | 'external_pd_submission' | 'observation';

export type ChildKind =
  | 'coaching_note_audit'
  | 'coaching_note_share_delivery'
  | 'pd_deliverable'
  | 'pd_reflection'
  | 'pd_deliverable_score'
  | 'feedback_item'
  | 'focus_area';

export interface Candidate {
  entity_type: EntityType;
  entity_id: number;
  label: string;
  // Per-entity dependent counts shown on the review-scope screen so the
  // admin sees exactly what will disappear with each parent record.
  dep_counts: Record<string, number>;
}

/** List every currently-tagged practice record with human-readable label +
 *  dependent counts.  Used by the preview step BEFORE the admin confirms.
 *  Excludes rows already soft-deleted so re-runs are clean. */
export async function listPracticeCandidates(db: D1Database): Promise<Candidate[]> {
  const out: Candidate[] = [];

  // Coaching notes.
  const cnotes = await db.prepare(
    `SELECT n.id, n.status, n.occurred_on,
            u.first_name || ' ' || u.last_name AS teacher_name,
            a.first_name || ' ' || a.last_name AS author_name,
            (SELECT COUNT(*) FROM coaching_note_audit ca WHERE ca.note_id = n.id AND ca.deleted_at IS NULL) AS audit_count,
            (SELECT COUNT(*) FROM coaching_note_share_delivery sd WHERE sd.note_id = n.id AND sd.deleted_at IS NULL) AS ledger_count,
            (SELECT COUNT(*) FROM notifications nx WHERE nx.entity_type='coaching_note' AND nx.entity_id=n.id) AS notif_count,
            (SELECT COUNT(*) FROM activity_log al WHERE al.entity_type='coaching_note' AND al.entity_id=n.id) AS activity_count
       FROM coaching_notes n
       JOIN users u ON u.id = n.teacher_id
       JOIN users a ON a.id = n.author_id
      WHERE n.is_practice = 1 AND n.deleted_at IS NULL
      ORDER BY n.id`
  ).all<any>();
  for (const r of ((cnotes.results as any[]) || [])) {
    out.push({
      entity_type: 'coaching_note',
      entity_id: Number(r.id),
      label: `Note #${r.id} (${r.status}) — ${r.author_name} → ${r.teacher_name}, ${r.occurred_on}`,
      dep_counts: {
        audit_rows: Number(r.audit_count) || 0,
        share_ledger_rows: Number(r.ledger_count) || 0,
        notifications: Number(r.notif_count) || 0,
        activity_log_rows: Number(r.activity_count) || 0,
      },
    });
  }

  // PD enrollments.
  const pds = await db.prepare(
    `SELECT e.id, e.status, e.source, e.hours_credited,
            u.first_name || ' ' || u.last_name AS teacher_name,
            m.title AS module_title,
            (SELECT COUNT(*) FROM pd_deliverables d WHERE d.enrollment_id = e.id AND d.deleted_at IS NULL) AS deliverable_count,
            (SELECT COUNT(*) FROM pd_reflections r WHERE r.enrollment_id = e.id AND r.deleted_at IS NULL) AS reflection_count,
            (SELECT COUNT(*) FROM pd_deliverable_scores s WHERE s.enrollment_id = e.id AND s.deleted_at IS NULL) AS deliverable_score_count,
            (SELECT COUNT(*) FROM notifications nx WHERE nx.entity_type='pd_enrollment' AND nx.entity_id=e.id) AS notif_count,
            (SELECT COUNT(*) FROM activity_log al WHERE al.entity_type='pd_enrollment' AND al.entity_id=e.id) AS activity_count
       FROM pd_enrollments e
       JOIN users u ON u.id = e.teacher_id
       LEFT JOIN pd_modules m ON m.id = e.module_id
      WHERE e.is_practice = 1 AND e.deleted_at IS NULL
      ORDER BY e.id`
  ).all<any>();
  for (const r of ((pds.results as any[]) || [])) {
    out.push({
      entity_type: 'pd_enrollment',
      entity_id: Number(r.id),
      label: `Enrollment #${r.id} — ${r.teacher_name}, ${r.module_title || 'module'} (${r.status}${r.hours_credited ? `, ${r.hours_credited}h credited` : ''})`,
      dep_counts: {
        deliverables: Number(r.deliverable_count) || 0,
        reflections: Number(r.reflection_count) || 0,
        deliverable_scores: Number(r.deliverable_score_count) || 0,
        notifications: Number(r.notif_count) || 0,
        activity_log_rows: Number(r.activity_count) || 0,
      },
    });
  }

  // External PD submissions.
  const ext = await db.prepare(
    `SELECT x.id, x.title, x.status, x.hours,
            u.first_name || ' ' || u.last_name AS teacher_name,
            (SELECT COUNT(*) FROM notifications nx WHERE nx.entity_type='external_pd_submission' AND nx.entity_id=x.id) AS notif_count,
            (SELECT COUNT(*) FROM activity_log al WHERE al.entity_type='external_pd_submission' AND al.entity_id=x.id) AS activity_count
       FROM external_pd_submissions x
       JOIN users u ON u.id = x.teacher_id
      WHERE x.is_practice = 1 AND x.deleted_at IS NULL
      ORDER BY x.id`
  ).all<any>();
  for (const r of ((ext.results as any[]) || [])) {
    out.push({
      entity_type: 'external_pd_submission',
      entity_id: Number(r.id),
      label: `External PD #${r.id} — ${r.teacher_name}, "${r.title}" (${r.status}, ${r.hours}h)`,
      dep_counts: {
        notifications: Number(r.notif_count) || 0,
        activity_log_rows: Number(r.activity_count) || 0,
      },
    });
  }

  // Observations (practice observations, e.g. training walkthroughs).
  const obs = await db.prepare(
    `SELECT o.id, o.status, o.observed_at, o.observation_type,
            u.first_name || ' ' || u.last_name AS teacher_name,
            a.first_name || ' ' || a.last_name AS appraiser_name,
            (SELECT COUNT(*) FROM observation_scores s WHERE s.observation_id = o.id) AS score_count,
            (SELECT COUNT(*) FROM feedback_items f WHERE f.observation_id = o.id AND f.deleted_at IS NULL) AS feedback_count,
            (SELECT COUNT(*) FROM focus_areas fa WHERE fa.opened_observation_id = o.id AND fa.deleted_at IS NULL) AS focus_count,
            (SELECT COUNT(*) FROM notifications nx WHERE nx.entity_type='observation' AND nx.entity_id=o.id) AS notif_count,
            (SELECT COUNT(*) FROM activity_log al WHERE al.entity_type='observation' AND al.entity_id=o.id) AS activity_count
       FROM observations o
       JOIN users u ON u.id = o.teacher_id
       JOIN users a ON a.id = o.appraiser_id
      WHERE o.is_practice = 1 AND o.deleted_at IS NULL
      ORDER BY o.id`
  ).all<any>();
  for (const r of ((obs.results as any[]) || [])) {
    out.push({
      entity_type: 'observation',
      entity_id: Number(r.id),
      label: `Obs #${r.id} (${r.observation_type}, ${r.status}) — ${r.appraiser_name} → ${r.teacher_name}, ${r.observed_at || ''}`,
      dep_counts: {
        observation_scores: Number(r.score_count) || 0,
        feedback_items: Number(r.feedback_count) || 0,
        focus_areas: Number(r.focus_count) || 0,
        notifications: Number(r.notif_count) || 0,
        activity_log_rows: Number(r.activity_count) || 0,
      },
    });
  }

  return out;
}

/** Tag or untag a single row as practice.  Only affects the is_practice
 *  flag — nothing is deleted. */
export async function togglePracticeFlag(
  db: D1Database, entityType: EntityType, entityId: number, isPractice: boolean,
): Promise<number> {
  const table = tableFor(entityType);
  const r = await db.prepare(
    `UPDATE ${table} SET is_practice=? WHERE id=?`
  ).bind(isPractice ? 1 : 0, entityId).run();
  return ((r.meta as any)?.changes || 0);
}

function tableFor(entityType: EntityType): string {
  switch (entityType) {
    case 'coaching_note':          return 'coaching_notes';
    case 'pd_enrollment':          return 'pd_enrollments';
    case 'external_pd_submission': return 'external_pd_submissions';
    case 'observation':            return 'observations';
  }
}

// ---------------------------------------------------------------------------
// Scope fingerprint (F6)
// ---------------------------------------------------------------------------
// Deterministic short string over the CURRENT is_practice=1 set.  Format:
//   'ct:1,4,7|pe:200|ext:|obs:12'    (sorted numeric ids per entity type)
// This makes a mismatch obvious in logs when scope drift is rejected and
// avoids the complexity of hashing/collisions.
function scopeFingerprintFromCandidates(cands: Candidate[]): string {
  const groups: Record<EntityType, number[]> = {
    coaching_note: [], pd_enrollment: [], external_pd_submission: [], observation: [],
  };
  for (const c of cands) groups[c.entity_type].push(c.entity_id);
  const abbr: Record<EntityType, string> = {
    coaching_note: 'ct', pd_enrollment: 'pe', external_pd_submission: 'ext', observation: 'obs',
  };
  return (Object.keys(groups) as EntityType[])
    .map(k => `${abbr[k]}:${groups[k].slice().sort((a, b) => a - b).join(',')}`)
    .join('|');
}

// ---------------------------------------------------------------------------
// previewBatch — F6 phase 1
// ---------------------------------------------------------------------------
/** Create a preview batch that freezes the currently-tagged is_practice=1
 *  set.  Returns the batch id.  The caller redirects the admin to a confirm
 *  page that reads this batch's manifest + snapshot.
 *
 *  Fails with 'nothing_to_clean' if no candidates are tagged.
 *
 *  The scope_hash on the batch encodes the exact reviewed set; the execute
 *  step re-derives the same fingerprint and refuses to run if it changed. */
export async function previewBatch(
  db: D1Database, actorId: number, note: string | null,
): Promise<{ batch_id: number; candidates: Candidate[]; scope_hash: string }> {
  const candidates = await listPracticeCandidates(db);
  if (candidates.length === 0) {
    throw new Error('nothing_to_clean');
  }
  const scopeHash = scopeFingerprintFromCandidates(candidates);
  const snapshot = JSON.stringify(candidates);
  // writer_nonce: idempotence token for the eventual 'executed' flip.
  const nonce = cryptoRandomId();

  const batchRes = await db.prepare(
    `INSERT INTO practice_cleanup_batches
       (actor_id, status, note, writer_nonce, scope_hash, candidate_snapshot_json)
     VALUES (?, 'preview', ?, ?, ?, ?)
     RETURNING id`
  ).bind(actorId, note, nonce, scopeHash, snapshot).run();
  const batchId = Number(((batchRes.results as any[])?.[0] || {}).id);
  if (!batchId) throw new Error('failed_to_create_batch');

  // Enumerate parents in practice_cleanup_row.  prior_deleted_at is captured
  // per-parent at execute time (right before its cascade batch runs), not
  // here — a candidate is by definition deleted_at IS NULL at preview
  // (listPracticeCandidates filters it), but re-verifying at execute time
  // makes retries safe.
  for (const c of candidates) {
    await db.prepare(
      `INSERT INTO practice_cleanup_row (batch_id, entity_type, entity_id, label)
       VALUES (?,?,?,?)`
    ).bind(batchId, c.entity_type, c.entity_id, c.label).run();
  }

  return { batch_id: batchId, candidates, scope_hash: scopeHash };
}

function cryptoRandomId(): string {
  // Web Crypto is available in the Cloudflare Workers runtime.  Use a UUID
  // — printable, unique enough for the nonce role.
  try {
    // @ts-ignore
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  // Fallback (never expected to hit in a Worker env).
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// executeCleanup — F3 (atomic) + F4 (per-child manifest) + F5 (ledger soft-
// delete) + F6 (scope-binding) + F7 (ambiguous-notif detection)
// ---------------------------------------------------------------------------

export interface ExecuteResult {
  batch_id: number;
  affected: Record<EntityType, number>;         // parent rows soft-deleted this batch
  cascaded: {
    coaching_note_audit_soft: number;
    coaching_note_share_delivery_soft: number;   // F5: was 'hard'; now 'soft'
    pd_deliverables_soft: number;
    pd_reflections_soft: number;
    pd_deliverable_scores_soft: number;
    feedback_items_soft: number;
    focus_areas_soft: number;
    notifications_hard: number;
    activity_log_hard: number;
    ambiguous_notifications_preserved: number;   // F7: NOT deleted, surfaced for review
  };
}

/** Execute a previously-created preview batch.  This is the atomic step:
 *
 *   1. Confirms the batch is in status='preview'.
 *   2. Confirms scope_hash matches the current is_practice=1 set.  If not,
 *      throws 'scope_changed' — the admin must review a refreshed preview.
 *   3. Loads the batch's parent manifest (practice_cleanup_row).
 *   4. For each parent, runs a per-parent db.batch([...]) that includes:
 *        - SELECT-captured prior_deleted_at for every child row about to be
 *          soft-deleted, INSERT INTO practice_cleanup_child (with that
 *          prior_deleted_at, which is always NULL for a fresh soft-delete)
 *        - the child soft-delete UPDATEs (guarded by deleted_at IS NULL)
 *        - the parent soft-delete UPDATE (guarded by deleted_at IS NULL)
 *        - hard-delete of matching notifications + activity_log rows
 *        - UPDATE practice_cleanup_row SET prior_deleted_at=<parent's prior>
 *   5. Detects historical-ambiguous notifications (entity_id resolves to a
 *      module_id instead of an enrollment_id) and records them in
 *      practice_cleanup_ambiguous_notif — does NOT delete them.
 *   6. Finalises: UPDATE the batch row to status='executed', executed_at,
 *      affected_counts_json.  Uses writer_nonce as an idempotence guard so
 *      a duplicate call is a no-op.
 */
export async function executeCleanup(
  db: D1Database, actorId: number, batchId: number,
): Promise<ExecuteResult> {
  const batch = await db.prepare(
    `SELECT id, status, scope_hash, writer_nonce, candidate_snapshot_json, actor_id
       FROM practice_cleanup_batches WHERE id=?`
  ).bind(batchId).first<any>();
  if (!batch) throw new Error('batch_not_found');
  if (batch.status === 'executed') throw new Error('already_executed');
  if (batch.status === 'restored') throw new Error('already_restored');
  if (batch.status !== 'preview')  throw new Error('batch_not_previewable');

  // F6: recompute fingerprint and refuse if scope drifted.
  const currentCandidates = await listPracticeCandidates(db);
  const currentHash = scopeFingerprintFromCandidates(currentCandidates);
  if (currentHash !== batch.scope_hash) {
    // Preserve the mismatch on the batch note for support review.
    await db.prepare(
      `UPDATE practice_cleanup_batches
          SET note = COALESCE(note || ' | ', '') || 'scope_drift_rejected: preview=' || ? || ' current=' || ?
        WHERE id=?`
    ).bind(String(batch.scope_hash), currentHash, batchId).run();
    throw new Error('scope_changed');
  }

  // Load the frozen parent manifest.
  const parents = await db.prepare(
    `SELECT entity_type, entity_id, label FROM practice_cleanup_row
      WHERE batch_id=? ORDER BY id`
  ).bind(batchId).all<any>();
  const parentRows = ((parents.results as any[]) || []) as Array<{ entity_type: EntityType; entity_id: number; label: string }>;

  const affected: Record<EntityType, number> = {
    coaching_note: 0, pd_enrollment: 0, external_pd_submission: 0, observation: 0,
  };
  const cascaded = {
    coaching_note_audit_soft: 0,
    coaching_note_share_delivery_soft: 0,
    pd_deliverables_soft: 0,
    pd_reflections_soft: 0,
    pd_deliverable_scores_soft: 0,
    feedback_items_soft: 0,
    focus_areas_soft: 0,
    notifications_hard: 0,
    activity_log_hard: 0,
    ambiguous_notifications_preserved: 0,
  };

  for (const p of parentRows) {
    const result = await cleanupOneParent(db, batchId, p.entity_type, p.entity_id);
    affected[p.entity_type] += result.parent_soft;
    cascaded.coaching_note_audit_soft         += result.coaching_note_audit_soft;
    cascaded.coaching_note_share_delivery_soft += result.coaching_note_share_delivery_soft;
    cascaded.pd_deliverables_soft             += result.pd_deliverables_soft;
    cascaded.pd_reflections_soft              += result.pd_reflections_soft;
    cascaded.pd_deliverable_scores_soft       += result.pd_deliverable_scores_soft;
    cascaded.feedback_items_soft              += result.feedback_items_soft;
    cascaded.focus_areas_soft                 += result.focus_areas_soft;
    cascaded.notifications_hard               += result.notifications_hard;
    cascaded.activity_log_hard                += result.activity_log_hard;
    cascaded.ambiguous_notifications_preserved += result.ambiguous_notifications_preserved;
  }

  // Idempotent 'executed' flip guarded by writer_nonce.
  const summary = { affected, cascaded };
  const flip = await db.prepare(
    `UPDATE practice_cleanup_batches
        SET status='executed', executed_at=CURRENT_TIMESTAMP,
            affected_counts_json=?, writer_nonce=NULL
      WHERE id=? AND status='preview' AND writer_nonce=?`
  ).bind(JSON.stringify(summary), batchId, batch.writer_nonce).run();
  const flipped = ((flip.meta as any)?.changes || 0) === 1;
  if (!flipped) {
    // Someone else (or a retry) already flipped.  That's OK — read whatever
    // is stored on the batch and return that summary rather than the one
    // we computed, so callers see the authoritative state.
    const after = await db.prepare(
      `SELECT affected_counts_json, status FROM practice_cleanup_batches WHERE id=?`
    ).bind(batchId).first<any>();
    if (after?.status !== 'executed') {
      throw new Error('flip_lost_but_not_executed');
    }
    const stored = after?.affected_counts_json ? JSON.parse(after.affected_counts_json) : summary;
    return { batch_id: batchId, ...stored };
  }
  return { batch_id: batchId, ...summary };
}

// ---------------------------------------------------------------------------
// cleanupOneParent — atomic per-parent cascade (F3)
// ---------------------------------------------------------------------------
// One db.batch() call.  D1 runs every statement inside a single transaction;
// if any statement throws, the whole batch rolls back and this parent + its
// cascade are untouched.  The caller can retry safely (WHERE deleted_at IS
// NULL guards make the UPDATEs idempotent, and UNIQUE(batch_id, child_kind,
// child_id) makes the child-manifest INSERTs idempotent).
//
// Layout of the batch (all statements are prepared+bound before .batch()):
//   1..N. For each child row that is CURRENTLY deleted_at IS NULL for this
//         parent, INSERT INTO practice_cleanup_child (batch_id, parent_*,
//         child_kind, child_id, prior_deleted_at=NULL).  We know
//         prior_deleted_at is NULL because we filtered the SELECT that way.
//   .    UPDATE <child_table> SET deleted_at=CURRENT_TIMESTAMP WHERE ...
//         AND deleted_at IS NULL   (soft-deletes the same set)
//   .    UPDATE <parent_table> SET deleted_at=CURRENT_TIMESTAMP WHERE id=?
//         AND deleted_at IS NULL
//   .    DELETE FROM notifications WHERE entity_type=? AND entity_id=?
//         (excluding ambiguous historical rows for pd_enrollment — those
//          have already been recorded in practice_cleanup_ambiguous_notif
//          BEFORE this batch runs)
//   .    DELETE FROM activity_log WHERE entity_type=? AND entity_id=?
//   .    UPDATE practice_cleanup_row SET prior_deleted_at=NULL WHERE
//         batch_id=? AND entity_type=? AND entity_id=?
//         (recorded here so restore knows this batch was the deleter)
async function cleanupOneParent(
  db: D1Database, batchId: number, entityType: EntityType, entityId: number,
): Promise<{
  parent_soft: number;
  coaching_note_audit_soft: number;
  coaching_note_share_delivery_soft: number;
  pd_deliverables_soft: number;
  pd_reflections_soft: number;
  pd_deliverable_scores_soft: number;
  feedback_items_soft: number;
  focus_areas_soft: number;
  notifications_hard: number;
  activity_log_hard: number;
  ambiguous_notifications_preserved: number;
}> {
  const stats = {
    parent_soft: 0,
    coaching_note_audit_soft: 0,
    coaching_note_share_delivery_soft: 0,
    pd_deliverables_soft: 0,
    pd_reflections_soft: 0,
    pd_deliverable_scores_soft: 0,
    feedback_items_soft: 0,
    focus_areas_soft: 0,
    notifications_hard: 0,
    activity_log_hard: 0,
    ambiguous_notifications_preserved: 0,
  };

  // Step 1 — READ phase (outside the batch, but the batch's WHERE guards
  // handle any race).  Enumerate the child rows currently deleted_at IS NULL
  // for this parent, so we can record them in the child manifest.
  const childRows = await gatherChildIds(db, entityType, entityId);

  // Step 2 — F7 pre-scan.  For pd_enrollment parents, look for HISTORICAL
  // ambiguous notifications whose entity_id resolves to a pd_modules.id
  // (not a pd_enrollments.id).  Record them in the ambiguous-notif table
  // so the admin can inspect on the results screen — DO NOT delete.
  let ambiguousNotifRows: Array<{ id: number; user_id: number; kind: string; title: string; entity_id: number }> = [];
  if (entityType === 'pd_enrollment') {
    ambiguousNotifRows = await findAmbiguousPdNotifications(db, entityId);
    for (const n of ambiguousNotifRows) {
      // Best-effort INSERT — UNIQUE(batch_id, notification_id) protects
      // against a duplicate detection on retry.
      try {
        await db.prepare(
          `INSERT INTO practice_cleanup_ambiguous_notif
             (batch_id, notification_id, entity_type, entity_id, resolves_as,
              user_id, kind, title, suspected_parent_enrollment_id)
           VALUES (?, ?, 'pd_enrollment', ?, 'pd_module', ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`
        ).bind(batchId, n.id, n.entity_id, n.user_id, n.kind, n.title, entityId).run();
        stats.ambiguous_notifications_preserved += 1;
      } catch (_) {
        // Ignore — a duplicate detection just means retry.
      }
    }
  }

  // Step 3 — build the per-parent batch.
  const stmts: D1PreparedStatement[] = [];

  // Insert child-manifest rows.  UNIQUE(batch_id, child_kind, child_id)
  // ensures a retry after a partial failure doesn't duplicate manifest
  // entries.  prior_deleted_at is bound as NULL because we only pulled
  // rows whose deleted_at IS NULL in gatherChildIds().
  for (const cr of childRows) {
    stmts.push(
      db.prepare(
        `INSERT INTO practice_cleanup_child
           (batch_id, parent_entity_type, parent_entity_id, child_kind, child_id, prior_deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT DO NOTHING`
      ).bind(batchId, entityType, entityId, cr.kind, cr.id)
    );
  }

  // Soft-delete the children.  Guarded by deleted_at IS NULL for
  // idempotence.
  if (entityType === 'coaching_note') {
    stmts.push(
      db.prepare(
        `UPDATE coaching_note_share_delivery
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE note_id=? AND deleted_at IS NULL`
      ).bind(entityId),
      db.prepare(
        `UPDATE coaching_note_audit
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE note_id=? AND deleted_at IS NULL`
      ).bind(entityId),
      db.prepare(
        `UPDATE coaching_notes
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE id=? AND deleted_at IS NULL`
      ).bind(entityId),
      db.prepare(
        `DELETE FROM notifications WHERE entity_type='coaching_note' AND entity_id=?`
      ).bind(entityId),
      db.prepare(
        `DELETE FROM activity_log WHERE entity_type='coaching_note' AND entity_id=?`
      ).bind(entityId),
    );
  } else if (entityType === 'pd_enrollment') {
    stmts.push(
      db.prepare(
        `UPDATE pd_deliverables
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE enrollment_id=? AND deleted_at IS NULL`
      ).bind(entityId),
      db.prepare(
        `UPDATE pd_reflections
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE enrollment_id=? AND deleted_at IS NULL`
      ).bind(entityId),
      db.prepare(
        `UPDATE pd_deliverable_scores
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE enrollment_id=? AND deleted_at IS NULL`
      ).bind(entityId),
      db.prepare(
        `UPDATE pd_enrollments
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE id=? AND deleted_at IS NULL`
      ).bind(entityId),
      // Delete ONLY the unambiguous notifications: those whose entity_id
      // resolves to a real enrollment id.  Ambiguous historical rows were
      // recorded in practice_cleanup_ambiguous_notif above and are LEFT
      // ALONE.  The subquery filters out ambiguous ids explicitly.
      db.prepare(
        `DELETE FROM notifications
          WHERE entity_type='pd_enrollment' AND entity_id=?
            AND id NOT IN (SELECT notification_id FROM practice_cleanup_ambiguous_notif WHERE batch_id=?)`
      ).bind(entityId, batchId),
      db.prepare(
        `DELETE FROM activity_log WHERE entity_type='pd_enrollment' AND entity_id=?`
      ).bind(entityId),
    );
  } else if (entityType === 'external_pd_submission') {
    stmts.push(
      db.prepare(
        `UPDATE external_pd_submissions
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE id=? AND deleted_at IS NULL`
      ).bind(entityId),
      db.prepare(
        `DELETE FROM notifications WHERE entity_type='external_pd_submission' AND entity_id=?`
      ).bind(entityId),
      db.prepare(
        `DELETE FROM activity_log WHERE entity_type='external_pd_submission' AND entity_id=?`
      ).bind(entityId),
    );
  } else if (entityType === 'observation') {
    stmts.push(
      db.prepare(
        `UPDATE feedback_items
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE observation_id=? AND deleted_at IS NULL`
      ).bind(entityId),
      db.prepare(
        `UPDATE focus_areas
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE opened_observation_id=? AND deleted_at IS NULL`
      ).bind(entityId),
      db.prepare(
        `UPDATE observations
            SET deleted_at=CURRENT_TIMESTAMP
          WHERE id=? AND deleted_at IS NULL`
      ).bind(entityId),
      db.prepare(
        `DELETE FROM notifications WHERE entity_type='observation' AND entity_id=?`
      ).bind(entityId),
      db.prepare(
        `DELETE FROM activity_log WHERE entity_type='observation' AND entity_id=?`
      ).bind(entityId),
    );
  }

  // Mark this parent row as "we owned the delete" (prior_deleted_at=NULL)
  // in the manifest, so restore knows to reverse it.  Guarded by the same
  // batch_id so we don't cross batches.
  stmts.push(
    db.prepare(
      `UPDATE practice_cleanup_row
          SET prior_deleted_at = NULL
        WHERE batch_id=? AND entity_type=? AND entity_id=?`
    ).bind(batchId, entityType, entityId),
  );

  // Fire the atomic batch.  Any throw here means D1 rolled EVERYTHING in
  // this call back — child-manifest INSERTs, child soft-deletes, parent
  // soft-delete, notif/activity DELETEs.  This parent's state is unchanged.
  // Propagate the error so the caller (executeCleanup) can also propagate
  // and leave the batch at status='preview' — the admin re-visits, can
  // see nothing was cleaned, and retry.
  const results = await db.batch(stmts);

  // Sum row counts back into stats.
  // The layout above is: N child-INSERTs, then the cascade in a fixed
  // order per entity_type.  Rather than counting positions (fragile), we
  // read the actual rowcounts by re-querying the manifest and the target
  // tables — cheaper than it looks because we already have batchId +
  // entityId in memory.  This also makes the stats accurate against what
  // D1 actually committed (not what we prepared).
  const cm = await db.prepare(
    `SELECT child_kind, COUNT(*) AS n
       FROM practice_cleanup_child
      WHERE batch_id=? AND parent_entity_type=? AND parent_entity_id=?
      GROUP BY child_kind`
  ).bind(batchId, entityType, entityId).all<any>();
  for (const r of ((cm.results as any[]) || [])) {
    const n = Number(r.n) || 0;
    switch (r.child_kind as ChildKind) {
      case 'coaching_note_audit':          stats.coaching_note_audit_soft         += n; break;
      case 'coaching_note_share_delivery': stats.coaching_note_share_delivery_soft += n; break;
      case 'pd_deliverable':               stats.pd_deliverables_soft             += n; break;
      case 'pd_reflection':                stats.pd_reflections_soft              += n; break;
      case 'pd_deliverable_score':         stats.pd_deliverable_scores_soft       += n; break;
      case 'feedback_item':                stats.feedback_items_soft              += n; break;
      case 'focus_area':                   stats.focus_areas_soft                 += n; break;
    }
  }
  // Parent rowcount — did we soft-delete it, or was it already gone?
  // The batch's UPDATE was guarded by deleted_at IS NULL; look at the
  // meta.changes of the parent statement.  Simpler: check the current
  // deleted_at.
  const parentRow = await db.prepare(
    `SELECT deleted_at FROM ${tableFor(entityType)} WHERE id=?`
  ).bind(entityId).first<any>();
  stats.parent_soft = parentRow?.deleted_at ? 1 : 0;

  // Notifications + activity_log — count what's left (should be zero for
  // this entity_id after a successful cascade, except ambiguous notifs
  // which we intentionally preserved).
  const notifRemainAmbiguous = ambiguousNotifRows.length;
  // We DELETEd the non-ambiguous ones; count = what was there before -
  // ambiguous.  We can approximate by counting: notifications we know
  // were the target.  Simpler: re-run a count of what WOULD have been
  // deleted (i.e., the "before" count), minus ambiguous preserved.
  //
  // Instead of pre-counting for perfect accuracy, just report the delta:
  // notifications_hard = "how many rows we successfully DELETEd that were
  // NOT ambiguous".  Query the current count for this entity_id; anything
  // still there was ambiguous+preserved.  So:
  //   notifications_hard = <pre-count> - <post-count>
  // but pre-count isn't stored.  Take a different tack: everything that
  // used to point at this entity_id is now either (a) DELETEd, or
  // (b) in practice_cleanup_ambiguous_notif.  Query the ambiguous rows
  // for this batch+parent to get the preserved count, then use
  // meta.changes from the batch's DELETE result via `results` above.
  //
  // results is an array of D1Result — index of the notifications DELETE
  // depends on entity_type.  For simplicity, use meta.changes when
  // available; fall back to 0.  (results ordering IS stable in D1.)
  const notifDeleteIdx = deleteIdxFor(entityType, /*isNotif*/ true, /*childCount*/ childRows.length);
  const activityDeleteIdx = deleteIdxFor(entityType, /*isNotif*/ false, /*childCount*/ childRows.length);
  stats.notifications_hard = safeChanges(results, notifDeleteIdx);
  stats.activity_log_hard = safeChanges(results, activityDeleteIdx);
  void notifRemainAmbiguous;

  return stats;
}

function safeChanges(results: D1Result[] | any, idx: number): number {
  try {
    const r = (results as any[])[idx];
    return Number(r?.meta?.changes) || 0;
  } catch {
    return 0;
  }
}

// Layout indices per entity_type inside cleanupOneParent's `stmts` array,
// AFTER the childCount child-manifest INSERTs and INCLUDING them in the
// starting offset.
function deleteIdxFor(et: EntityType, isNotif: boolean, childCount: number): number {
  // childCount INSERTs come first.  Then per entity_type:
  //   coaching_note:          0=cn_share_delivery UPD, 1=cn_audit UPD, 2=coaching_notes UPD, 3=notif DEL, 4=activity DEL, 5=manifest UPD
  //   pd_enrollment:          0=deliv UPD, 1=refl UPD, 2=scores UPD, 3=enrollments UPD, 4=notif DEL, 5=activity DEL, 6=manifest UPD
  //   external_pd_submission: 0=external UPD, 1=notif DEL, 2=activity DEL, 3=manifest UPD
  //   observation:            0=feedback UPD, 1=focus UPD, 2=obs UPD, 3=notif DEL, 4=activity DEL, 5=manifest UPD
  const base = childCount;
  if (et === 'coaching_note')          return base + (isNotif ? 3 : 4);
  if (et === 'pd_enrollment')          return base + (isNotif ? 4 : 5);
  if (et === 'external_pd_submission') return base + (isNotif ? 1 : 2);
  if (et === 'observation')            return base + (isNotif ? 3 : 4);
  return -1;
}

/** Read the current deleted_at IS NULL child rows for a parent so we can
 *  record them in practice_cleanup_child at execute time. */
async function gatherChildIds(
  db: D1Database, entityType: EntityType, entityId: number,
): Promise<Array<{ kind: ChildKind; id: number }>> {
  const out: Array<{ kind: ChildKind; id: number }> = [];
  if (entityType === 'coaching_note') {
    const r1 = await db.prepare(
      `SELECT id FROM coaching_note_audit WHERE note_id=? AND deleted_at IS NULL`
    ).bind(entityId).all<any>();
    for (const r of ((r1.results as any[]) || [])) out.push({ kind: 'coaching_note_audit', id: Number(r.id) });
    const r2 = await db.prepare(
      `SELECT id FROM coaching_note_share_delivery WHERE note_id=? AND deleted_at IS NULL`
    ).bind(entityId).all<any>();
    for (const r of ((r2.results as any[]) || [])) out.push({ kind: 'coaching_note_share_delivery', id: Number(r.id) });
  } else if (entityType === 'pd_enrollment') {
    const r1 = await db.prepare(
      `SELECT id FROM pd_deliverables WHERE enrollment_id=? AND deleted_at IS NULL`
    ).bind(entityId).all<any>();
    for (const r of ((r1.results as any[]) || [])) out.push({ kind: 'pd_deliverable', id: Number(r.id) });
    const r2 = await db.prepare(
      `SELECT id FROM pd_reflections WHERE enrollment_id=? AND deleted_at IS NULL`
    ).bind(entityId).all<any>();
    for (const r of ((r2.results as any[]) || [])) out.push({ kind: 'pd_reflection', id: Number(r.id) });
    const r3 = await db.prepare(
      `SELECT id FROM pd_deliverable_scores WHERE enrollment_id=? AND deleted_at IS NULL`
    ).bind(entityId).all<any>();
    for (const r of ((r3.results as any[]) || [])) out.push({ kind: 'pd_deliverable_score', id: Number(r.id) });
  } else if (entityType === 'observation') {
    const r1 = await db.prepare(
      `SELECT id FROM feedback_items WHERE observation_id=? AND deleted_at IS NULL`
    ).bind(entityId).all<any>();
    for (const r of ((r1.results as any[]) || [])) out.push({ kind: 'feedback_item', id: Number(r.id) });
    const r2 = await db.prepare(
      `SELECT id FROM focus_areas WHERE opened_observation_id=? AND deleted_at IS NULL`
    ).bind(entityId).all<any>();
    for (const r of ((r2.results as any[]) || [])) out.push({ kind: 'focus_area', id: Number(r.id) });
  }
  // external_pd_submission has no soft-deletable children.
  return out;
}

/** F7 detection.  For a given enrollment id, find every notification whose
 *  entity_type='pd_enrollment' but whose entity_id does NOT exist in
 *  pd_enrollments AND DOES exist in pd_modules — i.e. a historical
 *  ambiguous row written under the old auto-enroll bug.  We return rows
 *  that specifically pair the CURRENTLY-CLEANING enrollment's module_id,
 *  because that's the only pattern the admin can meaningfully review as
 *  "associated with this practice cleanup".  Nothing else is returned or
 *  touched — collision candidates from unrelated modules stay entirely
 *  untouched.
 *
 *  If the enrollment being cleaned has no module_id (deleted module?),
 *  we return an empty list — we can't associate anything unambiguously. */
async function findAmbiguousPdNotifications(
  db: D1Database, enrollmentId: number,
): Promise<Array<{ id: number; user_id: number; kind: string; title: string; entity_id: number }>> {
  const enr = await db.prepare(
    `SELECT module_id FROM pd_enrollments WHERE id=?`
  ).bind(enrollmentId).first<any>();
  const moduleId = Number(enr?.module_id || 0);
  if (!moduleId) return [];
  const res = await db.prepare(
    `SELECT n.id, n.user_id, n.kind, n.title, n.entity_id
       FROM notifications n
      WHERE n.entity_type = 'pd_enrollment'
        AND n.entity_id = ?
        AND NOT EXISTS (SELECT 1 FROM pd_enrollments e WHERE e.id = n.entity_id)
        AND EXISTS (SELECT 1 FROM pd_modules m WHERE m.id = n.entity_id)`
  ).bind(moduleId).all<any>();
  return ((res.results as any[]) || []).map(r => ({
    id: Number(r.id), user_id: Number(r.user_id),
    kind: String(r.kind || ''), title: String(r.title || ''),
    entity_id: Number(r.entity_id),
  }));
}

// ---------------------------------------------------------------------------
// restoreBatch — F4 (per-child ownership) + F5 (ledger un-soft-delete)
// ---------------------------------------------------------------------------
/** Restore a previously-executed batch.  Un-soft-deletes parent rows this
 *  batch deleted AND per-child rows recorded in practice_cleanup_child
 *  whose prior_deleted_at IS NULL (i.e. this batch was the deleter).
 *
 *  Notifications and activity_log rows are NOT re-created — they were
 *  hard-deleted at execute time by design.  The delivery ledger (which IS
 *  now soft-deleted, not hard) IS restored, so a previously-'delivered'
 *  shared note reports 'delivered' after restore rather than 'never'. */
export async function restoreBatch(db: D1Database, batchId: number, actorId: number): Promise<{
  restored: Record<EntityType, number>;
  cascade_restored: Record<string, number>;
}> {
  const batch = await db.prepare(
    `SELECT id, status FROM practice_cleanup_batches WHERE id=?`
  ).bind(batchId).first<any>();
  if (!batch) throw new Error('batch_not_found');
  if (batch.status !== 'executed') throw new Error('batch_not_restorable');

  // Parent rows: only un-delete those whose manifest prior_deleted_at IS
  // NULL (this batch was the deleter).  A parent whose prior_deleted_at
  // IS NOT NULL was already soft-deleted before this batch ran; leave
  // it in that state.
  const parents = await db.prepare(
    `SELECT entity_type, entity_id
       FROM practice_cleanup_row
      WHERE batch_id=? AND prior_deleted_at IS NULL
      ORDER BY id`
  ).bind(batchId).all<any>();
  const parentRows = ((parents.results as any[]) || []);

  const restored: Record<EntityType, number> = {
    coaching_note: 0, pd_enrollment: 0, external_pd_submission: 0, observation: 0,
  };
  const cascade_restored: Record<string, number> = {
    coaching_note_audit: 0,
    coaching_note_share_delivery: 0,
    pd_deliverable: 0,
    pd_reflection: 0,
    pd_deliverable_score: 0,
    feedback_item: 0,
    focus_area: 0,
  };

  // Restore each parent + its per-child manifest rows in a single db.batch()
  // per parent — atomic for the same reasons as execute.
  for (const p of parentRows) {
    const et = p.entity_type as EntityType;
    const id = Number(p.entity_id);
    const table = tableFor(et);

    // Children for this batch+parent whose prior_deleted_at IS NULL.
    const children = await db.prepare(
      `SELECT child_kind, child_id
         FROM practice_cleanup_child
        WHERE batch_id=? AND parent_entity_type=? AND parent_entity_id=?
          AND prior_deleted_at IS NULL`
    ).bind(batchId, et, id).all<any>();
    const childRows = ((children.results as any[]) || []) as Array<{ child_kind: ChildKind; child_id: number }>;

    const stmts: D1PreparedStatement[] = [];
    // Un-soft-delete the parent.
    stmts.push(
      db.prepare(
        `UPDATE ${table} SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL`
      ).bind(id),
    );
    // Un-soft-delete each recorded child by id (NOT by parent_id) so we
    // touch ONLY the exact rows this batch owned — preserves the F4
    // guarantee that a previously-deleted child stays deleted.
    for (const cr of childRows) {
      const t = childTableFor(cr.child_kind);
      stmts.push(
        db.prepare(
          `UPDATE ${t} SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL`
        ).bind(cr.child_id),
      );
    }

    const results = await db.batch(stmts);
    // results[0] = parent UPDATE; results[1..] = child UPDATEs.
    const parentChanges = safeChanges(results as any, 0);
    restored[et] += parentChanges;
    for (let i = 0; i < childRows.length; i++) {
      const changed = safeChanges(results as any, 1 + i);
      cascade_restored[childRows[i].child_kind] += changed;
    }
  }

  await db.prepare(
    `UPDATE practice_cleanup_batches
        SET status='restored', restored_at=CURRENT_TIMESTAMP, restored_by=?
      WHERE id=? AND status='executed'`
  ).bind(actorId, batchId).run();

  return { restored, cascade_restored };
}

function childTableFor(k: ChildKind): string {
  switch (k) {
    case 'coaching_note_audit':          return 'coaching_note_audit';
    case 'coaching_note_share_delivery': return 'coaching_note_share_delivery';
    case 'pd_deliverable':               return 'pd_deliverables';
    case 'pd_reflection':                return 'pd_reflections';
    case 'pd_deliverable_score':         return 'pd_deliverable_scores';
    case 'feedback_item':                return 'feedback_items';
    case 'focus_area':                   return 'focus_areas';
  }
}

// ---------------------------------------------------------------------------
// loadBatch / listBatches / loadAmbiguousNotifs — read helpers for the UI
// ---------------------------------------------------------------------------

/** Load a batch summary + its manifest for the results view. */
export async function loadBatch(db: D1Database, batchId: number): Promise<any> {
  const b = await db.prepare(
    `SELECT b.*, u.first_name || ' ' || u.last_name AS actor_name,
            r.first_name || ' ' || r.last_name AS restored_by_name
       FROM practice_cleanup_batches b
       JOIN users u ON u.id = b.actor_id
       LEFT JOIN users r ON r.id = b.restored_by
      WHERE b.id=?`
  ).bind(batchId).first<any>();
  if (!b) return null;
  const rows = await db.prepare(
    `SELECT entity_type, entity_id, label, prior_deleted_at
       FROM practice_cleanup_row
      WHERE batch_id=? ORDER BY entity_type, entity_id`
  ).bind(batchId).all<any>();
  const ambiguous = await db.prepare(
    `SELECT notification_id, entity_type, entity_id, resolves_as,
            user_id, kind, title, suspected_parent_enrollment_id
       FROM practice_cleanup_ambiguous_notif
      WHERE batch_id=?
      ORDER BY notification_id`
  ).bind(batchId).all<any>();
  const children = await db.prepare(
    `SELECT parent_entity_type, parent_entity_id, child_kind, child_id, prior_deleted_at
       FROM practice_cleanup_child
      WHERE batch_id=?
      ORDER BY parent_entity_type, parent_entity_id, child_kind, child_id`
  ).bind(batchId).all<any>();
  return {
    batch: b,
    rows: (rows.results as any[]) || [],
    ambiguous_notifs: (ambiguous.results as any[]) || [],
    children: (children.results as any[]) || [],
  };
}

/** List all batches (newest first). */
export async function listBatches(db: D1Database, limit = 25): Promise<any[]> {
  const r = await db.prepare(
    `SELECT b.*, u.first_name || ' ' || u.last_name AS actor_name,
            (SELECT COUNT(*) FROM practice_cleanup_row WHERE batch_id=b.id) AS row_count
       FROM practice_cleanup_batches b
       JOIN users u ON u.id = b.actor_id
      ORDER BY b.id DESC LIMIT ?`
  ).bind(limit).all<any>();
  return (r.results as any[]) || [];
}

/** Manually resolve one ambiguous notification.  Called from the results
 *  page when the admin decides whether the row is a real practice
 *  notification (delete) or a legitimate real-work notification (keep).
 *  Both actions leave a paper trail in the practice_cleanup_ambiguous_notif
 *  table (we mark it via a resolves_as suffix) so a subsequent admin sees
 *  the decision. */
export async function resolveAmbiguousNotif(
  db: D1Database, batchId: number, notificationId: number, decision: 'delete' | 'keep',
): Promise<{ deleted: number }> {
  const row = await db.prepare(
    `SELECT id, notification_id FROM practice_cleanup_ambiguous_notif
      WHERE batch_id=? AND notification_id=?`
  ).bind(batchId, notificationId).first<any>();
  if (!row) throw new Error('ambiguous_row_not_found');
  let deleted = 0;
  if (decision === 'delete') {
    const r = await db.prepare(
      `DELETE FROM notifications WHERE id=?`
    ).bind(notificationId).run();
    deleted = ((r.meta as any)?.changes || 0);
  }
  await db.prepare(
    `UPDATE practice_cleanup_ambiguous_notif
        SET resolves_as = resolves_as || ':' || ?
      WHERE id=?`
  ).bind(decision === 'delete' ? 'admin_deleted' : 'admin_kept', row.id).run();
  return { deleted };
}
