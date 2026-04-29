import { useState } from 'react';
import WorkQueue from './WorkQueue';
import ContactsLibrary from './ContactsLibrary';
import BulkImport from './BulkImport';
import ProspectingMetrics from './ProspectingMetrics';
import ProspectCard from './ProspectCard';

const TABS = [
  { key: 'queue',    label: 'Workqueue' },
  { key: 'contacts', label: 'Contacts Library' },
  { key: 'import',   label: 'Bulk Import' },
  { key: 'metrics',  label: 'Metrics' },
];

export default function ProspectingEngine({ currentRepId, onViewAccount }) {
  const [tab, setTab]                     = useState('queue');
  const [prospectDetail, setProspectDetail] = useState(null);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);

  const openProspect  = (entry) => setProspectDetail(entry);
  const closeProspect = () => setProspectDetail(null);

  const handleConverted = (customer) => {
    closeProspect();
    if (onViewAccount) onViewAccount(customer.id);
  };

  const handleProspectUpdated = (updated) => {
    setProspectDetail(updated);
    setQueueRefreshKey((k) => k + 1);
  };

  return (
    <div className="prospecting-engine">
      <div className="prospecting-header">
        <h2 className="prospecting-title">Prospecting Engine</h2>
        <div className="prospecting-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'prospecting-tab active' : 'prospecting-tab'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!currentRepId && (
        <div className="pe-no-rep-banner">
          Select a sales rep in the header to use the Prospecting Engine.
        </div>
      )}

      <div className="prospecting-body">
        {tab === 'queue'    && <WorkQueue    currentRepId={currentRepId} onOpenProspect={openProspect} refreshKey={queueRefreshKey} />}
        {tab === 'contacts' && <ContactsLibrary currentRepId={currentRepId} onOpenProspect={openProspect} />}
        {tab === 'import'   && <BulkImport />}
        {tab === 'metrics'  && <ProspectingMetrics />}
      </div>

      {prospectDetail && (
        <ProspectCard
          entry={prospectDetail}
          currentRepId={currentRepId}
          onClose={closeProspect}
          onConverted={handleConverted}
          onUpdated={handleProspectUpdated}
        />
      )}
    </div>
  );
}
