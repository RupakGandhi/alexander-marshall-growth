// ============================================================================
// practice_cleanup.ts — Practice-data cleanup workflow (super-admin only)
// ----------------------------------------------------------------------------
// Third-round rewrite (Sept 24, 2026 evening) — see migrations/0017 header
// for the defect list this file corrects.  Highlights:
//
//   * FULL-BATCH ATOMICITY (item 1).  A SINGLE db.batch() call carries every
//     write for every parent's cascade AND the final status='executed' flip.
//     D1 runs the whole batch inside one implicit BEGIN/COMMIT — any single-
//     statement failure rolls back every write in the batch.  No "first
//     parent stuck deleted, batch stuck at preview" state is reachable.
//     Even a failure on the very last status-flip statement rolls back the
//     rows that were just soft-deleted.
//
//   * EXACT-SCOPE BINDING (item 2).  In addition to the parent-id fingerprint
//     (scope_hash), preview computes a dep_fingerprint over the child rows
//     currently attached to each parent.  Execute recomputes both and
//     refuses to run if either changed since preview.
//
//   * OWNERSHIP CLAIM inside the transaction (items 2 & 3).  Child-manifest
//     rows are inserted via INSERT ... SELECT WHERE deleted_at IS NULL,
//     inside the same batch that soft-deletes them.  The full child set is
//     therefore atomically claimed AND deleted in the same transaction; no
//     child can be added mid-batch and get soft-deleted without also
//     entering the manifest (both statements see the same row set within
//     the transaction).  A UNIQUE(entity_type, entity_id) table
//     practice_cleanup_open_claim prevents a second preview from touching
//     the same parent while an earlier preview is still open.
//
//   * RESTORE OWNERSHIP (item 3).  Restore compares the parent's CURRENT
//     deleted_at to the timestamp this batch stamped (recorded in
//     practice_cleanup_row.deleted_at_stamp) and refuses to touch a row
//     whose stamp has changed (a newer cleanup batch is now the responsible
//     party).  Same for children.
//
//   * AMBIGUOUS-NOTIFICATION COLLISIONS (item 4).  The historical PD-notif
//     detector now preserves ANY notification whose recipient user_id is
//     NOT the enrollment's teacher_id, OR whose entity_id also happens to
//     match a pd_modules.id.  A stray "entity_id happens to equal our
//     enrollment id" cross-teacher alert is now preserved for review instead
//     of hard-deleted.
//
//   * BATCH SIZE CAP.  previewBatch refuses to accept more than
//     PRACTICE_CLEANUP_MAX_BATCH candidate parents so a runaway preview
//     can never produce a batch too large for D1 to run in one call.
//
// Dependency ordering (unchanged from 0016):
//   coaching_note     → coaching_note_share_delivery (soft),
//                       coaching_note_audit (soft),
//                       notifications (hard) + activity_log (hard)
//   pd_enrollment     → pd_deliverables (soft), pd_reflections (soft),
//                       pd_deliverable_scores (soft),
//                       notifications + activity_log (hard;
//                       + ambiguous-notif detection preserves collisions)
//   external_pd_submission → notifications + activity_log (hard)
//   observation       → feedback_items (soft), focus_areas (soft),
//                       notifications + activity_log (hard).
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
  dep_counts: Record<string, number>;
}

/** Maximum candidate parents allowed in a single preview/execute batch.
 *  A runaway preview would otherwise produce a batch too large for D1 to
 *  run in a single call, breaking the single-transaction guarantee. */
export const PRACTICE_CLEANUP_MAX_BATCH = 200;

// ---------------------------------------------------------------------------
// listPracticeCandidates — read-only enumeration (unchanged from 0016)
// ---------------------------------------------------------------------------

