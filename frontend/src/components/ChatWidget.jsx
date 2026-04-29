import { useState, useRef, useEffect, useCallback } from 'react';
import { authFetch } from '../context/AuthContext';

function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:var(--surface2);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul style="margin:4px 0 4px 16px;padding:0">$1</ul>')
    .replace(/\n/g, '<br>');
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '8px 12px' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--muted)', display: 'inline-block',
          animation: `typing-bounce 1.2s infinite ease-in-out ${i * 0.2}s`,
        }} />
      ))}
    </div>
  );
}

export default function ChatWidget({ currentView, currentAccountId, currentAccountName, onNavigate }) {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m your CRM assistant. Ask me to search accounts, update deals, add notes, show pipeline stats, or help with MEDDIC discovery.' },
  ]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [unread,   setUnread]   = useState(false);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    if (open) {
      setUnread(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const res = await authFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: history,
          context: { currentView, currentAccountId, currentAccountName },
        }),
      });

      const botMsg = { role: 'assistant', content: res.reply };
      setMessages((m) => [...m, botMsg]);

      if (res.navigate && onNavigate) {
        onNavigate(res.navigate.view, res.navigate.accountId);
      }

      if (!open) setUnread(true);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry, something went wrong: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, currentView, currentAccountId, currentAccountName, open, onNavigate]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      <style>{`
        @keyframes typing-bounce {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1.2); opacity: 1; }
        }
        .chat-slide-in {
          animation: chat-slide 0.2s ease-out;
        }
        @keyframes chat-slide {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="AI Assistant"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--accent)', color: '#fff', border: 'none',
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)'; }}
      >
        {open ? '✕' : '💬'}
        {!open && unread && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 10, height: 10, borderRadius: '50%',
            background: '#ef4444', border: '2px solid var(--bg)',
          }} />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="chat-slide-in"
          style={{
            position: 'fixed', bottom: 88, right: 24, zIndex: 999,
            width: 380, height: 520, borderRadius: 12,
            background: 'var(--surface)', border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🤖</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>CRM Assistant</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Powered by Claude</div>
              </div>
            </div>
            <button
              onClick={() => setMessages([{ role: 'assistant', content: 'Chat cleared. How can I help?' }])}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--muted)' }}
            >
              Clear
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '82%', padding: '8px 12px', borderRadius: 12,
                  fontSize: 13, lineHeight: 1.5,
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text)',
                  borderBottomRightRadius: msg.role === 'user' ? 4 : 12,
                  borderBottomLeftRadius:  msg.role === 'user' ? 12 : 4,
                }}>
                  {msg.role === 'assistant'
                    ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    : msg.content
                  }
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: 'var(--surface2)', borderRadius: 12, borderBottomLeftRadius: 4 }}>
                  <TypingIndicator />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Context indicator */}
          {currentAccountName && (
            <div style={{ padding: '4px 14px', background: 'var(--surface2)', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
              Context: {currentAccountName}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8, alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask me anything…"
              rows={1}
              disabled={loading}
              style={{
                flex: 1, resize: 'none', fontSize: 13,
                padding: '8px 10px', borderRadius: 8,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text)', fontFamily: 'inherit',
                maxHeight: 80, overflowY: 'auto',
              }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                fontSize: 16, fontWeight: 700,
                opacity: (loading || !input.trim()) ? 0.5 : 1,
                transition: 'opacity 0.15s',
                flexShrink: 0,
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
