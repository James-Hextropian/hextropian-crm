import { authFetch } from './context/AuthContext';

const BASE = '/api';

// ── Customers ─────────────────────────────────────────────────────────────────

export async function fetchCustomers(params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return authFetch(`${BASE}/customers${qs ? '?' + qs : ''}`);
}

export async function fetchCustomer(id) {
  return authFetch(`${BASE}/customers/${id}`);
}

export async function fetchDashboard() {
  return authFetch(`${BASE}/customers/dashboard`);
}

export async function createCustomer(data) {
  return authFetch(`${BASE}/customers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export async function updateCustomer(id, data) {
  return authFetch(`${BASE}/customers/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export async function updateCustomerOwner(id, owner_id) {
  return authFetch(`${BASE}/customers/${id}/owner`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner_id }),
  });
}

export async function deleteCustomer(id) {
  await authFetch(`${BASE}/customers/${id}`, { method: 'DELETE' });
}

export function exportUrl(params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return `${BASE}/customers/export${qs ? '?' + qs : ''}`;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function fetchNotes(customerId, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return authFetch(`${BASE}/customers/${customerId}/notes${qs ? '?' + qs : ''}`);
}

export async function addNote(customerId, content) {
  return authFetch(`${BASE}/customers/${customerId}/notes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
  });
}

export async function updateNote(customerId, noteId, content) {
  return authFetch(`${BASE}/customers/${customerId}/notes/${noteId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
  });
}

export async function deleteNote(customerId, noteId) {
  await authFetch(`${BASE}/customers/${customerId}/notes/${noteId}`, { method: 'DELETE' });
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export async function fetchContacts(customerId) {
  return authFetch(`${BASE}/customers/${customerId}/contacts`);
}

export async function addContact(customerId, data) {
  return authFetch(`${BASE}/customers/${customerId}/contacts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export async function updateContact(customerId, contactId, data) {
  return authFetch(`${BASE}/customers/${customerId}/contacts/${contactId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export async function deleteContact(customerId, contactId) {
  await authFetch(`${BASE}/customers/${customerId}/contacts/${contactId}`, { method: 'DELETE' });
}

// ── Sales Reps ────────────────────────────────────────────────────────────────

export async function fetchReps() {
  return authFetch(`${BASE}/reps`);
}

export async function createRep(data) {
  return authFetch(`${BASE}/reps`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export async function updateRep(id, data) {
  return authFetch(`${BASE}/reps/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export async function deleteRep(id) {
  await authFetch(`${BASE}/reps/${id}`, { method: 'DELETE' });
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export async function fetchPipelineMetrics() {
  return authFetch(`${BASE}/metrics/pipeline`);
}

export async function fetchRepMetrics(repId) {
  return authFetch(`${BASE}/metrics/rep/${repId}`);
}

export async function fetchStageTimes() {
  return authFetch(`${BASE}/analytics/stage-times`);
}

// ── Contacts (Prospecting) ───────────────────────────────────────────────────

export async function fetchProspectContacts(params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return authFetch(`${BASE}/contacts${qs ? '?' + qs : ''}`);
}

export async function fetchContactVerticals() {
  return authFetch(`${BASE}/contacts/verticals`);
}

export async function fetchContact(id) {
  return authFetch(`${BASE}/contacts/${id}`);
}

export async function createContact(data) {
  return authFetch(`${BASE}/contacts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export async function importContacts(contacts, ownerRepId = null) {
  return authFetch(`${BASE}/contacts/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacts, owner_rep_id: ownerRepId || null }),
  });
}

export async function bulkAssignContacts(contactIds, repId) {
  return authFetch(`${BASE}/contacts/assign-bulk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact_ids: contactIds, rep_id: repId || null }),
  });
}

export async function fetchLeadDistribution() {
  return authFetch(`${BASE}/contacts/distribution`);
}

export async function deleteProspectContact(id) {
  await authFetch(`${BASE}/contacts/${id}`, { method: 'DELETE' });
}

export async function markNoInterest(contactId, reason, repId) {
  return authFetch(`${BASE}/contacts/${contactId}/no-interest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, rep_id: repId }),
  });
}

export async function convertContact(contactId, { deal_stage, owner_id, rep_id }) {
  return authFetch(`${BASE}/contacts/${contactId}/convert`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deal_stage, owner_id, rep_id }),
  });
}

export async function fetchContactNotes(contactId) {
  return authFetch(`${BASE}/contacts/${contactId}/notes`);
}

export async function addContactNote(contactId, content, repId) {
  return authFetch(`${BASE}/contacts/${contactId}/notes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, rep_id: repId }),
  });
}

export async function fetchOutreachHistory(contactId) {
  return authFetch(`${BASE}/contacts/${contactId}/history`);
}

// ── Workqueue ─────────────────────────────────────────────────────────────────

export async function fetchTodayQueue(repId) {
  return authFetch(`${BASE}/workqueue/today?repId=${repId}`);
}

export async function fillWorkqueue(repId) {
  return authFetch(`${BASE}/workqueue/fill`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repId }),
  });
}

