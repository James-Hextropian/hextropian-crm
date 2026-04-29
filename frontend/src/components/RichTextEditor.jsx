import { useRef, useEffect } from 'react';

const TOOLBAR = [
  { cmd: 'bold',                label: 'B',  title: 'Bold (Ctrl+B)',      style: { fontWeight: 'bold' } },
  { cmd: 'italic',              label: 'I',  title: 'Italic (Ctrl+I)',    style: { fontStyle: 'italic' } },
  { cmd: 'underline',           label: 'U',  title: 'Underline (Ctrl+U)', style: { textDecoration: 'underline' } },
  { cmd: 'insertUnorderedList', label: '•',  title: 'Bullet list' },
  { cmd: 'insertOrderedList',   label: '1.', title: 'Numbered list' },
];

export default function RichTextEditor({ value, onChange, placeholder, minHeight = 80 }) {
  const editorRef = useRef(null);

  // Sync value in when not focused (e.g. on mount, or after external clear)
  useEffect(() => {
    const el = editorRef.current;
    if (!el || document.activeElement === el) return;
    if (el.innerHTML !== (value || '')) {
      el.innerHTML = value || '';
    }
  }, [value]);

  const handleInput = () => {
    onChange?.(editorRef.current?.innerHTML ?? '');
  };

  const execCmd = (cmd) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false);
    handleInput();
  };

  const showPlaceholder = !value || value === '<br>' || value === '';

  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
        {TOOLBAR.map(({ cmd, label, title, style }) => (
          <button
            key={cmd}
            type="button"
            className="rich-toolbar-btn"
            title={title}
            style={style}
            onMouseDown={(e) => {
              e.preventDefault();
              execCmd(cmd);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className={`rich-content${showPlaceholder ? ' rich-placeholder' : ''}`}
        data-placeholder={placeholder || ''}
        style={{ minHeight }}
        onInput={handleInput}
      />
    </div>
  );
}
