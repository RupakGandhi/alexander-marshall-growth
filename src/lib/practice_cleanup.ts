// ============================================================================
// practice_cleanup.ts — Practice-data cleanup workflow (super-admin only)
// ----------------------------------------------------------------------------
// Sixth-round correction (Sept 24, 2026 — item 1): the execution_lock
// row is now RETAINED through restoration.  A delayed duplicate of the
// ORIGINAL execute request (paused before its db.batch() ran) could
// otherwise wake up after restore completes, acquire a fresh lock, and
// re-soft-delete the just-restored records.
//
// Two mechanisms close this window (belt-and-suspenders):
//   (a) restoreBatch NO LONGER deletes practice_cleanup_execution_lock.
//       A restored batch is terminal — it will never re-execute — so
//       keeping the lock in place is harmless and a delayed duplicate's
//       PRIMARY KEY INSERT is rejected.
//   (b) Every mutation in appendParentBatchStatements AND the conditional
//       lock INSERT itself carry
//         AND EXISTS (SELECT 1 FROM practice_cleanup_batches
//                      WHERE id=? AND status='preview' AND writer_nonce=?)
//       — a transaction-level status guard.  Even if a delayed request
//       somehow acquired a lock, every write in its batch would touch
//       0 rows because the batch's status is no longer 'preview' and
//       its writer_nonce has been cleared by the winner's status flip.
//
// A fresh preview (against re-tagged records after restore) receives a
// NEW batch_id, which has its OWN execution_lock slot — the old batch's
// retained lock does not block it.
//
// Fourth-round rewrite (Sept 24, 2026 late) — migration 0018 corrects
// three remaining defects on top of the 0015/0016/0017 work.  Design:
//
//   * WINNING-EXECUTION CLAIM (0018 item 1).  The FIRST statement in
//     executeCleanup's db.batch() is INSERT INTO practice_cleanup_
//     execution_lock (batch_id) VALUES (?).  PRIMARY KEY(batch_id)
//     rejects a duplicate concurrent execute; SQLite aborts the entire
//     batch, and no manifest/parent/child state is mutated by the
//     loser.  This closes the window where two overlapping executes
//     both ran and the second overwrote the manifest stamp.  Manifest
//     stamp UPDATE also carries "AND deleted_at_stamp IS NULL" as
//     defense in depth.
//
//   * EXACT-SCOPE ENFORCEMENT INSIDE THE TRANSACTION (0018 item 2).
//     Child rows AND notification/activity_log ids are captured into
//     dedicated manifest tables at PREVIEW time.  Execute's batch does
//     "UPDATE ... WHERE id IN (SELECT child_id FROM
//     practice_cleanup_child WHERE batch_id=? AND child_kind=?)" and
//     "DELETE FROM notifications WHERE id IN (SELECT scope_id FROM
//     practice_cleanup_notif_scope WHERE batch_id=? AND
//     scope_kind='notification')".  Anything added between preview
//     and execute is NOT in these frozen sets, so it survives —
//     late-added dependents cannot be silently deleted.
//
//   * DURABLE COUNTS (0018 item 3).  executeCleanup's post-batch counts
//     backfill runs in its own try/catch — a failure to write the
//     summary does NOT throw (the cleanup already committed).  loadBatch
//     recognises the '__pending__' sentinel and recomputes the summary
//     from the manifest, then self-heals by writing the recomputed
//     summary back.  The results page always has usable numbers and
//     the restore controls stay reachable.
//
// Preserved from earlier rounds:
//
//   * SINGLE-BATCH ATOMICITY (0017 item 1).  One db.batch() spans every
//     parent's cascade plus the status flip.  A failure at any single
//     statement rolls back every write.
//
//   * CONCURRENT-PREVIEW GUARD (0017 item 3).  practice_cleanup_open_claim
//     UNIQUE(entity_type, entity_id) prevents two previews from
//     claiming the same parent.
//
//   * PER-BATCH DELETE STAMPS (0017 item 3).  practice_cleanup_row.
//     deleted_at_stamp = 'YYYY-MM-DD HH:MM:SS #b<batch_id>' is unique
//     per batch even within the same second.  Restore only clears
//     deleted_at where the current value equals this batch's stamp.
//
//   * AMBIGUOUS-NOTIF PRESERVATION (0017 item 4).  Cross-teacher
//     collisions and legacy pd_module-in-entity_id patterns are
//     recorded in practice_cleanup_ambiguous_notif for admin review
//     instead of hard-deleted.
//
//   * BATCH SIZE CAP.  previewBatch refuses > PRACTICE_CLEANUP_MAX_BATCH
//     candidate parents.
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

// (Old depFingerprint / gatherChildIds helpers removed in 0018 — the
// dep_fingerprint is now computed from the frozen scope by
// depFingerprintFromFrozenScope() and a live-vs-frozen comparison uses
// currentDepFingerprint() defined below.  Preview uses
// gatherChildIdsWithPrior() to also capture prior_deleted_at.)