export async function advanceStage(contactId, repId, notes) {
  return authFetch(`${BASE}/workqueue/advance-stage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId, repId, notes }),
  });
}

export async function assignToQueue(contactId, repId) {
  return authFetch(`${BASE}/workqueue/assign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId, repId }),
  });
}

export async function fetchProspectingMetrics() {
  return authFetch(`${BASE}/metrics/prospecting`);
}

// ── Gmail ─────────────────────────────────────────────────────────────────────

export async function fetchGmailStatus() {
  return authFetch(`${BASE}/auth/status`);
}

export async function disconnectGmail() {
  return authFetch(`${BASE}/auth/disconnect`, { method: 'POST' });
}

export async function sendEmail(data) {
  return authFetch(`${BASE}/email/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export async function fetchEmailHistory(customerId) {
  return authFetch(`${BASE}/email/history/${customerId}`);
}

// ── Win / Loss Reason ─────────────────────────────────────────────────────────

export async function setWinLossReason(id, win_loss_reason) {
  return authFetch(`${BASE}/accounts/${id}/win-loss-reason`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ win_loss_reason }),
  });
}

// ── Pre-Meeting Prep ──────────────────────────────────────────────────────────

export async function fetchPreMeetingPrep(accountId) {
  return authFetch(`${BASE}/accounts/${accountId}/pre-meeting-prep`);
}

export async function emailPreMeetingPrep(accountId, to) {
  return authFetch(`${BASE}/accounts/${accountId}/pre-meeting-prep/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
}

// ── Deal Review ───────────────────────────────────────────────────────────────

export async function fetchDealReview(accountId) {
  return authFetch(`${BASE}/accounts/${accountId}/review`);
}

export async function saveDealReview(accountId, review_data, created_by) {
  return authFetch(`${BASE}/accounts/${accountId}/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_data, created_by }),
  });
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function fetchDocuments(accountId) {
  return authFetch(`${BASE}/accounts/${accountId}/documents`);
}

export async function uploadDocument(accountId, file, meta) {
  const form = new FormData();
  form.append('file', file);
  if (meta.document_type) form.append('document_type', meta.document_type);
  if (meta.deal_stage)    form.append('deal_stage', meta.deal_stage);
  if (meta.uploaded_by)   form.append('uploaded_by', meta.uploaded_by);
  if (meta.description)   form.append('description', meta.description);
  return authFetch(`${BASE}/accounts/${accountId}/documents`, { method: 'POST', body: form });
}

export async function deleteDocument(accountId, docId) {
  await authFetch(`${BASE}/accounts/${accountId}/documents/${docId}`, { method: 'DELETE' });
}

export function documentDownloadUrl(accountId, docId) {
  return `${BASE}/accounts/${accountId}/documents/${docId}/download`;
}

export function documentPreviewUrl(accountId, docId) {
  return `${BASE}/accounts/${accountId}/documents/${docId}/preview`;
}
