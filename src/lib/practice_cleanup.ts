// ============================================================================
// practice_cleanup.ts — Practice-data cleanup workflow (super-admin only)
// ----------------------------------------------------------------------------
// The training-cleanup surface at /admin/data/practice-cleanup follows a
// review-scope → confirm → results workflow.  Records are ONLY eligible if
// an admin has explicitly tagged them with is_practice=1 via the same page
// (never by date, never by author, never by "everything in category").
//
// A batch is the unit of undo.  Every soft-delete written by an execute
// step records the batch_id so the restore step can un-soft-delete exactly
// those rows and nothing else.
//
// Dependency ordering matters:
//   coaching_note                 → coaching_note_share_delivery (no CASCADE),
//                                    coaching_note_audit (CASCADE — free),
//                                    notifications rows with entity_type=
//                                      'coaching_note' AND entity_id=<id>,
//                                    activity_log rows with entity_type=
//                                      'coaching_note' AND entity_id=<id>
//   pd_enrollment                 → pd_deliverables (CASCADE),
//                                    pd_reflections (CASCADE),
//                                    pd_deliverable_scores (CASCADE),
//                                    notifications rows keyed on entity_id,
//                                    activity_log rows keyed on entity_id
//   external_pd_submission        → notifications, activity_log
//   observation                   → observation_scores (CASCADE),
//                                    feedback_items (CASCADE),
//                                    focus_areas (opened_observation_id),
//                                    notifications, activity_log
//
// SOFT-DELETE STRATEGY.  Every practice cleanup uses soft-delete (writes
// deleted_at) regardless of the global soft_delete_enabled setting.  This
// gives the admin a working restore path for anything described as
// recoverable AND keeps the practice-cleanup surface predictable.  Notifi-
// cations and activity_log rows tied to the deleted entities ARE removed
// hard (they're derived state; keeping them would leak "you have a new
// coach note" alerts to a teacher whose practice note was just cleared).
//
// LEDGER dedupe (coaching_note_share_delivery) is treated the same way —
// hard-deleted alongside notifications so a future re-share of a real note
// isn't blocked by leftover state from a cleaned-up practice note.
// ============================================================================

export type EntityType = 'coaching_note' | 'pd_enrollment' | 'external_pd_submission' | 'observation';

export interface Candidate {
  entity_type: EntityType;
  entity_id: number;
  label: string;
  // Per-entity dependent counts shown on the review-scope screen so the
  // admin sees exactly what will disappear with each parent record.
  dep_counts: Record<string, number>;
}

/** List every currently-tagged practice record with human-readable label +
 *  dependent counts.  Used by the review-scope step BEFORE the admin
 *  confirms.  Excludes rows already soft-deleted so re-runs are clean. */
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
    // Column is `hours` in schema (not hours_requested).
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
      label: `Obs #${r.id} (${r.observation_type}, ${r.status}) — ${r.appraiser_name} → ${r.teacher_name}, ${r.observed_on || r.observed_at || ''}`,
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

export interface ExecuteResult {
  batch_id: number;
  affected: Record<EntityType, number>;         // parent rows soft-deleted this batch
  cascaded: {
    coaching_note_audit_soft: number;
    coaching_note_share_delivery_hard: number;
    pd_deliverables_soft: number;
    pd_reflections_soft: number;
    pd_deliverable_scores_soft: number;
    observation_scores_soft_via_feedback: number; // (observation_scores has no deleted_at — see note)
    feedback_items_soft: number;
    focus_areas_soft: number;
    notifications_hard: number;
    activity_log_hard: number;
  };
}

/** Create a batch row, write practice_cleanup_row entries for every current
 *  candidate, then soft-delete each parent + cascade dependents.  Returns
 *  the batch id and every rowcount so the results screen can render an
 *  accurate summary. */