// ---------------------------------------------------------------------------
// previewBatch — freeze scope + all dependent ids atomically
// ---------------------------------------------------------------------------
/** Create a preview batch that freezes the currently-tagged is_practice=1
 *  set AND EVERY dependent record subject to deletion:
 *
 *    * practice_cleanup_row      — one row per parent, with label
 *    * practice_cleanup_open_claim — mutual-exclusion vs concurrent previews
 *    * practice_cleanup_child    — one row per child (audit, ledger,
 *                                   deliverable, reflection, score,
 *                                   feedback_item, focus_area) that is
 *                                   CURRENTLY deleted_at IS NULL
 *    * practice_cleanup_notif_scope — one row per notification and
 *                                     activity_log row currently keyed
 *                                     at this parent (with the ambiguous-
 *                                     notif exclusion applied at preview
 *                                     time so admins see the exact final
 *                                     delete set)
 *
 *  All writes happen in ONE db.batch() so a race between two concurrent
 *  previews on the same parent (open_claim UNIQUE) or a race between
 *  preview and any other write produces exactly one winner.
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

  // Gather EVERY dependent id per parent — children AND notifications AND
  // activity_log rows.  These become the frozen scope.
  const perParentChildren: Array<{ parent: Candidate; kids: Array<{ kind: ChildKind; id: number; prior_deleted_at: string | null }> }> = [];
  const perParentNotifScope: Array<{ parent: Candidate; kind: 'notification' | 'activity_log'; id: number }[]> = [];
  const perParentAmbiguous: Array<{ parent: Candidate; amb: AmbiguousDetection[] }> = [];

  for (const c of candidates) {
    // Children (soft-delete cascade dependents).  Capture the CURRENT
    // deleted_at value so restore's per-child ownership check works.
    const kids = await gatherChildIdsWithPrior(db, c.entity_type, c.entity_id);
    perParentChildren.push({ parent: c, kids });

    // Ambiguous-notif detection is preview-time (item 4 correction from
    // 0017).  Store them for the manifest insert AND to exclude from
    // notif_scope below.
    const amb = c.entity_type === 'pd_enrollment'
      ? await detectAmbiguousNotifs(db, c.entity_id)
      : [];
    perParentAmbiguous.push({ parent: c, amb });
    const ambIds = new Set(amb.map(a => a.notification_id));

    // Notifications the batch will DELETE (i.e., all notifications keyed
    // at this parent EXCEPT the ambiguous ones which are preserved).
    const notifs = await db.prepare(
      `SELECT id FROM notifications WHERE entity_type=? AND entity_id=? ORDER BY id`
    ).bind(c.entity_type, c.entity_id).all<any>();
    const notifIds = ((notifs.results as any[]) || [])
      .map(r => Number(r.id))
      .filter(id => !ambIds.has(id));
    // Activity_log the batch will DELETE.
    const activity = await db.prepare(
      `SELECT id FROM activity_log WHERE entity_type=? AND entity_id=? ORDER BY id`
    ).bind(c.entity_type, c.entity_id).all<any>();
    const actIds = ((activity.results as any[]) || []).map(r => Number(r.id));

    const list: { parent: Candidate; kind: 'notification' | 'activity_log'; id: number }[] = [];
    for (const nid of notifIds)  list.push({ parent: c, kind: 'notification', id: nid });
    for (const aid of actIds)    list.push({ parent: c, kind: 'activity_log', id: aid });
    perParentNotifScope.push(list);
  }

  const scopeHash = scopeFingerprintFromCandidates(candidates);
  // dep_fingerprint now incorporates ALL frozen dependent ids so drift
  // shows notification/activity_log additions too.
  const depFp = depFingerprintFromFrozenScope(candidates, perParentChildren, perParentNotifScope);
  const snapshot = JSON.stringify(candidates);
  const nonce = cryptoRandomId();

  // Create the batch row first (we need its id for the manifest inserts).
  const batchRes = await db.prepare(
    `INSERT INTO practice_cleanup_batches
       (actor_id, status, note, writer_nonce, scope_hash, candidate_snapshot_json, dep_fingerprint)
     VALUES (?, 'preview', ?, ?, ?, ?, ?)
     RETURNING id`
  ).bind(actorId, note, nonce, scopeHash, snapshot, depFp).run();
  const batchId = Number(((batchRes.results as any[])?.[0] || {}).id);
  if (!batchId) throw new Error('failed_to_create_batch');

  // Assemble the entire freeze in a single db.batch().  open_claim's
  // UNIQUE(entity_type, entity_id) enforces mutual exclusion vs other
  // open previews.  practice_cleanup_child's UNIQUE(batch_id, child_kind,
  // child_id) keeps the manifest insert idempotent.  practice_cleanup_
  // notif_scope's UNIQUE(batch_id, scope_kind, scope_id) does the same
  // for notifications/activity_log ids.
  const stmts: D1PreparedStatement[] = [];
  for (const c of candidates) {
    stmts.push(
      db.prepare(
        `INSERT INTO practice_cleanup_open_claim (batch_id, entity_type, entity_id) VALUES (?, ?, ?)`
      ).bind(batchId, c.entity_type, c.entity_id),
      db.prepare(
        `INSERT INTO practice_cleanup_row (batch_id, entity_type, entity_id, label) VALUES (?, ?, ?, ?)`
      ).bind(batchId, c.entity_type, c.entity_id, c.label),
    );
  }
  for (const grp of perParentChildren) {
    for (const k of grp.kids) {
      stmts.push(
        db.prepare(
          `INSERT INTO practice_cleanup_child
             (batch_id, parent_entity_type, parent_entity_id, child_kind, child_id, prior_deleted_at, deleted_at_stamp)
           VALUES (?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT DO NOTHING`
        ).bind(batchId, grp.parent.entity_type, grp.parent.entity_id, k.kind, k.id, k.prior_deleted_at),
      );
    }
  }
  for (const grp of perParentNotifScope) {
    for (const s of grp) {
      stmts.push(
        db.prepare(
          `INSERT INTO practice_cleanup_notif_scope
             (batch_id, parent_entity_type, parent_entity_id, scope_kind, scope_id, action)
           VALUES (?, ?, ?, ?, ?, 'delete')
           ON CONFLICT DO NOTHING`
        ).bind(batchId, s.parent.entity_type, s.parent.entity_id, s.kind, s.id),
      );
    }
  }
  // Ambiguous notifications: recorded here at PREVIEW time so the admin
  // sees them on the confirm screen (not only after execute).  ON CONFLICT
  // keeps it idempotent.
  for (const grp of perParentAmbiguous) {
    for (const n of grp.amb) {
      stmts.push(
        db.prepare(
          `INSERT INTO practice_cleanup_ambiguous_notif
             (batch_id, notification_id, entity_type, entity_id, resolves_as,
              user_id, kind, title, suspected_parent_enrollment_id)
           VALUES (?, ?, 'pd_enrollment', ?, ?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`
        ).bind(batchId, n.notification_id, n.entity_id, n.resolves_as, n.user_id, n.kind, n.title, grp.parent.entity_id),
      );
    }
  }

  try {
    await db.batch(stmts);
  } catch (e) {
    await db.prepare(`DELETE FROM practice_cleanup_batches WHERE id=?`).bind(batchId).run();
    const msg = (e as any)?.message || String(e);
    if (/UNIQUE.*open_claim/i.test(msg) || /constraint failed/i.test(msg)) {
      throw new Error('concurrent_batch');
    }
    throw e;
  }

  return { batch_id: batchId, candidates, scope_hash: scopeHash, dep_fingerprint: depFp };
}

/** Deterministic short string over CANDIDATES + their FROZEN dependent
 *  scope (children + notifications + activity_log ids).  A parent-only
 *  fingerprint (scope_hash) is not enough — a child added after preview
 *  would go undetected by scope_hash but is caught here. */
