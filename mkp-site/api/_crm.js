/**
 * Shared CRM write for every public enquiry on mambaykanu.com.
 *
 * One person is one lead, keyed on their email. A second enquiry updates the
 * existing record and appends the new message rather than creating a duplicate.
 * The lead is written to two places:
 *
 *   1. Supabase  public.crm_leads in the MKC-Admin project. The record of truth.
 *   2. ClickUp   a task in the Leads list, created once and updated after that.
 *
 * Neither is allowed to break a form submission. The visitor's message is
 * already on its way by email by the time this runs, so every failure here is
 * logged and swallowed: a CRM outage must never cost a lead.
 *
 * NOTE ON SCOPE: apply1234 applicants are NOT leads. They are candidates for a
 * role and live in the hiring_* tables of the same Supabase project. Nothing in
 * this file should ever be called from an applicant flow. A demo request *about*
 * apply1234 from this website is a lead like any other, and is fine.
 *
 * Environment variables (all optional; each integration is skipped when unset):
 *   SUPABASE_URL                MKC-Admin project URL
 *   SUPABASE_SERVICE_ROLE_KEY   service role key, server side only
 *   CLICKUP_TOKEN               ClickUp personal or app token
 *   CLICKUP_LEADS_LIST_ID       the Leads list to create tasks in
 */

'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN;
const CLICKUP_LIST = process.env.CLICKUP_LEADS_LIST_ID;

const SITE = 'mambaykanu.com';
const TIMEOUT_MS = 6000;

/* A slow CRM must not hold a form submission open. */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
}

/* ---------------------------------------------------------------- Supabase */

async function findLead(email) {
  const url = `${SUPABASE_URL}/rest/v1/crm_leads`
    + `?email=ilike.${encodeURIComponent(email)}`
    + `&select=id,notes,touch_count,clickup_task_id,name,company,phone,stage&limit=1`;
  const r = await fetch(url, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`lookup ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows[0] || null;
}

async function insertLead(lead, note) {
  const row = {
    email: lead.email,
    name: lead.name || null,
    company: lead.company || null,
    phone: lead.phone || null,
    source: lead.source,
    source_detail: lead.sourceDetail || null,
    source_site: SITE,
    stage: 'new',
    notes: [note],
    touch_count: 1
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  if (!r.ok) throw new Error(`insert ${r.status}: ${await r.text()}`);
  return (await r.json())[0];
}

async function updateLead(existing, lead, note) {
  const patch = {
    last_seen_at: new Date().toISOString(),
    touch_count: (existing.touch_count || 0) + 1,
    notes: [...(existing.notes || []), note]
  };
  // Only fill gaps. A name captured earlier is not overwritten by a blank one.
  if (lead.name && !existing.name) patch.name = lead.name;
  if (lead.company && !existing.company) patch.company = lead.company;
  if (lead.phone && !existing.phone) patch.phone = lead.phone;

  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/crm_leads?id=eq.${encodeURIComponent(existing.id)}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    }
  );
  if (!r.ok) throw new Error(`update ${r.status}: ${await r.text()}`);
  return (await r.json())[0];
}

async function saveClickUpId(leadId, taskId, error) {
  const patch = error
    ? { clickup_error: String(error).slice(0, 500) }
    : { clickup_task_id: taskId, clickup_synced_at: new Date().toISOString(), clickup_error: null };
  await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?id=eq.${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(patch)
  });
}

/* ----------------------------------------------------------------- ClickUp */

function cuHeaders() {
  return { Authorization: CLICKUP_TOKEN, 'Content-Type': 'application/json' };
}

function taskBody(lead, note, touch) {
  const lines = [
    `**Email:** ${lead.email}`,
    lead.company ? `**Company:** ${lead.company}` : null,
    lead.phone ? `**Phone:** ${lead.phone}` : null,
    `**Source:** ${lead.source}${lead.sourceDetail ? ` (${lead.sourceDetail})` : ''}`,
    `**From:** ${SITE}`,
    touch > 1 ? `**Enquiries so far:** ${touch}` : null,
    '',
    note.message || '(no message)'
  ].filter(Boolean);
  return lines.join('\n');
}

async function createTask(lead, note) {
  // Hyphens only in the title, including any a visitor typed into their name.
  const title = `${lead.name || lead.email}${lead.sourceDetail ? `: ${lead.sourceDetail}` : ''}`
    .replace(/[—–]/g, '-');
  const r = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_LIST}/task`, {
    method: 'POST',
    headers: cuHeaders(),
    body: JSON.stringify({
      name: title.slice(0, 250),
      markdown_description: taskBody(lead, note, 1),
      tags: [lead.source, SITE].filter(Boolean)
    })
  });
  if (!r.ok) throw new Error(`clickup create ${r.status}: ${await r.text()}`);
  return (await r.json()).id;
}

