import { useState, useRef, useEffect } from 'react';
import { importContacts } from '../api';
import { fetchReps } from '../api';

const COLUMN_ALIASES = {
  first_name:   ['first_name', 'firstname', 'first name', 'fname', 'first'],
  last_name:    ['last_name', 'lastname', 'last name', 'lname', 'surname', 'last'],
  email:        ['email', 'email address', 'e-mail', 'emailaddress'],
  linkedin_url: ['linkedin_url', 'linkedin', 'linkedin url', 'linkedin profile', 'linkedin_profile'],
  company:      ['company', 'company name', 'organization', 'org', 'employer'],
  title:        ['title', 'job title', 'position', 'role', 'jobtitle'],
  vertical:     ['vertical', 'industry', 'sector', 'market', 'segment'],
  phone:        ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'cell'],
};

function parseCSVRow(row) {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVRow(lines[0]).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_ ]/g, ''));
  const rows = lines.slice(1).filter((l) => l.trim()).map((line) => {
    const values = parseCSVRow(line);
    return headers.reduce((obj, h, i) => { obj[h] = values[i]?.trim() ?? ''; return obj; }, {});
  });
  return { headers, rows };
}

function mapColumns(headers) {
  const mapping = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const match = headers.find((h) => aliases.includes(h.toLowerCase()));
    if (match) mapping[field] = match;
  }
  return mapping;
}

function applyMapping(rawRow, mapping) {
  const result = {};
  for (const [field, csvCol] of Object.entries(mapping)) {
    result[field] = rawRow[csvCol] || null;
  }
  return result;
}