function depFingerprintFromFrozenScope(
  candidates: Candidate[],
  perParentChildren: Array<{ parent: Candidate; kids: Array<{ kind: ChildKind; id: number; prior_deleted_at: string | null }> }>,
  perParentNotifScope: Array<{ parent: Candidate; kind: 'notification' | 'activity_log'; id: number }[]>,
): string {
  const parts: string[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const kids = perParentChildren[i]?.kids || [];
    const scope = perParentNotifScope[i] || [];
    const byKind: Record<string, number[]> = {};
    for (const k of kids) (byKind[k.kind] ||= []).push(k.id);
    const kindKeys = Object.keys(byKind).sort();
    const shape = kindKeys.map(kk => `${kk}=[${byKind[kk].slice().sort((a, b) => a - b).join(',')}]`).join(';');
    const notifIds = scope.filter(s => s.kind === 'notification').map(s => s.id).sort((a, b) => a - b);
    const actIds   = scope.filter(s => s.kind === 'activity_log').map(s => s.id).sort((a, b) => a - b);
    parts.push(`${c.entity_type}#${c.entity_id}{${shape};n=[${notifIds.join(',')}];a=[${actIds.join(',')}]}`);
  }
  return parts.join('|');
}

/** Read children with their current deleted_at (should always be NULL at
 *  preview time — listPracticeCandidates only surfaces parents that are
 *  themselves deleted_at IS NULL, and normally their children are too).
 *  Prior_deleted_at is captured for use by restore ownership check. */
