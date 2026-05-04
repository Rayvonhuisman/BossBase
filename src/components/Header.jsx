import { Menu, Plus } from 'lucide-react';
import Button from './Button.jsx';

export default function Header({ title, subtitle, onMenu, onCreate, createLabel = 'Nieuwe aanvraag' }) {
  return (
    <header className="header">
      <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Open navigation">
        <Menu size={22} />
      </button>
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {onCreate ? (
        <Button onClick={onCreate} className="header-action">
          <Plus size={18} /> {createLabel}
        </Button>
      ) : null}
    </header>
  );
}