export async function executeCleanup(
  db: D1Database, actorId: number, note: string | null,
): Promise<ExecuteResult> {
  const candidates = await listPracticeCandidates(db);
  if (candidates.length === 0) {
    throw new Error('nothing_to_clean');
  }

  // Create batch row (status='preview' — we upgrade to 'executed' at end).
  const batchRes = await db.prepare(
    `INSERT INTO practice_cleanup_batches (actor_id, status, note) VALUES (?, 'preview', ?) RETURNING id`
  ).bind(actorId, note).run();
  const batchId = Number(((batchRes.results as any[])?.[0] || {}).id);
  if (!batchId) throw new Error('failed_to_create_batch');

  // Enumerate rows in practice_cleanup_row for the audit trail + undo path.
  for (const c of candidates) {
    await db.prepare(
      `INSERT INTO practice_cleanup_row (batch_id, entity_type, entity_id, label) VALUES (?,?,?,?)`
    ).bind(batchId, c.entity_type, c.entity_id, c.label).run();
  }

  // Track affected counts.
  const affected: Record<EntityType, number> = {
    coaching_note: 0, pd_enrollment: 0, external_pd_submission: 0, observation: 0,
  };
  const cascaded = {
    coaching_note_audit_soft: 0,
    coaching_note_share_delivery_hard: 0,
    pd_deliverables_soft: 0,
    pd_reflections_soft: 0,
    pd_deliverable_scores_soft: 0,
    observation_scores_soft_via_feedback: 0,
    feedback_items_soft: 0,
    focus_areas_soft: 0,
    notifications_hard: 0,
    activity_log_hard: 0,
  };

  // Process each entity with its cascade.  We chunk by parent record so a
  // single failure only affects that record's cascade, not the whole batch.
  for (const c of candidates) {
    if (c.entity_type === 'coaching_note') {
      // Hard-delete the ledger row (dedupe key — a leftover would block a
      // legitimate future re-share of a different note).
      const rL = await db.prepare(
        `DELETE FROM coaching_note_share_delivery WHERE note_id=?`
      ).bind(c.entity_id).run();
      cascaded.coaching_note_share_delivery_hard += ((rL.meta as any)?.changes || 0);
      // Soft-delete audit rows.
      const rA = await db.prepare(
        `UPDATE coaching_note_audit SET deleted_at=CURRENT_TIMESTAMP
           WHERE note_id=? AND deleted_at IS NULL`
      ).bind(c.entity_id).run();
      cascaded.coaching_note_audit_soft += ((rA.meta as any)?.changes || 0);
      // Soft-delete the note.
      const rN = await db.prepare(
        `UPDATE coaching_notes SET deleted_at=CURRENT_TIMESTAMP
           WHERE id=? AND deleted_at IS NULL`
      ).bind(c.entity_id).run();
      affected.coaching_note += ((rN.meta as any)?.changes || 0);
      // Hard-delete matching notifications + activity_log rows.
      const rNo = await db.prepare(
        `DELETE FROM notifications WHERE entity_type='coaching_note' AND entity_id=?`
      ).bind(c.entity_id).run();
      cascaded.notifications_hard += ((rNo.meta as any)?.changes || 0);
      const rAl = await db.prepare(
        `DELETE FROM activity_log WHERE entity_type='coaching_note' AND entity_id=?`
      ).bind(c.entity_id).run();
      cascaded.activity_log_hard += ((rAl.meta as any)?.changes || 0);
    } else if (c.entity_type === 'pd_enrollment') {
      const rD = await db.prepare(
        `UPDATE pd_deliverables SET deleted_at=CURRENT_TIMESTAMP
           WHERE enrollment_id=? AND deleted_at IS NULL`
      ).bind(c.entity_id).run();
      cascaded.pd_deliverables_soft += ((rD.meta as any)?.changes || 0);
      const rR = await db.prepare(
        `UPDATE pd_reflections SET deleted_at=CURRENT_TIMESTAMP
           WHERE enrollment_id=? AND deleted_at IS NULL`
      ).bind(c.entity_id).run();
      cascaded.pd_reflections_soft += ((rR.meta as any)?.changes || 0);
      const rS = await db.prepare(
        `UPDATE pd_deliverable_scores SET deleted_at=CURRENT_TIMESTAMP
           WHERE enrollment_id=? AND deleted_at IS NULL`
      ).bind(c.entity_id).run();
      cascaded.pd_deliverable_scores_soft += ((rS.meta as any)?.changes || 0);
      const rE = await db.prepare(
        `UPDATE pd_enrollments SET deleted_at=CURRENT_TIMESTAMP
           WHERE id=? AND deleted_at IS NULL`
      ).bind(c.entity_id).run();
      affected.pd_enrollment += ((rE.meta as any)?.changes || 0);
      const rNo = await db.prepare(
        `DELETE FROM notifications WHERE entity_type='pd_enrollment' AND entity_id=?`
      ).bind(c.entity_id).run();
      cascaded.notifications_hard += ((rNo.meta as any)?.changes || 0);
      const rAl = await db.prepare(
        `DELETE FROM activity_log WHERE entity_type='pd_enrollment' AND entity_id=?`
      ).bind(c.entity_id).run();
      cascaded.activity_log_hard += ((rAl.meta as any)?.changes || 0);
    } else if (c.entity_type === 'external_pd_submission') {
      const rX = await db.prepare(
        `UPDATE external_pd_submissions SET deleted_at=CURRENT_TIMESTAMP
           WHERE id=? AND deleted_at IS NULL`
      ).bind(c.entity_id).run();
      affected.external_pd_submission += ((rX.meta as any)?.changes || 0);
      const rNo = await db.prepare(
        `DELETE FROM notifications WHERE entity_type='external_pd_submission' AND entity_id=?`
      ).bind(c.entity_id).run();
      cascaded.notifications_hard += ((rNo.meta as any)?.changes || 0);
      const rAl = await db.prepare(
        `DELETE FROM activity_log WHERE entity_type='external_pd_submission' AND entity_id=?`
      ).bind(c.entity_id).run();
      cascaded.activity_log_hard += ((rAl.meta as any)?.changes || 0);
    } else if (c.entity_type === 'observation') {
      const rF = await db.prepare(
        `UPDATE feedback_items SET deleted_at=CURRENT_TIMESTAMP
           WHERE observation_id=? AND deleted_at IS NULL`
      ).bind(c.entity_id).run();
      cascaded.feedback_items_soft += ((rF.meta as any)?.changes || 0);
      const rFa = await db.prepare(
        `UPDATE focus_areas SET deleted_at=CURRENT_TIMESTAMP
           WHERE opened_observation_id=? AND deleted_at IS NULL`
      ).bind(c.entity_id).run();
      cascaded.focus_areas_soft += ((rFa.meta as any)?.changes || 0);
      // observation_scores has no deleted_at column — cascade removal has
      // to keep it in place (it's constrained by CASCADE if we ever hard-
      // delete).  Soft-deleting the parent observation makes it invisible
      // in every view via the deleted_at guards we now enforce; the score
      // rows are only ever queried through the observation, so they too
      // become invisible.  This is intentional: any per-score display path
      // must go through the observation.
      const rO = await db.prepare(
        `UPDATE observations SET deleted_at=CURRENT_TIMESTAMP
           WHERE id=? AND deleted_at IS NULL`
      ).bind(c.entity_id).run();
      affected.observation += ((rO.meta as any)?.changes || 0);
      const rNo = await db.prepare(
        `DELETE FROM notifications WHERE entity_type='observation' AND entity_id=?`
      ).bind(c.entity_id).run();
      cascaded.notifications_hard += ((rNo.meta as any)?.changes || 0);
      const rAl = await db.prepare(
        `DELETE FROM activity_log WHERE entity_type='observation' AND entity_id=?`
      ).bind(c.entity_id).run();
      cascaded.activity_log_hard += ((rAl.meta as any)?.changes || 0);
    }
  }

  // Finalise batch.
  const summary = { affected, cascaded };
  await db.prepare(
    `UPDATE practice_cleanup_batches
        SET status='executed', executed_at=CURRENT_TIMESTAMP, affected_counts_json=?
      WHERE id=?`
  ).bind(JSON.stringify(summary), batchId).run();

  return { batch_id: batchId, ...summary };
}

