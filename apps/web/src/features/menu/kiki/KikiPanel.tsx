import { IconArrowUp, IconPlus, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { menu } from '../../../content/menu.ru';
import { Pic } from '../components/Pic';
import { KIKI, QUICK } from '../data/pictures';

type Props = {
  /** Below 1280 px the panel is a sheet: open or closed (the wide layout always shows it). */
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onNotify: (text: string) => void;
};

/**
 * Kiki's panel (ТЗ фаза 4 §2): the real shell of the mockup — Kiki's icon and name, the three quick cards, the input.
 * Until phase 5 wires the chat, sending says «Кики подключится совсем скоро».
 */
export function KikiPanel({ open, onClose, onNotify }: Props) {
  const [draft, setDraft] = useState('');
  const soon = () => {
    onNotify(menu.kiki.soon);
  };
  return (
    <aside className="kiki-panel" aria-label={menu.kiki.label} data-open={open || undefined}>
      <button type="button" className="kiki-close" aria-label={menu.kiki.close} onClick={onClose}>
        <IconX stroke={2} aria-hidden />
      </button>
      <header className="kiki-head">
        <Pic picture={KIKI} alt="" className="kiki-icon" eager />
        <h2 className="kiki-name">{menu.kiki.name}</h2>
      </header>
      <div className="kiki-log" />
      <ul className="kiki-quick">
        {menu.kiki.quick.map((card, index) => {
          const picture = QUICK[index];
          return (
            <li key={card.image}>
              <button
                type="button"
                className="kiki-quick-card"
                aria-label={card.label}
                onClick={soon}
              >
                {picture ? <Pic picture={picture} alt="" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="kiki-input"
        onSubmit={(event) => {
          event.preventDefault();
          soon();
        }}
      >
        <button type="button" className="kiki-attach" aria-label={menu.kiki.attach} onClick={soon}>
          <IconPlus stroke={2} aria-hidden />
        </button>
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder={menu.kiki.placeholder}
          aria-label={menu.kiki.placeholder}
          enterKeyHint="send"
        />
        <button type="submit" className="kiki-send" aria-label={menu.kiki.send}>
          <IconArrowUp stroke={2.4} aria-hidden />
        </button>
      </form>
    </aside>
  );
}