/* An existing lead gets a comment on its task, which is the update, and keeps
   the original task rather than making a second one for the same person. */
async function commentOnTask(taskId, lead, note, touch) {
  const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/comment`, {
    method: 'POST',
    headers: cuHeaders(),
    body: JSON.stringify({
      comment_text:
        `New enquiry from ${SITE} (#${touch})\n`
        + `Source: ${lead.source}${lead.sourceDetail ? ` (${lead.sourceDetail})` : ''}\n\n`
        + (note.message || '(no message)'),
      notify_all: false
    })
  });
  if (!r.ok) throw new Error(`clickup comment ${r.status}: ${await r.text()}`);
}

/* Fallback for a lead whose ClickUp task we never recorded: look for one
   already carrying this email before creating another. */
async function findTaskByEmail(email) {
  const url = `https://api.clickup.com/api/v2/list/${CLICKUP_LIST}/task`
    + `?include_closed=true&subtasks=true`;
  const r = await fetch(url, { headers: cuHeaders() });
  if (!r.ok) return null;
  const data = await r.json();
  const needle = email.toLowerCase();
  const hit = (data.tasks || []).find(t =>
    (t.description || '').toLowerCase().includes(needle)
    || (t.name || '').toLowerCase().includes(needle));
  return hit ? hit.id : null;
}

/* -------------------------------------------------------------------- main */

/**
 * Record an enquiry as a lead. Never throws.
 *
 * @param {object} lead  { email, name?, company?, phone?, source, sourceDetail? }
 * @param {object} note  { message?, interest?, at? } appended to the history
 * @returns {Promise<{ok: boolean, action?: string, reason?: string}>}
 */
async function recordLead(lead, note = {}) {
  if (!lead || !lead.email) return { ok: false, reason: 'no email' };

  const entry = {
    at: note.at || new Date().toISOString(),
    source: lead.source,
    source_detail: lead.sourceDetail || null,
    interest: note.interest || null,
    message: note.message || null
  };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('CRM: Supabase not configured, lead not recorded for', lead.email);
    return { ok: false, reason: 'supabase not configured' };
  }

  let row, action;
  try {
    const existing = await withTimeout(findLead(lead.email), TIMEOUT_MS, 'crm lookup');
    if (existing) {
      row = await withTimeout(updateLead(existing, lead, entry), TIMEOUT_MS, 'crm update');
      row.clickup_task_id = existing.clickup_task_id;
      action = 'updated';
    } else {
      row = await withTimeout(insertLead(lead, entry), TIMEOUT_MS, 'crm insert');
      action = 'created';
    }
  } catch (err) {
    // The enquiry itself still went out by email; losing the CRM write is
    // recoverable, losing the lead is not.
    console.error('CRM write failed for', lead.email, err);
    return { ok: false, reason: String(err) };
  }

  if (!CLICKUP_TOKEN || !CLICKUP_LIST) return { ok: true, action, clickup: 'not configured' };

  try {
    let taskId = row.clickup_task_id;
    if (!taskId) taskId = await withTimeout(findTaskByEmail(lead.email), TIMEOUT_MS, 'clickup search');

    if (taskId) {
      await withTimeout(commentOnTask(taskId, lead, entry, row.touch_count), TIMEOUT_MS, 'clickup comment');
    } else {
      taskId = await withTimeout(createTask(lead, entry), TIMEOUT_MS, 'clickup create');
    }
    await saveClickUpId(row.id, taskId, null).catch(() => {});
    return { ok: true, action, clickup: taskId ? 'synced' : 'skipped' };
  } catch (err) {
    console.error('CRM ClickUp sync failed for', lead.email, err);
    await saveClickUpId(row.id, null, err).catch(() => {});
    return { ok: true, action, clickup: 'failed' };
  }
}

module.exports = { recordLead };
