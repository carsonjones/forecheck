import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

const commands = [
  { label: 'Games', hint: 'G', path: '/games' },
  { label: "Today's games", hint: 'T', path: `/games?date=${new Date().toISOString().slice(0, 10)}` },
  { label: 'Clear game filters', hint: 'C', path: '/games' },
];

export function CmdK() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSelected(0);
        setOpen((value) => !value);
      }
    };
    const openFromButton = () => { setSelected(0); setOpen(true); };
    window.addEventListener('keydown', toggle);
    window.addEventListener('open-cmdk', openFromButton);
    return () => {
      window.removeEventListener('keydown', toggle);
      window.removeEventListener('open-cmdk', openFromButton);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected((value) => (value + 1) % commands.length);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected((value) => (value - 1 + commands.length) % commands.length);
      }
      if (event.key === 'Enter') {
        navigate(commands[selected]!.path);
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [navigate, open, selected]);

  if (!open) return null;
  return (
    <div className="command-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <div className="command-menu" role="dialog" aria-modal="true" aria-label="Command menu" onClick={(event) => event.stopPropagation()}>
        <p className="command-title">Go to</p>
        {commands.map((command, index) => (
          <button
            key={command.label}
            className={index === selected ? 'command active' : 'command'}
            onMouseEnter={() => setSelected(index)}
            onClick={() => { navigate(command.path); setOpen(false); }}
          >
            <span>{command.label}</span><kbd>{command.hint}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