// Detect the dominant vertical in the dataset (most common non-empty value)
function detectDominantVertical(rows, mapping) {
  if (!mapping.vertical) return null;
  const counts = {};
  for (const row of rows) {
    const v = row[mapping.vertical];
    if (v) counts[v] = (counts[v] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries[0][0] : null;
}

export default function BulkImport() {
  const fileRef = useRef(null);
  const [step, setStep]         = useState('upload'); // upload | preview | importing | done
  const [preview, setPreview]   = useState([]);
  const [headers, setHeaders]   = useState([]);
  const [mapping, setMapping]   = useState({});
  const [rawRows, setRawRows]   = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, inserted: 0, skipped: 0 });
  const [error, setError]       = useState(null);
  const [assignRepId, setAssignRepId] = useState('');
  const [reps, setReps]         = useState([]);
  const [dominantVertical, setDominantVertical] = useState(null);

  useEffect(() => {
    fetchReps().then(setReps).catch(() => {});
  }, []);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers: h, rows } = parseCSV(ev.target.result);
      if (!h.length) { setError('Could not parse CSV — check the file format.'); return; }
      const m = mapColumns(h);
      setHeaders(h);
      setMapping(m);
      setRawRows(rows);
      setPreview(rows.slice(0, 5));
      setDominantVertical(detectDominantVertical(rows, m));
      setStep('preview');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setStep('importing');
    setError(null);
    const contacts = rawRows.map((row) => applyMapping(row, mapping));
    const CHUNK = 500;
    let inserted = 0, skipped = 0;

    try {
      for (let i = 0; i < contacts.length; i += CHUNK) {
        const batch = contacts.slice(i, i + CHUNK);
        const result = await importContacts(batch, assignRepId || null);
        inserted += result.inserted;
        skipped  += result.skipped;
        setProgress({ done: i + batch.length, total: contacts.length, inserted, skipped });
      }
      setProgress((p) => ({ ...p, inserted, skipped }));
      setStep('done');
    } catch (e) {
      setError(e.message);
      setStep('preview');
    }
  };

  const reset = () => {
    setStep('upload');
    setPreview([]);
    setHeaders([]);
    setMapping({});
    setRawRows([]);
    setProgress({ done: 0, total: 0, inserted: 0, skipped: 0 });
    setError(null);
    setAssignRepId('');
    setDominantVertical(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const mappedFields = Object.keys(COLUMN_ALIASES);
  const selectedRep  = reps.find((r) => String(r.id) === assignRepId);

  return (
    <div style={{ maxWidth: 800 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: '1.5rem' }}>Bulk Import Contacts</h3>

      {error && <p className="error">{error}</p>}

      {step === 'upload' && (
        <div className="pe-import-drop">
          <div className="pe-import-icon">📂</div>
          <h4>Upload a CSV file</h4>
          <p className="muted">
            Supports up to 15,000+ contacts. Expected columns:<br />
            <code>first_name, last_name, email, company, title, vertical, linkedin_url, phone</code>
          </p>
          <label className="btn-primary" style={{ cursor: 'pointer', display: 'inline-block', marginTop: '1rem' }}>
            Choose CSV File
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
          </label>
          <p className="muted" style={{ fontSize: 12, marginTop: '0.75rem' }}>Column names are case-insensitive. Duplicate emails are skipped automatically.</p>
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div className="pe-import-stats">
            <div className="stat-card">
              <span className="stat-label">Rows Detected</span>
              <span className="stat-value">{rawRows.length.toLocaleString()}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Mapped Fields</span>
              <span className="stat-value">{Object.keys(mapping).length} / {mappedFields.length}</span>
            </div>
            {dominantVertical && (
              <div className="stat-card accent-indigo">
                <span className="stat-label">Primary Vertical</span>
                <span className="stat-value" style={{ fontSize: 14 }}>{dominantVertical}</span>
              </div>
            )}
          </div>

          {/* Rep assignment */}
          <section className="dash-card" style={{ marginBottom: '1rem', borderColor: assignRepId ? 'var(--accent)' : undefined }}>
            <h3>Assign to Sales Rep <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>(optional)</span></h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: '0.75rem' }}>
              Assigned contacts are prioritised in that rep's workqueue over unassigned leads.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <select
                value={assignRepId}
                onChange={(e) => setAssignRepId(e.target.value)}
                style={{ minWidth: 220 }}
              >
                <option value="">— No assignment (pool) —</option>
                {reps.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
              </select>
              {selectedRep && (
                <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                  ✓ {rawRows.length.toLocaleString()} contacts will be assigned to {selectedRep.name}
                </span>
              )}
            </div>
          </section>

          <section className="dash-card" style={{ marginBottom: '1rem' }}>
            <h3>Column Mapping</h3>
            <table className="dash-table">
              <thead><tr><th>CRM Field</th><th>CSV Column</th><th>Status</th></tr></thead>
              <tbody>
                {mappedFields.map((f) => (
                  <tr key={f}>
                    <td style={{ fontWeight: 600 }}>{f}</td>
                    <td>
                      <select
                        value={mapping[f] || ''}
                        onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))}
                        style={{ fontSize: 12, padding: '3px 6px' }}
                      >
                        <option value="">— not mapped —</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </td>
                    <td>
                      {mapping[f]
                        ? <span style={{ color: 'var(--green)', fontSize: 12 }}>✓ Mapped</span>
                        : <span className="muted" style={{ fontSize: 12 }}>{f === 'email' ? '⚠ Required for dedup' : 'Optional'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <h3>Preview (first 5 rows)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    {mappedFields.filter((f) => mapping[f]).map((f) => <th key={f}>{f}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {mappedFields.filter((f) => mapping[f]).map((f) => (
                        <td key={f} style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row[mapping[f]] || <span className="muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-secondary" onClick={reset}>← Back</button>
            <button className="btn-primary" onClick={handleImport}>
              Import {rawRows.length.toLocaleString()} Contacts
              {selectedRep ? ` → ${selectedRep.name}` : ''}
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="pe-import-progress">
          <div className="pe-import-icon" style={{ fontSize: 32 }}>⏳</div>
          <h4>Importing contacts…</h4>
          <div className="pe-progress-bar-wrap">
            <div
              className="pe-progress-bar"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="muted">{progress.done.toLocaleString()} / {progress.total.toLocaleString()} processed · {progress.inserted} inserted · {progress.skipped} skipped</p>
        </div>
      )}

      {step === 'done' && (
        <div className="pe-import-done">
          <div className="pe-import-icon">✅</div>
          <h4>Import complete!</h4>
          {selectedRep && (
            <p style={{ fontSize: 13, color: 'var(--accent)', marginBottom: '0.5rem' }}>
              Assigned to {selectedRep.name}
            </p>
          )}
          <div className="stat-cards" style={{ maxWidth: 480, margin: '1rem 0' }}>
            <div className="stat-card accent-green">
              <span className="stat-label">Contacts Added</span>
              <span className="stat-value">{progress.inserted.toLocaleString()}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Duplicates Skipped</span>
              <span className="stat-value">{progress.skipped.toLocaleString()}</span>
            </div>
          </div>
          <button className="btn-primary" onClick={reset}>Import Another File</button>
        </div>
      )}
    </div>
  );
}
