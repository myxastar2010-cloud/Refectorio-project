import { IconArrowUp, IconPlus, IconX } from '@tabler/icons-react';
import type { OpenUi } from '@refectorio/kiki-core';
import { lazy, Suspense } from 'react';
import { menu } from '../../../content/menu.ru';
import { Pic } from '../components/Pic';
import type { Catalog } from '../data/catalog';
import { KIKI, QUICK } from '../data/pictures';
import type { Notify } from '../notify';

/** The chat is its own chunk (ТЗ 00 §5.1: `kiki/`, ≤ 60 KB gz): the panel's shell shows while it loads. */
const KikiChat = lazy(() => import('../../kiki/KikiChat').then((m) => ({ default: m.KikiChat })));

type Props = {
  /** Below 1280 px the panel is a sheet: open or closed (the wide layout always shows it). */
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onNotify: Notify;
  readonly catalog: Catalog | null;
  readonly deemphasizeNumbers: boolean;
  readonly hasMenu: boolean;
  readonly selectedDate: string;
  readonly today: string;
  readonly suggestions: readonly string[];
  readonly onOpen: (ui: OpenUi) => void;
  readonly request?: { readonly text: string; readonly key: number } | null;
};

/** The mockup's resting shell (quick cards and the input) while the chat chunk loads. */
function Shell() {
  return (
    <>
      <div className="kiki-log" />
      <ul className="kiki-quick" aria-hidden>
        {menu.kiki.quick.map((card, index) => {
          const picture = QUICK[index];
          return (
            <li key={card.image}>
              <span className="kiki-quick-card">
                {picture ? <Pic picture={picture} alt="" /> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="kiki-input" aria-hidden>
        <span className="kiki-attach">
          <IconPlus stroke={2} />
        </span>
        <input type="text" disabled placeholder={menu.kiki.placeholder} tabIndex={-1} />
        <span className="kiki-send">
          <IconArrowUp stroke={2.4} />
        </span>
      </div>
    </>
  );
}

/**
 * Kiki's panel (ТЗ фаза 4 §2, 07 §10): Kiki's icon and name over the chat (KikiChat — the conversation, the quick cards
 * and the input).
 */
export function KikiPanel({ open, onClose, ...chat }: Props) {
  return (
    <aside className="kiki-panel" aria-label={menu.kiki.label} data-open={open || undefined}>
      <button type="button" className="kiki-close" aria-label={menu.kiki.close} onClick={onClose}>
        <IconX stroke={2} aria-hidden />
      </button>
      <header className="kiki-head">
        <Pic picture={KIKI} alt="" className="kiki-icon" eager />
        <h2 className="kiki-name">{menu.kiki.name}</h2>
      </header>
      <Suspense fallback={<Shell />}>
        <KikiChat {...chat} />
      </Suspense>
    </aside>
  );
}