async function gatherChildIdsWithPrior(
  db: D1Database, entityType: EntityType, entityId: number,
): Promise<Array<{ kind: ChildKind; id: number; prior_deleted_at: string | null }>> {
  const out: Array<{ kind: ChildKind; id: number; prior_deleted_at: string | null }> = [];
  const spec: Array<{ kind: ChildKind; table: string; col: string }> =
      entityType === 'coaching_note'          ? [
        { kind: 'coaching_note_audit',          table: 'coaching_note_audit',          col: 'note_id' },
        { kind: 'coaching_note_share_delivery', table: 'coaching_note_share_delivery', col: 'note_id' },
      ]
    : entityType === 'pd_enrollment'          ? [
        { kind: 'pd_deliverable',       table: 'pd_deliverables',       col: 'enrollment_id' },
        { kind: 'pd_reflection',        table: 'pd_reflections',        col: 'enrollment_id' },
        { kind: 'pd_deliverable_score', table: 'pd_deliverable_scores', col: 'enrollment_id' },
      ]
    : entityType === 'observation'            ? [
        { kind: 'feedback_item', table: 'feedback_items', col: 'observation_id' },
        { kind: 'focus_area',    table: 'focus_areas',    col: 'opened_observation_id' },
      ]
    : [];
  for (const s of spec) {
    // Only rows currently NOT soft-deleted — those are the ones this
    // batch will soft-delete.  Rows already soft-deleted by a prior
    // batch are intentionally NOT in this batch's frozen scope.
    const r = await db.prepare(
      `SELECT id, deleted_at FROM ${s.table} WHERE ${s.col}=? AND deleted_at IS NULL ORDER BY id`
    ).bind(entityId).all<any>();
    for (const row of ((r.results as any[]) || [])) {
      out.push({ kind: s.kind, id: Number(row.id), prior_deleted_at: row.deleted_at ?? null });
    }
  }
  return out;
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

  // Pre-batch fingerprint check — a friendly early rejection.  Even if
  // this passes, the frozen-scope enforcement below (deletion targets
  // read from practice_cleanup_child / practice_cleanup_notif_scope,
  // populated at preview time) is what actually restricts the write set.
  // A concurrent write after this check but before db.batch() cannot
  // cause an unreviewed row to be deleted, because the batch does NOT
  // consult live tables to pick its DELETE targets.
  const currentCandidates = await listPracticeCandidates(db);
  const currentHash = scopeFingerprintFromCandidates(currentCandidates);
  // For dep drift we recompute from the CURRENT snapshot of children +
  // notifications + activity_log — this is a superset check (the frozen
  // scope in the manifest is authoritative for what actually gets
  // deleted; this early check is just a nicer error message).
  const currentDep  = await currentDepFingerprint(db, currentCandidates);
  if (currentHash !== batch.scope_hash || currentDep !== batch.dep_fingerprint) {
    await db.prepare(
      `UPDATE practice_cleanup_batches
          SET note = COALESCE(note || ' | ', '') || 'scope_drift_rejected'
        WHERE id=?`
    ).bind(batchId).run();
    throw new Error('scope_changed');
  }

  // Load the frozen parent manifest.
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

  // Batch stamp: unique per batch even within the same second.
  const batchStamp = `${new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')} #b${batchId}`;

  // ---------------------------------------------------------------------
  // BUILD THE SINGLE ATOMIC BATCH.
  //
  //   0. INSERT INTO practice_cleanup_execution_lock (batch_id) VALUES (?)
  //      — PRIMARY KEY guards against overlapping executes.  A duplicate
  //      hits the constraint and the entire batch rolls back, so no
  //      manifest/parent/child state is mutated by the loser.
  //
  //   For each parent P (in order):
  //     A. UPDATE <child_table> SET deleted_at=<stamp>
  //         WHERE id IN (SELECT child_id FROM practice_cleanup_child
  //                       WHERE batch_id=? AND child_kind=?)
  //           AND deleted_at IS NULL
  //         — restricted to the FROZEN scope (the manifest was populated
  //         at preview time).  A late-added child is NOT here.
  //     B. UPDATE parent SET deleted_at=<stamp>
  //         WHERE id=? AND deleted_at IS NULL
  //     C. UPDATE practice_cleanup_row
  //         SET prior_deleted_at=NULL, deleted_at_stamp=<stamp>
  //        WHERE batch_id=? AND entity_type=? AND entity_id=?
  //          AND deleted_at_stamp IS NULL          -- one-winner guard
  //     D. UPDATE practice_cleanup_child
  //         SET deleted_at_stamp=<stamp>
  //        WHERE batch_id=? AND parent_entity_type=? AND parent_entity_id=?
  //          AND deleted_at_stamp IS NULL          -- one-winner guard
  //     E. DELETE FROM notifications
  //         WHERE id IN (SELECT scope_id FROM practice_cleanup_notif_scope
  //                       WHERE batch_id=? AND scope_kind='notification'
  //                         AND parent_entity_type=? AND parent_entity_id=?)
  //         — restricted to the FROZEN scope; late-added notifs survive.
  //     F. DELETE FROM activity_log … same pattern with scope_kind=
  //        'activity_log'.
  //
  //   Z1. DELETE FROM practice_cleanup_open_claim WHERE batch_id=?
  //   Z2. UPDATE practice_cleanup_batches SET status='executed',
  //         executed_at=?, writer_nonce=NULL,
  //         affected_counts_json='__pending__'
  //       WHERE id=? AND status='preview' AND writer_nonce=?
  //
  // If ANY statement fails, D1 rolls back the entire batch: no parent
  // deleted, no child deleted, no manifest stamp written, batch stays
  // at 'preview', execution_lock row not committed → a subsequent retry
  // (or a losing concurrent request) can proceed cleanly.
  // ---------------------------------------------------------------------

  const stmts: D1PreparedStatement[] = [];

  // (0) One-winner claim — conditional on the batch STILL being in
  // preview state with our writer_nonce.  A delayed duplicate whose
  // batch has since executed + restored would see status='restored' and
  // writer_nonce=NULL — the SELECT returns 0 rows, so the INSERT is a
  // no-op.  This alone doesn't abort the batch (SQLite doesn't fail on
  // 0-row inserts), so every subsequent mutation ALSO carries an EXISTS
  // guard (see appendParentBatchStatements) that makes each write
  // no-op when the batch has moved.  The two mechanisms are belt-and-
  // suspenders: even if a delayed request acquires the lock somehow,
  // its mutations still no-op; and even if the EXISTS guards were
  // somehow bypassed, the lock's PRIMARY KEY prevents two live executes
  // from co-existing.
  stmts.push(
    db.prepare(
      `INSERT INTO practice_cleanup_execution_lock (batch_id)
       SELECT id FROM practice_cleanup_batches
        WHERE id=? AND status='preview' AND writer_nonce=?`
    ).bind(batchId, batch.writer_nonce),
  );

  for (const p of parentRows) {
    appendParentBatchStatements(db, stmts, batchId, batch.writer_nonce, batchStamp, p.entity_type, p.entity_id);
  }

  // (Z1) release the preview ownership claim.
  stmts.push(
    db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE batch_id=?`).bind(batchId),
  );
  // (Z2) status flip — placeholder for counts (backfilled below).
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
    const msg = (e as any)?.message || String(e);
    // If the first-statement lock INSERT failed with PRIMARY KEY /
    // UNIQUE violation, another concurrent execute is either running
    // or already ran.  Translate to a clear error so callers can
    // read the winner's committed state instead of re-running.
    if (/UNIQUE|PRIMARY KEY|constraint failed/i.test(msg) && /execution_lock/i.test(msg)) {
      // If the winner has already finished, return its stored summary
      // (loadBatch handles the '__pending__' recompute).
      const after = await db.prepare(
        `SELECT status FROM practice_cleanup_batches WHERE id=?`
      ).bind(batchId).first<any>();
      if (after?.status === 'executed' || after?.status === 'restored') {
        const loaded = await loadBatch(db, batchId);
        const stored = loaded?.batch?.affected_counts_json && loaded.batch.affected_counts_json !== '__pending__'
          ? JSON.parse(loaded.batch.affected_counts_json)
          : summarizeFromManifest(loaded);
        return { batch_id: batchId, ...stored };
      }
      // Winner is still mid-flight (or the row is otherwise weird);
      // surface a clear error so the caller doesn't retry blindly.
      throw new Error('concurrent_execute');
    }
    // Any other error — the batch rolled back completely, so preview
    // state is intact and the caller can retry.
    throw e;
  }

  // The batch committed.  Reconcile counts from the manifest and the
  // batch's D1Result meta.changes.  A failure in this best-effort
  // reporting pass MUST NOT re-throw — the cleanup already happened
  // and calling code must be able to redirect the admin to the results
  // page.  loadBatch handles '__pending__' by recomputing on read.
  const affected: Record<EntityType, number> = emptyAffected();
  const cascaded = emptyCascaded();

  try {
    // Ambiguous count: rows for this batch (populated at preview time).
    const ambCount = await db.prepare(
      `SELECT COUNT(*) AS n FROM practice_cleanup_ambiguous_notif WHERE batch_id=?`
    ).bind(batchId).first<any>();
    cascaded.ambiguous_notifications_preserved = Number(ambCount?.n) || 0;

    // Parents: count manifest rows whose deleted_at_stamp equals our stamp
    // (we won the one-winner guard for them).
    const parentStamps = await db.prepare(
      `SELECT entity_type, COUNT(*) AS n
         FROM practice_cleanup_row
        WHERE batch_id=? AND deleted_at_stamp=?
        GROUP BY entity_type`
    ).bind(batchId, batchStamp).all<any>();
    for (const r of ((parentStamps.results as any[]) || [])) {
      const et = r.entity_type as EntityType;
      if (et in affected) affected[et] += Number(r.n) || 0;
    }
    // Children: same idea.
    const cm = await db.prepare(
      `SELECT child_kind, COUNT(*) AS n FROM practice_cleanup_child
        WHERE batch_id=? AND deleted_at_stamp=?
        GROUP BY child_kind`
    ).bind(batchId, batchStamp).all<any>();
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
    // Notifications / activity_log: sum meta.changes from the batch
    // results.  Layout: statement 0 = lock INSERT, then per parent 8
    // statements (A×3 padded, B, C, D, E, F), then Z1 + Z2.
    // Per-parent block indices (relative to cursor):
    //   0,1,2 = child UPDATEs (padded with SELECT-noop when parent has
    //           fewer than 3 child_tables), 3 = parent, 4 = row stamp,
    //           5 = child stamp, 6 = notif DELETE, 7 = activity DELETE.
    const PER_PARENT_STMTS = 8;
    let cursor = 1; // skip the lock INSERT
    for (const p of parentRows) {
      const notifIdx = cursor + 6;
      const actIdx   = cursor + 7;
      cascaded.notifications_hard += safeChanges(results, notifIdx);
      cascaded.activity_log_hard  += safeChanges(results, actIdx);
      cursor += PER_PARENT_STMTS;
    }

    // Backfill the summary.  If this UPDATE fails, we still return the
    // computed summary and loadBatch will recompute + self-heal on read.
    const summary = { affected, cascaded };
    try {
      await db.prepare(
        `UPDATE practice_cleanup_batches SET affected_counts_json=? WHERE id=?`
      ).bind(JSON.stringify(summary), batchId).run();
    } catch (backfillErr) {
      // Do NOT throw.  Cleanup committed; the results page uses
      // loadBatch which self-heals on read.
      console.warn('practice_cleanup: counts backfill failed (self-heal on read)', {
        batchId, err: (backfillErr as any)?.message || backfillErr,
      });
    }
    return { batch_id: batchId, ...summary };
  } catch (reportErr) {
    // Even the manifest reads failed.  The cleanup is committed; return
    // zero counts and let loadBatch self-heal on the next page render.
    console.warn('practice_cleanup: post-batch reporting failed (self-heal on read)', {
      batchId, err: (reportErr as any)?.message || reportErr,
    });
    return { batch_id: batchId, affected, cascaded };
  }
}

/** Recompute the affected+cascaded summary from the manifest tables.
 *  Used by loadBatch to self-heal a batch with affected_counts_json =
 *  '__pending__' (or missing / malformed).  Also used by the concurrent-
 *  execute fallback path. */
function summarizeFromManifest(loaded: any): { affected: Record<EntityType, number>; cascaded: any } {
  const affected: Record<EntityType, number> = emptyAffected();
  const cascaded = emptyCascaded();
  if (!loaded) return { affected, cascaded };
  for (const r of (loaded.rows || [])) {
    if (r.deleted_at_stamp) {
      const et = r.entity_type as EntityType;
      if (et in affected) affected[et] += 1;
    }
  }
  for (const c of (loaded.children || [])) {
    if (!c.deleted_at_stamp) continue;
    switch (c.child_kind as ChildKind) {
      case 'coaching_note_audit':          cascaded.coaching_note_audit_soft         += 1; break;
      case 'coaching_note_share_delivery': cascaded.coaching_note_share_delivery_soft += 1; break;
      case 'pd_deliverable':               cascaded.pd_deliverables_soft             += 1; break;
      case 'pd_reflection':                cascaded.pd_reflections_soft              += 1; break;
      case 'pd_deliverable_score':         cascaded.pd_deliverable_scores_soft       += 1; break;
      case 'feedback_item':                cascaded.feedback_items_soft              += 1; break;
      case 'focus_area':                   cascaded.focus_areas_soft                 += 1; break;
    }
  }
  // For notifications / activity_log we count scope entries as an
  // upper bound (the actual delete count equals the scope count
  // whenever the batch executed successfully — which is true here
  // because loadBatch is only called for status='executed'/'restored').
  cascaded.notifications_hard = (loaded.notif_scope || []).filter((s: any) => s.scope_kind === 'notification').length;
  cascaded.activity_log_hard  = (loaded.notif_scope || []).filter((s: any) => s.scope_kind === 'activity_log').length;
  cascaded.ambiguous_notifications_preserved = (loaded.ambiguous_notifs || []).length;
  return { affected, cascaded };
}

/** Current-state dep fingerprint helper used by executeCleanup's early
 *  drift check.  Same shape as depFingerprintFromFrozenScope but reads
 *  the live tables (children, notifications, activity_log) instead of
 *  the frozen manifest — so a drift is visible to the caller for a
 *  helpful error message. */
async function currentDepFingerprint(db: D1Database, cands: Candidate[]): Promise<string> {
  const perParentChildren = [];
  const perParentNotifScope = [];
  for (const c of cands) {
    const kids = await gatherChildIdsWithPrior(db, c.entity_type, c.entity_id);
    perParentChildren.push({ parent: c, kids });
    const ambIds = new Set(
      c.entity_type === 'pd_enrollment'
        ? (await detectAmbiguousNotifs(db, c.entity_id)).map(a => a.notification_id)
        : []
    );
    const notifs = await db.prepare(
      `SELECT id FROM notifications WHERE entity_type=? AND entity_id=? ORDER BY id`
    ).bind(c.entity_type, c.entity_id).all<any>();
    const activity = await db.prepare(
      `SELECT id FROM activity_log WHERE entity_type=? AND entity_id=? ORDER BY id`
    ).bind(c.entity_type, c.entity_id).all<any>();
    const list: { parent: Candidate; kind: 'notification' | 'activity_log'; id: number }[] = [];
    for (const r of ((notifs.results as any[]) || [])) {
      const id = Number(r.id);
      if (!ambIds.has(id)) list.push({ parent: c, kind: 'notification', id });
    }
    for (const r of ((activity.results as any[]) || [])) {
      list.push({ parent: c, kind: 'activity_log', id: Number(r.id) });
    }
    perParentNotifScope.push(list);
  }
  return depFingerprintFromFrozenScope(cands, perParentChildren, perParentNotifScope);
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

/** Per-parent block count in the execute batch is FIXED at 8:
 *    A×3. children soft-delete UPDATEs (one per child_table, PADDED
 *         with SELECT-no-op fillers so every parent contributes the
 *         same number of statements — simplifies index math)
 *    B.   parent soft-delete (1)
 *    C.   row-manifest stamp (1)
 *    D.   child-manifest stamp (1)
 *    E.   notifications DELETE (1, ids from notif_scope)
 *    F.   activity_log DELETE  (1, ids from notif_scope)
 *  The batch also has: statement 0 = execution_lock INSERT, then Z1 =
 *  open_claim DELETE, Z2 = status flip.  Total = 1 + 8*parents + 2.
 *
 *  DELAYED-DUPLICATE DEFENCE (Sept 24, 2026 — sixth review, item 1).
 *  Every mutation (A, B, C, D, E, F) carries an additional AND EXISTS
 *  (SELECT 1 FROM practice_cleanup_batches WHERE id=<batch> AND
 *   status='preview' AND writer_nonce=<nonce>) clause.  If a delayed
 *  duplicate execute of the ORIGINAL request wakes up AFTER the
 *  batch has already been executed (and possibly restored), the batch
 *  row's status is no longer 'preview' and its writer_nonce is NULL;
 *  every mutation's EXISTS check fails, every UPDATE/DELETE affects
 *  0 rows, and the delayed batch commits nothing.  Belt-and-suspenders:
 *  the execution_lock also guards against a second live execute
 *  acquiring the batch.
 */
function appendParentBatchStatements(
  db: D1Database, stmts: D1PreparedStatement[],
  batchId: number, writerNonce: string,
  batchStamp: string,
  entityType: EntityType, entityId: number,
): void {
  // Transaction-level status guard, used as an AND EXISTS clause on every
  // mutation below.  Bound with (batchId, writerNonce) at each usage.
  const STATUS_GUARD = `EXISTS (
    SELECT 1 FROM practice_cleanup_batches
     WHERE id=? AND status='preview' AND writer_nonce=?
  )`;
  // (A) Soft-delete children restricted to the FROZEN scope.  A single
  // UPDATE per parent handles all child kinds because we filter by
  // "id IN (SELECT child_id FROM practice_cleanup_child WHERE
  // batch_id=? AND parent_entity_type=? AND parent_entity_id=? AND
  // child_kind IN (kinds for this parent))" applied to each table
  // separately.  We keep one UPDATE statement per child_table so the
  // meta.changes readback attributes correctly.  But since the counts
  // are recomputed from the manifest tables post-batch, we can fold
  // ALL child tables into a single "UPDATE ... WHERE id IN (…)" per
  // table.  Loop over the tables and emit one UPDATE per table.
  const spec: Array<{ kind: ChildKind; table: string }> =
      entityType === 'coaching_note' ? [
        { kind: 'coaching_note_audit',          table: 'coaching_note_audit' },
        { kind: 'coaching_note_share_delivery', table: 'coaching_note_share_delivery' },
      ]
    : entityType === 'pd_enrollment' ? [
        { kind: 'pd_deliverable',       table: 'pd_deliverables' },
        { kind: 'pd_reflection',        table: 'pd_reflections' },
        { kind: 'pd_deliverable_score', table: 'pd_deliverable_scores' },
      ]
    : entityType === 'observation' ? [
        { kind: 'feedback_item', table: 'feedback_items' },
        { kind: 'focus_area',    table: 'focus_areas' },
      ]
    : [];

  // We emit ONE consolidated child UPDATE per parent — that filters
  // ALL the parent's child rows across every relevant child_table by
  // the manifest ids.  Since a table can only be referenced by one
  // child_kind for a given parent_entity_type, this is safe.  We
  // implement it as a single statement whose target table is a UNION-
  // like SQL trick: instead, emit one UPDATE per child_table for
  // simplicity (still all in one db.batch() = one transaction).
  //
  // The number of these UPDATE statements varies by parent type, which
  // makes the results-index math brittle.  To keep counts recomputation
  // simple we pad the batch so EVERY parent contributes exactly the
  // same NUMBER of statements.  We do this by always emitting one
  // no-op filler statement when a parent has fewer child tables than
  // the maximum (3, for pd_enrollment).
  const MAX_CHILD_TABLES = 3;
  const filler = () => db.prepare(`SELECT 1 WHERE 0=1`); // deterministic no-op
  for (let i = 0; i < MAX_CHILD_TABLES; i++) {
    if (i < spec.length) {
      const cb = spec[i];
      // (A) each child-table UPDATE also carries the STATUS_GUARD so a
      // delayed-duplicate request whose batch has moved out of preview
      // affects 0 rows.
      stmts.push(
        db.prepare(
          `UPDATE ${cb.table} SET deleted_at=?
            WHERE deleted_at IS NULL
              AND id IN (
                SELECT child_id FROM practice_cleanup_child
                 WHERE batch_id=? AND parent_entity_type=? AND parent_entity_id=?
                   AND child_kind=?
              )
              AND ${STATUS_GUARD}`
        ).bind(batchStamp, batchId, entityType, entityId, cb.kind, batchId, writerNonce),
      );
    } else {
      stmts.push(filler());
    }
  }

  // (B) parent soft-delete UPDATE — STATUS_GUARD applies.
  stmts.push(
    db.prepare(
      `UPDATE ${tableFor(entityType)} SET deleted_at=?
        WHERE id=? AND deleted_at IS NULL AND ${STATUS_GUARD}`
    ).bind(batchStamp, entityId, batchId, writerNonce),
  );

  // (C) manifest UPDATE for the parent row — one-winner guard via
  // "AND deleted_at_stamp IS NULL" so a losing concurrent execute
  // cannot overwrite the stamp; STATUS_GUARD blocks delayed duplicates.
  stmts.push(
    db.prepare(
      `UPDATE practice_cleanup_row
          SET prior_deleted_at=NULL, deleted_at_stamp=?
        WHERE batch_id=? AND entity_type=? AND entity_id=?
          AND deleted_at_stamp IS NULL
          AND ${STATUS_GUARD}`
    ).bind(batchStamp, batchId, entityType, entityId, batchId, writerNonce),
  );

  // (D) manifest UPDATE for the parent's child rows — one-winner guard
  // + STATUS_GUARD.
  stmts.push(
    db.prepare(
      `UPDATE practice_cleanup_child
          SET deleted_at_stamp=?
        WHERE batch_id=? AND parent_entity_type=? AND parent_entity_id=?
          AND deleted_at_stamp IS NULL
          AND ${STATUS_GUARD}`
    ).bind(batchStamp, batchId, entityType, entityId, batchId, writerNonce),
  );

  // (E) notifications DELETE — restricted to the FROZEN scope
  // (populated at preview time; late-added notifs are NOT in this set).
  // STATUS_GUARD ensures a delayed duplicate does not re-delete
  // (in practice already 0-row after restore since the rows are gone,
  // but this keeps semantic parity with the other mutations).
  stmts.push(
    db.prepare(
      `DELETE FROM notifications
        WHERE id IN (
          SELECT scope_id FROM practice_cleanup_notif_scope
           WHERE batch_id=? AND scope_kind='notification'
             AND parent_entity_type=? AND parent_entity_id=?
        )
          AND ${STATUS_GUARD}`
    ).bind(batchId, entityType, entityId, batchId, writerNonce),
  );

  // (F) activity_log DELETE — same pattern.
  stmts.push(
    db.prepare(
      `DELETE FROM activity_log
        WHERE id IN (
          SELECT scope_id FROM practice_cleanup_notif_scope
           WHERE batch_id=? AND scope_kind='activity_log'
             AND parent_entity_type=? AND parent_entity_id=?
        )
          AND ${STATUS_GUARD}`
    ).bind(batchId, entityType, entityId, batchId, writerNonce),
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

  // Delayed-duplicate defence (Sept 24, 2026 — sixth review, item 1).
  // The execution_lock row for this batch is INTENTIONALLY LEFT IN PLACE.
  // Rationale: a delayed duplicate of the ORIGINAL execute request
  // (paused before its db.batch() ran) can wake up AFTER restore
  // completes.  If we cleared the lock, that request's first-statement
  // lock INSERT would succeed and its subsequent mutation statements
  // would re-soft-delete the just-restored records.  Since a restored
  // batch is terminal (it can never be re-executed — a fresh preview
  // gets a NEW batch_id and its own lock slot), keeping the lock in
  // place is harmless and closes the delayed-duplicate window.
  //
  // Every mutation in appendParentBatchStatements ALSO carries an
  // "AND EXISTS (SELECT 1 FROM practice_cleanup_batches
  // WHERE id=? AND status='preview' AND writer_nonce=?)" transaction-
  // level status guard, so even if a delayed request DID somehow
  // acquire a fresh lock, every write in its batch would no-op because
  // the batch's status is no longer 'preview' and its writer_nonce is
  // NULL.  The two mechanisms are belt-and-suspenders.

  // Status flip — guarded by status='executed' so a repeat call is a no-op.
  stmts.push(
    db.prepare(
      `UPDATE practice_cleanup_batches
          SET status='restored', restored_at=CURRENT_TIMESTAMP, restored_by=?
        WHERE id=? AND status='executed'`
    ).bind(actorId, batchId),
  );

  const results = await db.batch(stmts);

  // Reconcile counts from the batch results.  Layout: parentUpdates[0..N),
  // childUpdates[N..N+M), statusFlip[N+M].  (No execution_lock DELETE —
  // see above rationale.)
  for (let i = 0; i < parentIndex.length; i++) {
    if (safeChanges(results, i) === 1) restored[parentIndex[i].et] += 1;
  }
  const base = parentIndex.length;
  for (let i = 0; i < childIndex.length; i++) {
    if (safeChanges(results, base + i) === 1) cascade_restored[childIndex[i].kind] += 1;
  }
  // (status flip at base+childIndex.length returns changes=0 when a
  // concurrent restore already ran; our per-row UPDATEs required
  // deleted_at=<stamp> which by then is NULL so they safely no-op'd.)

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
  const notifScope = await db.prepare(
    `SELECT parent_entity_type, parent_entity_id, scope_kind, scope_id, action
       FROM practice_cleanup_notif_scope
      WHERE batch_id=?
      ORDER BY parent_entity_type, parent_entity_id, scope_kind, scope_id`
  ).bind(batchId).all<any>();
  const loaded = {
    batch: b,
    rows: (rows.results as any[]) || [],
    ambiguous_notifs: (ambiguous.results as any[]) || [],
    children: (children.results as any[]) || [],
    notif_scope: (notifScope.results as any[]) || [],
  };

  // Self-healing counts backfill (0018 item 3).  If the batch is executed
  // or restored but affected_counts_json is missing / '__pending__' /
  // malformed, recompute from the manifest and write back so the results
  // page renders correctly and stays reachable.
  const isExec = b.status === 'executed' || b.status === 'restored';
  const hasUsableCounts = b.affected_counts_json
    && b.affected_counts_json !== '__pending__'
    && safeJsonParse(b.affected_counts_json) !== null;
  if (isExec && !hasUsableCounts) {
    const recomputed = summarizeFromManifest(loaded);
    try {
      await db.prepare(
        `UPDATE practice_cleanup_batches SET affected_counts_json=? WHERE id=?`
      ).bind(JSON.stringify(recomputed), batchId).run();
      // Refresh the batch row so the returned object has the healed value.
      loaded.batch = { ...loaded.batch, affected_counts_json: JSON.stringify(recomputed) };
    } catch (e) {
      // Even the self-heal write failed — leave affected_counts_json as-is;
      // the results page's own null-safe rendering path handles it.
      console.warn('practice_cleanup: loadBatch self-heal write failed (view falls back to null)', {
        batchId, err: (e as any)?.message || e,
      });
    }
  }
  return loaded;
}

function safeJsonParse(s: string | null | undefined): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
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
