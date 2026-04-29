import { useState, useRef } from 'react';
import { fetchDocuments, uploadDocument, deleteDocument, documentDownloadUrl, documentPreviewUrl } from '../api';

const DOC_TYPES = [
  'Proposal', 'Contract', 'NDA', 'Case Study', 'Product Sheet',
  'SOW', 'RFP / RFI', 'Pricing', 'Technical Spec', 'Presentation',
  'Invoice', 'PO', 'Reference Letter', 'Other',
];

const MIME_ICON = {
  'application/pdf': '📄',
  'image/png': '🖼️', 'image/jpeg': '🖼️', 'image/gif': '🖼️', 'image/webp': '🖼️',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-powerpoint': '📊',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊',
  'text/plain': '📃', 'text/csv': '📃',
};

function fmtBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const PREVIEWABLE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export default function DocumentManager({ accountId, dealStage, repName, documents: initialDocs, onDocsChange }) {
  const [docs,        setDocs]        = useState(initialDocs || []);
  const [uploading,   setUploading]   = useState(false);
  const [showUpload,  setShowUpload]  = useState(false);
  const [previewDoc,  setPreviewDoc]  = useState(null);
  const [uploadMeta,  setUploadMeta]  = useState({ document_type: '', description: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const fileRef = useRef(null);

  const refreshDocs = async () => {
    try {
      const fresh = await fetchDocuments(accountId);
      setDocs(fresh);
      onDocsChange?.(fresh);
    } catch {}
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    if (!uploadMeta.document_type) {
      const ext = file.name.split('.').pop().toLowerCase();
      const guess = ext === 'pdf' ? 'Proposal'
        : ext === 'docx' || ext === 'doc' ? 'SOW'
        : ext === 'pptx' || ext === 'ppt' ? 'Presentation'
        : ext === 'xlsx' || ext === 'xls' ? 'Pricing'
        : '';
      setUploadMeta((m) => ({ ...m, document_type: guess }));
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    try {
      await uploadDocument(accountId, selectedFile, {
        ...uploadMeta,
        deal_stage: dealStage || null,
        uploaded_by: repName || null,
      });
      setSelectedFile(null);
      setUploadMeta({ document_type: '', description: '' });
      setShowUpload(false);
      if (fileRef.current) fileRef.current.value = '';
      await refreshDocs();
    } catch (e) { alert(e.message); } finally { setUploading(false); }
  };

  const handleDelete = async (doc) => {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    try {
      await deleteDocument(accountId, doc.id);
      await refreshDocs();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="doc-manager">
      <div className="section-header">
        <h2 className="section-title">Documents</h2>
        <button className="btn-primary" onClick={() => setShowUpload((v) => !v)}>
          {showUpload ? 'Cancel' : '+ Upload'}
        </button>
      </div>

      {showUpload && (
        <form onSubmit={handleUpload} className="doc-upload-form">
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ gridColumn: '1 / -1' }}>
              File
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv"
                onChange={handleFileChange}
                required
              />
              {selectedFile && <span className="muted small" style={{ display: 'block', marginTop: 2 }}>{selectedFile.name} ({fmtBytes(selectedFile.size)})</span>}
            </label>
            <label>
              Document Type
              <select value={uploadMeta.document_type} onChange={(e) => setUploadMeta((m) => ({ ...m, document_type: e.target.value }))}>
                <option value="">— Select —</option>
                {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>
              Description
              <input
                value={uploadMeta.description}
                onChange={(e) => setUploadMeta((m) => ({ ...m, description: e.target.value }))}
                placeholder="Optional description…"
              />
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="submit" className="btn-primary" disabled={uploading || !selectedFile}>
              {uploading ? 'Uploading…' : 'Upload Document'}
            </button>
          </div>
        </form>
      )}

      {docs.length === 0 ? (
        <p className="muted" style={{ marginTop: '0.5rem' }}>No documents yet. Upload proposals, contracts, NDAs, and more.</p>
      ) : (
        <div className="doc-list">
          {docs.map((doc) => (
            <div key={doc.id} className="doc-card">
              <div className="doc-icon">{MIME_ICON[doc.mime_type] || '📎'}</div>
              <div className="doc-info">
                <div className="doc-name">{doc.file_name}</div>
                <div className="doc-meta">
                  {doc.document_type && <span className="badge" style={{ background: '#6366f1', fontSize: 10 }}>{doc.document_type}</span>}
                  {doc.deal_stage && <span className="muted small">{doc.deal_stage}</span>}
                  <span className="muted small">{fmtDate(doc.created_at)}</span>
                  {doc.uploaded_by && <span className="muted small">by {doc.uploaded_by}</span>}
                  {doc.file_size && <span className="muted small">{fmtBytes(doc.file_size)}</span>}
                </div>
                {doc.description && <div className="muted small" style={{ marginTop: 2 }}>{doc.description}</div>}
              </div>
              <div className="doc-actions">
                {PREVIEWABLE.has(doc.mime_type) && (
                  <button className="btn-icon" title="Preview" onClick={() => setPreviewDoc(doc)}>👁️</button>
                )}
                <a
                  className="btn-icon"
                  href={documentDownloadUrl(accountId, doc.id)}
                  download={doc.file_name}
                  title="Download"
                >⬇️</a>
                <button className="btn-icon" title="Delete" onClick={() => handleDelete(doc)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {previewDoc && (
        <div className="modal-backdrop" onClick={() => setPreviewDoc(null)}>
          <div className="modal-box" style={{ width: '85vw', maxHeight: '90vh', padding: 0, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{previewDoc.file_name}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="btn-secondary" href={documentDownloadUrl(accountId, previewDoc.id)} download={previewDoc.file_name} style={{ fontSize: 13 }}>⬇️ Download</a>
                <button className="btn-icon" onClick={() => setPreviewDoc(null)}>✕</button>
              </div>
            </div>
            {previewDoc.mime_type.startsWith('image/') ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 16, overflow: 'auto', maxHeight: 'calc(90vh - 60px)' }}>
                <img src={documentPreviewUrl(accountId, previewDoc.id)} alt={previewDoc.file_name} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
              </div>
            ) : (
              <iframe
                src={documentPreviewUrl(accountId, previewDoc.id)}
                title={previewDoc.file_name}
                style={{ width: '100%', height: 'calc(90vh - 60px)', border: 'none' }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