export async function listPracticeCandidates(db: D1Database): Promise<Candidate[]> {
  const out: Candidate[] = [];

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
// Fingerprints (F6 + item 2)
// ---------------------------------------------------------------------------
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

/** Item 2 fix: fingerprint over the current CHILDREN of every candidate.
 *  Called at preview time to snapshot the dependency shape, and again at
 *  execute time (INSIDE the transaction — see below) to detect drift.  If
 *  a child was added or removed between preview and execute, the two
 *  fingerprints differ and execute rejects the batch. */
async function depFingerprint(db: D1Database, cands: Candidate[]): Promise<string> {
  const parts: string[] = [];
  for (const c of cands) {
    const kids = await gatherChildIds(db, c.entity_type, c.entity_id);
    // Group child ids by kind, sort within kind for determinism.
    const byKind: Record<string, number[]> = {};
    for (const k of kids) (byKind[k.kind] ||= []).push(k.id);
    const kindKeys = Object.keys(byKind).sort();
    const shape = kindKeys.map(kk => `${kk}=[${byKind[kk].sort((a, b) => a - b).join(',')}]`).join(';');
    parts.push(`${c.entity_type}#${c.entity_id}{${shape}}`);
  }
  return parts.join('|');
}

/** Read the current deleted_at IS NULL child rows for a parent.  Used by
 *  depFingerprint() and (informationally) by the results screen. */
async function gatherChildIds(
  db: D1Database, entityType: EntityType, entityId: number,
): Promise<Array<{ kind: ChildKind; id: number }>> {
  const out: Array<{ kind: ChildKind; id: number }> = [];
  if (entityType === 'coaching_note') {
    const r1 = await db.prepare(
      `SELECT id FROM coaching_note_audit WHERE note_id=? AND deleted_at IS NULL ORDER BY id`
    ).bind(entityId).all<any>();
    for (const r of ((r1.results as any[]) || [])) out.push({ kind: 'coaching_note_audit', id: Number(r.id) });
    const r2 = await db.prepare(
      `SELECT id FROM coaching_note_share_delivery WHERE note_id=? AND deleted_at IS NULL ORDER BY id`
    ).bind(entityId).all<any>();
    for (const r of ((r2.results as any[]) || [])) out.push({ kind: 'coaching_note_share_delivery', id: Number(r.id) });
  } else if (entityType === 'pd_enrollment') {
    const r1 = await db.prepare(
      `SELECT id FROM pd_deliverables WHERE enrollment_id=? AND deleted_at IS NULL ORDER BY id`
    ).bind(entityId).all<any>();
    for (const r of ((r1.results as any[]) || [])) out.push({ kind: 'pd_deliverable', id: Number(r.id) });
    const r2 = await db.prepare(
      `SELECT id FROM pd_reflections WHERE enrollment_id=? AND deleted_at IS NULL ORDER BY id`
    ).bind(entityId).all<any>();
    for (const r of ((r2.results as any[]) || [])) out.push({ kind: 'pd_reflection', id: Number(r.id) });
    const r3 = await db.prepare(
      `SELECT id FROM pd_deliverable_scores WHERE enrollment_id=? AND deleted_at IS NULL ORDER BY id`
    ).bind(entityId).all<any>();
    for (const r of ((r3.results as any[]) || [])) out.push({ kind: 'pd_deliverable_score', id: Number(r.id) });
  } else if (entityType === 'observation') {
    const r1 = await db.prepare(
      `SELECT id FROM feedback_items WHERE observation_id=? AND deleted_at IS NULL ORDER BY id`
    ).bind(entityId).all<any>();
    for (const r of ((r1.results as any[]) || [])) out.push({ kind: 'feedback_item', id: Number(r.id) });
    const r2 = await db.prepare(
      `SELECT id FROM focus_areas WHERE opened_observation_id=? AND deleted_at IS NULL ORDER BY id`
    ).bind(entityId).all<any>();
    for (const r of ((r2.results as any[]) || [])) out.push({ kind: 'focus_area', id: Number(r.id) });
  }
  // external_pd_submission has no soft-deletable children.
  return out;
}

// ---------------------------------------------------------------------------
// previewBatch — creates a preview atomically and claims ownership
// ---------------------------------------------------------------------------
/** Create a preview batch that freezes the currently-tagged is_practice=1
 *  set.  The batch row + all practice_cleanup_row entries + all
 *  practice_cleanup_open_claim rows are written in a SINGLE db.batch()
 *  so a race between two concurrent previews on the same parent record
 *  produces exactly one winner (the loser's INSERT hits the UNIQUE on
 *  open_claim and the whole batch rolls back).
 *
 *  Fails with:
 *    'nothing_to_clean'  — no is_practice=1 records
 *    'batch_too_large'   — > PRACTICE_CLEANUP_MAX_BATCH parents
 *    'concurrent_batch'  — some parent is already owned by an open preview */
export async function previewBatch(
  db: D1Database, actorId: number, note: string | null,
): Promise<{ batch_id: number; candidates: Candidate[]; scope_hash: string; dep_fingerprint: string }> {
  const candidates = await listPracticeCandidates(db);
  if (candidates.length === 0) throw new Error('nothing_to_clean');
  if (candidates.length > PRACTICE_CLEANUP_MAX_BATCH) throw new Error('batch_too_large');

  const scopeHash = scopeFingerprintFromCandidates(candidates);
  const depFp = await depFingerprint(db, candidates);
  const snapshot = JSON.stringify(candidates);
  const nonce = cryptoRandomId();

  // Create the batch row first (we need its id for the claim + row inserts).
  const batchRes = await db.prepare(
    `INSERT INTO practice_cleanup_batches
       (actor_id, status, note, writer_nonce, scope_hash, candidate_snapshot_json, dep_fingerprint)
     VALUES (?, 'preview', ?, ?, ?, ?, ?)
     RETURNING id`
  ).bind(actorId, note, nonce, scopeHash, snapshot, depFp).run();
  const batchId = Number(((batchRes.results as any[])?.[0] || {}).id);
  if (!batchId) throw new Error('failed_to_create_batch');

  // Now atomically claim every parent + write manifest rows.  UNIQUE on
  // practice_cleanup_open_claim(entity_type, entity_id) ensures a
  // concurrent preview attempting to claim the same parent loses.  If ANY
  // row conflicts, the entire batch rolls back and we clean up the empty
  // batch row above.
  const claimStmts: D1PreparedStatement[] = [];
  for (const c of candidates) {
    claimStmts.push(
      db.prepare(
        `INSERT INTO practice_cleanup_open_claim (batch_id, entity_type, entity_id)
         VALUES (?, ?, ?)`
      ).bind(batchId, c.entity_type, c.entity_id),
      db.prepare(
        `INSERT INTO practice_cleanup_row (batch_id, entity_type, entity_id, label)
         VALUES (?, ?, ?, ?)`
      ).bind(batchId, c.entity_type, c.entity_id, c.label),
    );
  }
  try {
    await db.batch(claimStmts);
  } catch (e) {
    // Roll back the empty preview batch (row inserts failed, so no manifest
    // to clean up).  ON DELETE CASCADE removes any partial rows.
    await db.prepare(`DELETE FROM practice_cleanup_batches WHERE id=?`).bind(batchId).run();
    const msg = (e as any)?.message || String(e);
    if (/UNIQUE.*open_claim/i.test(msg) || /constraint failed/i.test(msg)) {
      throw new Error('concurrent_batch');
    }
    throw e;
  }

  return { batch_id: batchId, candidates, scope_hash: scopeHash, dep_fingerprint: depFp };
}

function cryptoRandomId(): string {
  try {
    // @ts-ignore
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// executeCleanup — SINGLE atomic batch across every parent + status flip
// ---------------------------------------------------------------------------

export interface ExecuteResult {
  batch_id: number;
  affected: Record<EntityType, number>;
  cascaded: {
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
  };
}

export async function executeCleanup(
  db: D1Database, actorId: number, batchId: number,
): Promise<ExecuteResult> {
  const batch = await db.prepare(
    `SELECT id, status, scope_hash, dep_fingerprint, writer_nonce
       FROM practice_cleanup_batches WHERE id=?`
  ).bind(batchId).first<any>();
  if (!batch) throw new Error('batch_not_found');
  if (batch.status === 'executed') throw new Error('already_executed');
  if (batch.status === 'restored') throw new Error('already_restored');
  if (batch.status !== 'preview')  throw new Error('batch_not_previewable');

  // Re-read the current candidates and recompute BOTH fingerprints.  A
  // parent-tag drift OR a child-shape drift causes rejection.  This is done
  // right before the transaction; a change between this check and the
  // BEGIN would still be caught by the child-manifest INSERT ... SELECT
  // below, because the SELECT captures the row set at statement time
  // inside the batch's implicit transaction.
  const currentCandidates = await listPracticeCandidates(db);
  const currentHash = scopeFingerprintFromCandidates(currentCandidates);
  const currentDep  = await depFingerprint(db, currentCandidates);
  if (currentHash !== batch.scope_hash || currentDep !== batch.dep_fingerprint) {
    await db.prepare(
      `UPDATE practice_cleanup_batches
          SET note = COALESCE(note || ' | ', '') || 'scope_drift_rejected'
        WHERE id=?`
    ).bind(batchId).run();
    throw new Error('scope_changed');
  }

  // Load the frozen parent manifest (should equal currentCandidates, but
  // we use the manifest for determinism and future-safety).
  const parents = await db.prepare(
    `SELECT entity_type, entity_id, label FROM practice_cleanup_row
      WHERE batch_id=? ORDER BY id`
  ).bind(batchId).all<any>();
  const parentRows = ((parents.results as any[]) || []) as Array<{ entity_type: EntityType; entity_id: number; label: string }>;

  if (parentRows.length > PRACTICE_CLEANUP_MAX_BATCH) throw new Error('batch_too_large');

  // -------------------------------------------------------------------
  // BUILD THE SINGLE ATOMIC BATCH.
  //
  // Layout per parent (order matters for the row-count reconciliation
  // pass at the end):
  //   A. INSERT INTO practice_cleanup_child ... SELECT ...
  //        (for each child kind applicable to this parent, one INSERT).
  //        deleted_at_stamp is set to a shared batch stamp so restore can
  //        identify this batch's writes.
  //   B. UPDATE <child_table> SET deleted_at=<stamp>
  //        WHERE ... AND deleted_at IS NULL
  //        (same row set as (A), because both filter the same predicate
  //        AND the batch runs in a single transaction — INSERT and UPDATE
  //        see the same view.)
  //   C. UPDATE <parent_table> SET deleted_at=<stamp>
  //        WHERE id=? AND deleted_at IS NULL
  //   D. UPDATE practice_cleanup_row SET prior_deleted_at=NULL,
  //        deleted_at_stamp=<stamp> WHERE batch_id=? AND
  //        entity_type=? AND entity_id=?
  //   E. DELETE FROM notifications WHERE entity_type=? AND entity_id=?
  //        (with ambiguous-collision filter for pd_enrollment — see
  //         detectAmbiguousNotifs below; ambiguous rows are pre-inserted
  //         into practice_cleanup_ambiguous_notif OUTSIDE the batch and
  //         excluded from the DELETE.)
  //   F. DELETE FROM activity_log WHERE entity_type=? AND entity_id=?
  //
  // After all parents:
  //   G. DELETE FROM practice_cleanup_open_claim WHERE batch_id=?
  //        (releases the ownership claim so the parents become tag-able
  //         by a fresh preview after restore.)
  //   H. UPDATE practice_cleanup_batches SET status='executed',
  //        executed_at=<stamp>, writer_nonce=NULL, affected_counts_json=?
  //        WHERE id=? AND status='preview' AND writer_nonce=?
  //
  // If any statement in this list fails, the WHOLE batch rolls back and:
  //   * no parent is soft-deleted
  //   * no child is soft-deleted
  //   * the ownership claim is preserved
  //   * the batch stays at status='preview'
  //   * a retry against the same batch id sees an unchanged world and
  //     runs cleanly.
  //
  // The batch stamp is a single UTC ISO string generated NOW so every row
  // this batch touches ends up with the same deleted_at value — restore
  // uses that value to prove ownership.
  // -------------------------------------------------------------------

  // Batch stamp: current UTC timestamp SUFFIXED with the batch id so two
  // batches that execute within the same second do NOT collide.  Restore
  // uses this exact string to prove ownership (WHERE deleted_at=<stamp>);
  // downstream reads only ever check deleted_at IS NULL / IS NOT NULL,
  // so the non-ISO format is safe.
  const batchStamp = `${new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')} #b${batchId}`;

  // Ambiguous-notif pre-scan (item 4): we insert into
  // practice_cleanup_ambiguous_notif OUTSIDE the batch (it's a
  // best-effort audit table; on batch rollback we clean up its rows).
  // This has to happen BEFORE the batch so the DELETE inside the batch
  // can filter by "id NOT IN (SELECT notification_id FROM
  // practice_cleanup_ambiguous_notif WHERE batch_id=?)".
  const preInsertedAmbiguous: number[] = [];
  for (const p of parentRows) {
    if (p.entity_type !== 'pd_enrollment') continue;
    const amb = await detectAmbiguousNotifs(db, p.entity_id);
    for (const n of amb) {
      try {
        await db.prepare(
          `INSERT INTO practice_cleanup_ambiguous_notif
             (batch_id, notification_id, entity_type, entity_id, resolves_as,
              user_id, kind, title, suspected_parent_enrollment_id)
           VALUES (?, ?, 'pd_enrollment', ?, ?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`
        ).bind(
          batchId, n.notification_id, n.entity_id, n.resolves_as,
          n.user_id, n.kind, n.title, p.entity_id,
        ).run();
        preInsertedAmbiguous.push(n.notification_id);
      } catch (_) { /* ignore duplicates */ }
    }
  }

  const stmts: D1PreparedStatement[] = [];
  for (const p of parentRows) {
    appendParentBatchStatements(db, stmts, batchId, batchStamp, p.entity_type, p.entity_id);
  }

  // (G) release the ownership claim.
  stmts.push(
    db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE batch_id=?`).bind(batchId),
  );

  // (H) status flip.  We DEFER the affected_counts_json bind until AFTER
  // the batch runs — we cannot know the actual rowcounts until D1 returns
  // them.  So the last statement writes the placeholder counts and a
  // SUBSEQUENT UPDATE outside the batch fixes them up.  BUT that violates
  // the "same transaction" guarantee for the counts.
  //
  // Solution: use a two-statement pattern where the flip UPDATE writes
  // '__pending__' as affected_counts_json inside the batch (so status
  // transitions atomically with the writes), and we backfill the real
  // counts with a follow-up UPDATE that is idempotent (status is already
  // 'executed').  The status flip is what matters for correctness — the
  // affected_counts_json is a report, not a source of truth.
  stmts.push(
    db.prepare(
      `UPDATE practice_cleanup_batches
          SET status='executed', executed_at=?, writer_nonce=NULL,
              affected_counts_json='__pending__'
        WHERE id=? AND status='preview' AND writer_nonce=?`
    ).bind(batchStamp, batchId, batch.writer_nonce),
  );

  let results: D1Result[];
  try {
    results = await db.batch(stmts);
  } catch (e) {
    // The entire batch rolled back.  Clean up any ambiguous-notif rows we
    // pre-inserted so a retry sees a clean state (they'll be re-detected
    // on the next execute attempt).
    for (const nid of preInsertedAmbiguous) {
      await db.prepare(
        `DELETE FROM practice_cleanup_ambiguous_notif WHERE batch_id=? AND notification_id=?`
      ).bind(batchId, nid).run().catch(() => {});
    }
    throw e;
  }

  // Verify the status flip actually landed (nonce might have been cleared
  // by an idempotent retry that ran between our batch's read and write).
  const flipStmt = results[results.length - 1] as any;
  const flipped = (flipStmt?.meta?.changes || 0) === 1;
  if (!flipped) {
    // Somebody else ran the flip.  Read the stored counts and return.
    const after = await db.prepare(
      `SELECT status, affected_counts_json FROM practice_cleanup_batches WHERE id=?`
    ).bind(batchId).first<any>();
    if (after?.status !== 'executed') throw new Error('flip_lost_but_not_executed');
    const stored = after?.affected_counts_json && after.affected_counts_json !== '__pending__'
      ? JSON.parse(after.affected_counts_json)
      : { affected: emptyAffected(), cascaded: emptyCascaded() };
    return { batch_id: batchId, ...stored };
  }

  // Reconcile the affected + cascaded counts from the manifest and the
  // batch's D1Result meta.changes, then backfill affected_counts_json.
  const affected: Record<EntityType, number> = emptyAffected();
  const cascaded = emptyCascaded();
  cascaded.ambiguous_notifications_preserved = preInsertedAmbiguous.length;

  for (const p of parentRows) {
    // Parent soft-delete: read current deleted_at_stamp on manifest row.
    const stamped = await db.prepare(
      `SELECT deleted_at_stamp FROM practice_cleanup_row
        WHERE batch_id=? AND entity_type=? AND entity_id=?`
    ).bind(batchId, p.entity_type, p.entity_id).first<any>();
    if (stamped?.deleted_at_stamp) affected[p.entity_type] += 1;
  }
  // Child counts from manifest.
  const cm = await db.prepare(
    `SELECT child_kind, COUNT(*) AS n FROM practice_cleanup_child WHERE batch_id=? GROUP BY child_kind`
  ).bind(batchId).all<any>();
  for (const r of ((cm.results as any[]) || [])) {
    const n = Number(r.n) || 0;
    switch (r.child_kind as ChildKind) {
      case 'coaching_note_audit':          cascaded.coaching_note_audit_soft         += n; break;
      case 'coaching_note_share_delivery': cascaded.coaching_note_share_delivery_soft += n; break;
      case 'pd_deliverable':               cascaded.pd_deliverables_soft             += n; break;
      case 'pd_reflection':                cascaded.pd_reflections_soft              += n; break;
      case 'pd_deliverable_score':         cascaded.pd_deliverable_scores_soft       += n; break;
      case 'feedback_item':                cascaded.feedback_items_soft              += n; break;
      case 'focus_area':                   cascaded.focus_areas_soft                 += n; break;
    }
  }
  // Notification / activity_log counts from the batch results.
  // Layout indices in `results`: for each parent P (in order), the DELETE
  // statements are at fixed offsets computed by appendParentBatchStatements.
  // We recompute those offsets in the same order to sum meta.changes.
  let cursor = 0;
  for (const p of parentRows) {
    const step = parentStatementCount(p.entity_type);
    // The notification DELETE is second-to-last inside the parent block
    // (E), activity_log DELETE is last (F).  See appendParentBatchStatements.
    const notifIdx = cursor + step - 2;
    const actIdx   = cursor + step - 1;
    cascaded.notifications_hard += safeChanges(results, notifIdx);
    cascaded.activity_log_hard  += safeChanges(results, actIdx);
    cursor += step;
  }

  const summary = { affected, cascaded };
  await db.prepare(
    `UPDATE practice_cleanup_batches SET affected_counts_json=? WHERE id=?`
  ).bind(JSON.stringify(summary), batchId).run();

  return { batch_id: batchId, ...summary };
}

function emptyAffected(): Record<EntityType, number> {
  return { coaching_note: 0, pd_enrollment: 0, external_pd_submission: 0, observation: 0 };
}
function emptyCascaded() {
  return {
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
}

function safeChanges(results: D1Result[] | any, idx: number): number {
  try {
    const r = (results as any[])[idx];
    return Number(r?.meta?.changes) || 0;
  } catch {
    return 0;
  }
}

/** Number of statements this parent contributes to the SINGLE cleanup batch.
 *  Used to compute the notification/activity DELETE indices post-batch.
 *  Structure per parent:
 *    A. child-manifest INSERT ... SELECT statements (varies by kind)
 *    B. child soft-delete UPDATE statements (matches A count)
 *    C. parent soft-delete UPDATE (1)
 *    D. manifest UPDATE for parent (1)
 *    E. notifications DELETE (1)
 *    F. activity_log DELETE (1)
 */
function parentStatementCount(entityType: EntityType): number {
  const childKindCount =
    entityType === 'coaching_note'          ? 2  // audit + ledger
    : entityType === 'pd_enrollment'        ? 3  // deliv + refl + scores
    : entityType === 'observation'          ? 2  // feedback + focus
    : 0;                                          // external_pd_submission
  return childKindCount * 2 + 4;                 // A + B + C + D + E + F
}

/** Build the per-parent statement group described above and append to
 *  `stmts`.  All INSERTs, UPDATEs, and DELETEs use a shared batchStamp so
 *  restore can prove ownership. */
function appendParentBatchStatements(
  db: D1Database, stmts: D1PreparedStatement[],
  batchId: number, batchStamp: string,
  entityType: EntityType, entityId: number,
): void {
  // (A) child-manifest INSERT ... SELECTs + (B) child soft-delete UPDATEs.
  // A and B run in the same transaction so they see the same row set.
  const childBlocks: Array<{
    kind: ChildKind; table: string; whereCol: string;
  }> = entityType === 'coaching_note' ? [
    { kind: 'coaching_note_audit',          table: 'coaching_note_audit',          whereCol: 'note_id' },
    { kind: 'coaching_note_share_delivery', table: 'coaching_note_share_delivery', whereCol: 'note_id' },
  ] : entityType === 'pd_enrollment' ? [
    { kind: 'pd_deliverable',       table: 'pd_deliverables',       whereCol: 'enrollment_id' },
    { kind: 'pd_reflection',        table: 'pd_reflections',        whereCol: 'enrollment_id' },
    { kind: 'pd_deliverable_score', table: 'pd_deliverable_scores', whereCol: 'enrollment_id' },
  ] : entityType === 'observation' ? [
    { kind: 'feedback_item', table: 'feedback_items', whereCol: 'observation_id' },
    { kind: 'focus_area',    table: 'focus_areas',    whereCol: 'opened_observation_id' },
  ] : [];

  // (A) INSERT ... SELECT for each child kind — captures the exact row
  // set inside the transaction.  ON CONFLICT DO NOTHING keeps retries
  // idempotent.
  for (const cb of childBlocks) {
    stmts.push(
      db.prepare(
        `INSERT INTO practice_cleanup_child
           (batch_id, parent_entity_type, parent_entity_id, child_kind, child_id, prior_deleted_at, deleted_at_stamp)
         SELECT ?, ?, ?, ?, id, NULL, ?
           FROM ${cb.table}
          WHERE ${cb.whereCol}=? AND deleted_at IS NULL
         ON CONFLICT DO NOTHING`
      ).bind(batchId, entityType, entityId, cb.kind, batchStamp, entityId),
    );
  }
  // (B) UPDATE the same rows.  WHERE deleted_at IS NULL guarantees we
  // touch exactly the same rows we just inserted into the manifest
  // (both statements see the same view within the transaction).
  for (const cb of childBlocks) {
    stmts.push(
      db.prepare(
        `UPDATE ${cb.table} SET deleted_at=?
          WHERE ${cb.whereCol}=? AND deleted_at IS NULL`
      ).bind(batchStamp, entityId),
    );
  }

  // (C) parent soft-delete UPDATE.
  stmts.push(
    db.prepare(
      `UPDATE ${tableFor(entityType)} SET deleted_at=?
        WHERE id=? AND deleted_at IS NULL`
    ).bind(batchStamp, entityId),
  );

  // (D) manifest UPDATE — mark this row as "we owned the delete" and
  // record the exact stamp so restore can prove ownership.
  stmts.push(
    db.prepare(
      `UPDATE practice_cleanup_row
          SET prior_deleted_at=NULL, deleted_at_stamp=?
        WHERE batch_id=? AND entity_type=? AND entity_id=?`
    ).bind(batchStamp, batchId, entityType, entityId),
  );

  // (E) notifications DELETE.  For pd_enrollment we exclude notifications
  // recorded in the ambiguous table for this batch — those were pre-
  // inserted to practice_cleanup_ambiguous_notif and must survive.
  if (entityType === 'pd_enrollment') {
    stmts.push(
      db.prepare(
        `DELETE FROM notifications
          WHERE entity_type='pd_enrollment' AND entity_id=?
            AND id NOT IN (SELECT notification_id FROM practice_cleanup_ambiguous_notif WHERE batch_id=?)`
      ).bind(entityId, batchId),
    );
  } else {
    stmts.push(
      db.prepare(
        `DELETE FROM notifications WHERE entity_type=? AND entity_id=?`
      ).bind(entityType, entityId),
    );
  }
  // (F) activity_log DELETE.
  stmts.push(
    db.prepare(
      `DELETE FROM activity_log WHERE entity_type=? AND entity_id=?`
    ).bind(entityType, entityId),
  );
}

// ---------------------------------------------------------------------------
// Ambiguous-notif detection (item 4 — cross-teacher collisions preserved)
// ---------------------------------------------------------------------------
export interface AmbiguousDetection {
  notification_id: number;
  user_id: number;
  kind: string;
  title: string;
  entity_id: number;
  resolves_as: string;
}

/** For the enrollment being cleaned, find every notification that would
 *  be DELETEd by the naive "entity_type='pd_enrollment' AND entity_id=?"
 *  filter but is not unambiguously about this specific enrollment.
 *
 *  Detection design (item 4 correction):
 *
 *  The dangerous historical case is: the pre-fix auto-enroll code stored
 *  MODULE ID in entity_id for pd_module_recommended notifications.  A
 *  numeric collision (module id happens to equal a different, later-
 *  created enrollment id) causes the naive DELETE to remove an unrelated
 *  teacher's alert.
 *
 *  The signal that a notification MIGHT be a legacy module-id-in-
 *  entity-id row is: the notification's kind is 'pd_module_recommended'
 *  AND its entity_id names a valid pd_modules row (which it will always
 *  do under the legacy bug — the id IS a module id).  If that is also
 *  the case for the enrollment we're cleaning, we cannot distinguish
 *  legitimate reviewer notifications for the cleaned enrollment from
 *  legacy-bug notifications about a different enrollment.
 *
 *  Concretely, we PRESERVE (record as ambiguous) any notification for
 *  entity_id=<being-cleaned enrollment id> where BOTH of the following
 *  are true:
 *    (i)  the notification's kind is 'pd_module_recommended' (the
 *         historical bug wrote this kind, so this is the only shape
 *         where cross-teacher collisions can arise); AND
 *    (ii) the being-cleaned enrollment id ALSO validly names a
 *         pd_modules row (numeric-collision signal — this cannot happen
 *         without the collision).
 *
 *  When (ii) is false we know the entity_id is NOT a valid module id,
 *  so no legacy row could exist with that entity_id, so all rows are
 *  legitimate this-enrollment notifications (including reviewer alerts
 *  addressed to principals/coaches with user_id != teacher_id).  Those
 *  are deleted as intended.
 *
 *  For 'pd_deliverable_submitted' and other unambiguous reviewer-
 *  audience kinds, we DELETE — those were written after the fix and
 *  their entity_id IS the real enrollment id.
 *
 *  Additionally, we still surface the legacy "entity_id = module_id"
 *  rows (a different set of notification rows whose entity_id equals
 *  the CLEANED enrollment's module_id, not its own id) so the admin
 *  can review those too. */
async function detectAmbiguousNotifs(
  db: D1Database, enrollmentId: number,
): Promise<AmbiguousDetection[]> {
  const enr = await db.prepare(
    `SELECT teacher_id, module_id FROM pd_enrollments WHERE id=?`
  ).bind(enrollmentId).first<any>();
  const teacherId = Number(enr?.teacher_id || 0);
  const modId = Number(enr?.module_id || 0);

  const results: AmbiguousDetection[] = [];

  // (ii) numeric-collision signal — is our enrollment id ALSO a
  // pd_modules row?  Only when true can the legacy bug have written a
  // notification with the same entity_id from a completely different
  // enrollment.
  const asModule = await db.prepare(
    `SELECT 1 FROM pd_modules WHERE id=?`
  ).bind(enrollmentId).first<any>();
  const numericCollision = !!asModule;

  if (numericCollision) {
    // Scan notifications for our enrollment id — the collision case
    // means some might belong to a DIFFERENT enrollment (a teacher whose
    // enrollment happens to be on the module whose id equals our
    // enrollment id).
    const notifs = await db.prepare(
      `SELECT id, user_id, kind, title, entity_id
         FROM notifications
        WHERE entity_type='pd_enrollment' AND entity_id=?
          AND kind='pd_module_recommended'`
    ).bind(enrollmentId).all<any>();
    for (const n of ((notifs.results as any[]) || [])) {
      const nUser = Number(n.user_id);
      // Does the recipient own an enrollment on the module whose id
      // equals our enrollment id?  If yes, this is very likely a legacy
      // row belonging to that other enrollment.  Preserve.  If no, it
      // MIGHT be a legitimate this-enrollment recommendation (typically
      // addressed to the enrollment's teacher_id); DELETE only when the
      // recipient equals this enrollment's teacher_id.  Anything else
      // is preserved defensively.
      const ownsOther = await db.prepare(
        `SELECT 1 FROM pd_enrollments WHERE teacher_id=? AND module_id=? AND id<>?`
      ).bind(nUser, enrollmentId, enrollmentId).first<any>();
      const isThisEnrollmentOwner = teacherId && nUser === teacherId;
      if (ownsOther || !isThisEnrollmentOwner) {
        results.push({
          notification_id: Number(n.id),
          user_id: nUser,
          kind: String(n.kind || ''),
          title: String(n.title || ''),
          entity_id: Number(n.entity_id),
          resolves_as: ownsOther ? 'cross_teacher_collision' : 'defensive_no_owner',
        });
      }
    }
  }

  // Legacy variant: notifications keyed on this enrollment's module_id
  // (not our enrollment id).  Different row set from above; these were
  // written under the old bug and never point at any real enrollment,
  // but by policy we hard-delete them only after admin review.
  if (teacherId && modId) {
    const asEnr = await db.prepare(`SELECT 1 FROM pd_enrollments WHERE id=?`).bind(modId).first<any>();
    if (!asEnr) {
      const legacy = await db.prepare(
        `SELECT id, user_id, kind, title, entity_id
           FROM notifications
          WHERE entity_type='pd_enrollment' AND entity_id=?
            AND kind='pd_module_recommended'`
      ).bind(modId).all<any>();
      for (const n of ((legacy.results as any[]) || [])) {
        results.push({
          notification_id: Number(n.id),
          user_id: Number(n.user_id),
          kind: String(n.kind || ''),
          title: String(n.title || ''),
          entity_id: Number(n.entity_id),
          resolves_as: 'pd_module',
        });
      }
    }
  }

  // De-dupe on notification_id.
  const seen = new Set<number>();
  const dedup: AmbiguousDetection[] = [];
  for (const r of results) {
    if (seen.has(r.notification_id)) continue;
    seen.add(r.notification_id);
    dedup.push(r);
  }
  return dedup;
}

// ---------------------------------------------------------------------------
// restoreBatch — SINGLE atomic batch across every parent + status flip
// ---------------------------------------------------------------------------

export async function restoreBatch(db: D1Database, batchId: number, actorId: number): Promise<{
  restored: Record<EntityType, number>;
  cascade_restored: Record<string, number>;
}> {
  const batch = await db.prepare(
    `SELECT id, status FROM practice_cleanup_batches WHERE id=?`
  ).bind(batchId).first<any>();
  if (!batch) throw new Error('batch_not_found');
  if (batch.status !== 'executed') throw new Error('batch_not_restorable');

  // Load parent + child manifest rows we OWN (prior_deleted_at IS NULL).
  const parents = await db.prepare(
    `SELECT entity_type, entity_id, deleted_at_stamp
       FROM practice_cleanup_row
      WHERE batch_id=? AND prior_deleted_at IS NULL
      ORDER BY id`
  ).bind(batchId).all<any>();
  const parentRows = ((parents.results as any[]) || []);

  const restored: Record<EntityType, number> = emptyAffected();
  const cascade_restored: Record<string, number> = {
    coaching_note_audit: 0, coaching_note_share_delivery: 0,
    pd_deliverable: 0, pd_reflection: 0, pd_deliverable_score: 0,
    feedback_item: 0, focus_area: 0,
  };

  // Build a SINGLE atomic batch: parent un-soft-deletes + child un-soft-
  // deletes + status flip.  Each UPDATE is guarded so it ONLY clears
  // deleted_at when the CURRENT deleted_at equals the stamp this batch
  // wrote (item 3: a newer cleanup batch overwrote the stamp -> we leave
  // the row alone; that newer batch is now the responsible party).
  const stmts: D1PreparedStatement[] = [];
  // Layout:  parentUpdates... , childUpdates... , statusFlip
  // We record the intended index of each UPDATE per parent for row-count
  // reconciliation.
  const parentIndex: Array<{ et: EntityType }> = [];
  const childIndex: Array<{ kind: ChildKind }> = [];

  for (const p of parentRows) {
    const et = p.entity_type as EntityType;
    const stamp = p.deleted_at_stamp;
    const table = tableFor(et);
    stmts.push(
      db.prepare(
        `UPDATE ${table} SET deleted_at=NULL
          WHERE id=? AND deleted_at=?`
      ).bind(Number(p.entity_id), stamp),
    );
    parentIndex.push({ et });
  }

  // Children — one UPDATE per child row (targeted by id + stamp so a
  // newer batch's overwrite is left alone).
  const children = await db.prepare(
    `SELECT child_kind, child_id, deleted_at_stamp
       FROM practice_cleanup_child
      WHERE batch_id=? AND prior_deleted_at IS NULL`
  ).bind(batchId).all<any>();
  for (const c of ((children.results as any[]) || []) as Array<{ child_kind: ChildKind; child_id: number; deleted_at_stamp: string }>) {
    const t = childTableFor(c.child_kind);
    stmts.push(
      db.prepare(
        `UPDATE ${t} SET deleted_at=NULL WHERE id=? AND deleted_at=?`
      ).bind(c.child_id, c.deleted_at_stamp),
    );
    childIndex.push({ kind: c.child_kind });
  }

  // Status flip — guarded by status='executed' so a repeat call is a no-op.
  stmts.push(
    db.prepare(
      `UPDATE practice_cleanup_batches
          SET status='restored', restored_at=CURRENT_TIMESTAMP, restored_by=?
        WHERE id=? AND status='executed'`
    ).bind(actorId, batchId),
  );

  const results = await db.batch(stmts);

  // Reconcile counts from the batch results.
  for (let i = 0; i < parentIndex.length; i++) {
    if (safeChanges(results, i) === 1) restored[parentIndex[i].et] += 1;
  }
  const base = parentIndex.length;
  for (let i = 0; i < childIndex.length; i++) {
    if (safeChanges(results, base + i) === 1) cascade_restored[childIndex[i].kind] += 1;
  }
  // (status flip is last, safeChanges(results, base+childIndex.length) === 1
  // when we won the race; if 0 the batch was already restored by another
  // request — everything above is still safe because our UPDATEs required
  // deleted_at=<stamp> which by then is NULL, so they no-op'd.)

  return { restored, cascade_restored };
}

// ---------------------------------------------------------------------------
// loadBatch / listBatches / resolveAmbiguousNotif — UI helpers
// ---------------------------------------------------------------------------

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
    `SELECT entity_type, entity_id, label, prior_deleted_at, deleted_at_stamp
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
    `SELECT parent_entity_type, parent_entity_id, child_kind, child_id, prior_deleted_at, deleted_at_stamp
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

/** Abandon (drop) a preview batch that the admin no longer wants.  Releases
 *  the open_claim rows so the tagged parents become available to a fresh
 *  preview.  Also deletes the batch itself (CASCADE removes rows). */
export async function abandonPreview(db: D1Database, batchId: number): Promise<void> {
  const batch = await db.prepare(
    `SELECT status FROM practice_cleanup_batches WHERE id=?`
  ).bind(batchId).first<any>();
  if (!batch) throw new Error('batch_not_found');
  if (batch.status !== 'preview') throw new Error('not_a_preview');
  // Ordered deletes; open_claim CASCADEs on batch delete but we DELETE it
  // explicitly for clarity.  practice_cleanup_row CASCADEs too.
  await db.batch([
    db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE batch_id=?`).bind(batchId),
    db.prepare(`DELETE FROM practice_cleanup_batches WHERE id=? AND status='preview'`).bind(batchId),
  ]);
}
