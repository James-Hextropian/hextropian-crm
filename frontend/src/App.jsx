import { useState, useEffect } from 'react';
import { useAuth, authFetch } from './context/AuthContext';
import { useInactivityLogout } from './hooks/useInactivityLogout';
import LoginPage from './pages/LoginPage';
import Dashboard from './components/Dashboard';
import CustomerList from './components/CustomerList';
import CustomerDetail from './components/CustomerDetail';
import KanbanBoard from './components/KanbanBoard';
import RepMetrics from './components/RepMetrics';
import Analytics from './components/Analytics';
import ProspectingEngine from './components/ProspectingEngine';
import CalendarView from './components/calendar/CalendarView';
import UserManagement from './components/admin/UserManagement';
import UserMenu from './components/UserMenu';
import ChatWidget from './components/ChatWidget';
import { fetchReps } from './api';

export default function App() {
  const { user, loading, logout } = useAuth();
  useInactivityLogout(logout);

  const [view, setView]                     = useState('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [reps, setReps]                     = useState([]);
  const [currentRepId, setCurrentRepId]     = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);

  const loadReps = () => fetchReps().then(setReps).catch(() => {});

  useEffect(() => {
    if (!user) return;
    loadReps();
    if (user.rep_id && user.role === 'sales_rep') setCurrentRepId(user.rep_id);
    authFetch('/api/calendar/status').then((s) => setGoogleConnected(s.connected)).catch(() => {});
  }, [user]);

  const handleRepChange = (id) => {
    setCurrentRepId(id);
    if (id) localStorage.setItem('currentRepId', String(id));
    else localStorage.removeItem('currentRepId');
  };

  const openDetail = (id) => { setSelectedCustomerId(id); setView('detail'); };
  const handleBack = () => { setView('customers'); setSelectedCustomerId(null); };
  const handleNavigate = (navView, accountId) => {
    if (accountId) { setSelectedCustomerId(accountId); setView('detail'); }
    else if (navView) setView(navView);
  };
  const handleConnectGoogle = () => { window.location.href = '/api/auth/google'; };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const isAdmin    = user.role === 'admin';
  const canFilter  = user.role === 'admin' || user.role === 'sales_manager';
  const isSalesRep = user.role === 'sales_rep';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand" style={{ cursor: 'pointer' }} onClick={() => setView('dashboard')}>
          <span className="brand-mark">H</span>
          <span className="brand-name">Hextropian <span className="brand-sub">CRM</span></span>
        </div>

        <nav className="header-nav">
          <button className={view === 'dashboard' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('dashboard')}>Dashboard</button>
          <button className={view === 'customers' || view === 'detail' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('customers')}>Accounts</button>
          <button className={view === 'pipeline' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('pipeline')}>Pipeline</button>
          {!isSalesRep && (
            <button className={view === 'metrics' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('metrics')}>Metrics</button>
          )}
          <button className={view === 'analytics' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('analytics')}>Analytics</button>
          <button className={view === 'prospecting' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('prospecting')}>Prospecting</button>
          <button className={view === 'calendar' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('calendar')}>Calendar</button>
          {isAdmin && (
            <button className={view === 'admin' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('admin')}>Admin</button>
          )}
        </nav>

        <div className="header-right">
          {canFilter && (
            <div className="rep-selector">
              <span className="rep-selector-label">Filter:</span>
              <select className="rep-selector-select" value={currentRepId ?? ''}
                onChange={(e) => handleRepChange(e.target.value ? parseInt(e.target.value, 10) : null)}>
                <option value="">All Reps</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <UserMenu onConnectGoogle={handleConnectGoogle} googleConnected={googleConnected} />
        </div>
      </header>

      <main className="app-main">
        {view === 'dashboard'    && <Dashboard />}
        {view === 'customers'   && <CustomerList onViewDetail={openDetail} currentRepId={currentRepId} />}
        {view === 'detail'      && <CustomerDetail customerId={selectedCustomerId} onBack={handleBack} />}
        {view === 'pipeline'    && <KanbanBoard onViewDetail={openDetail} currentRepId={currentRepId} />}
        {view === 'metrics'     && !isSalesRep && <RepMetrics onRepsChanged={loadReps} />}
        {view === 'analytics'   && <Analytics />}
        {view === 'prospecting' && <ProspectingEngine currentRepId={currentRepId} onViewAccount={openDetail} />}
        {view === 'calendar'    && <CalendarView />}
        {view === 'admin'       && isAdmin && <UserManagement />}
      </main>

      <ChatWidget
        currentView={view}
        currentAccountId={selectedCustomerId}
        currentAccountName={null}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