/** Restore a previously-executed batch.  Un-soft-deletes every parent row
 *  AND the soft-deleted cascade rows written by the same batch.
 *  Notifications and activity_log rows are NOT re-created — they were
 *  hard-deleted by design; a restored note/enrollment is visible again but
 *  won't retroactively spam the recipient's inbox. */
export async function restoreBatch(db: D1Database, batchId: number, actorId: number): Promise<{
  restored: Record<EntityType, number>;
  cascade_restored: Record<string, number>;
}> {
  const batch = await db.prepare(
    `SELECT id, status FROM practice_cleanup_batches WHERE id=?`
  ).bind(batchId).first<any>();
  if (!batch) throw new Error('batch_not_found');
  if (batch.status !== 'executed') throw new Error('batch_not_restorable');

  const rows = await db.prepare(
    `SELECT entity_type, entity_id FROM practice_cleanup_row WHERE batch_id=?`
  ).bind(batchId).all<any>();

  const restored: Record<EntityType, number> = {
    coaching_note: 0, pd_enrollment: 0, external_pd_submission: 0, observation: 0,
  };
  const cascade_restored = {
    coaching_note_audit: 0,
    pd_deliverables: 0,
    pd_reflections: 0,
    pd_deliverable_scores: 0,
    feedback_items: 0,
    focus_areas: 0,
  };

  for (const r of ((rows.results as any[]) || [])) {
    const et = r.entity_type as EntityType;
    const id = Number(r.entity_id);
    if (et === 'coaching_note') {
      const rn = await db.prepare(
        `UPDATE coaching_notes SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL`
      ).bind(id).run();
      restored.coaching_note += ((rn.meta as any)?.changes || 0);
      const ra = await db.prepare(
        `UPDATE coaching_note_audit SET deleted_at=NULL WHERE note_id=? AND deleted_at IS NOT NULL`
      ).bind(id).run();
      cascade_restored.coaching_note_audit += ((ra.meta as any)?.changes || 0);
      // share_delivery was hard-deleted; NOT restored.
    } else if (et === 'pd_enrollment') {
      const re = await db.prepare(
        `UPDATE pd_enrollments SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL`
      ).bind(id).run();
      restored.pd_enrollment += ((re.meta as any)?.changes || 0);
      const rd = await db.prepare(
        `UPDATE pd_deliverables SET deleted_at=NULL WHERE enrollment_id=? AND deleted_at IS NOT NULL`
      ).bind(id).run();
      cascade_restored.pd_deliverables += ((rd.meta as any)?.changes || 0);
      const rr = await db.prepare(
        `UPDATE pd_reflections SET deleted_at=NULL WHERE enrollment_id=? AND deleted_at IS NOT NULL`
      ).bind(id).run();
      cascade_restored.pd_reflections += ((rr.meta as any)?.changes || 0);
      const rs = await db.prepare(
        `UPDATE pd_deliverable_scores SET deleted_at=NULL WHERE enrollment_id=? AND deleted_at IS NOT NULL`
      ).bind(id).run();
      cascade_restored.pd_deliverable_scores += ((rs.meta as any)?.changes || 0);
    } else if (et === 'external_pd_submission') {
      const rx = await db.prepare(
        `UPDATE external_pd_submissions SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL`
      ).bind(id).run();
      restored.external_pd_submission += ((rx.meta as any)?.changes || 0);
    } else if (et === 'observation') {
      const ro = await db.prepare(
        `UPDATE observations SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL`
      ).bind(id).run();
      restored.observation += ((ro.meta as any)?.changes || 0);
      const rf = await db.prepare(
        `UPDATE feedback_items SET deleted_at=NULL WHERE observation_id=? AND deleted_at IS NOT NULL`
      ).bind(id).run();
      cascade_restored.feedback_items += ((rf.meta as any)?.changes || 0);
      const rfa = await db.prepare(
        `UPDATE focus_areas SET deleted_at=NULL WHERE opened_observation_id=? AND deleted_at IS NOT NULL`
      ).bind(id).run();
      cascade_restored.focus_areas += ((rfa.meta as any)?.changes || 0);
    }
  }

  await db.prepare(
    `UPDATE practice_cleanup_batches
        SET status='restored', restored_at=CURRENT_TIMESTAMP, restored_by=?
      WHERE id=?`
  ).bind(actorId, batchId).run();

  return { restored, cascade_restored };
}

/** Load a batch summary (for the /admin/data/practice-cleanup/batches/:id
 *  results view). */
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
    `SELECT entity_type, entity_id, label FROM practice_cleanup_row
      WHERE batch_id=? ORDER BY entity_type, entity_id`
  ).bind(batchId).all<any>();
  return { batch: b, rows: (rows.results as any[]) || [] };
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
