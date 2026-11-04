import { IconSearch, IconX } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef } from 'react';
import { menu } from '../../../content/menu.ru';
import { useCalmMotion } from '../../../motion/hooks';

export type SearchFieldProps = {
  readonly open: boolean;
  readonly query: string;
  /** The results list the field controls, and its option under the arrows. */
  readonly listId: string;
  readonly activeId: string | null;
  readonly onOpen: () => void;
  readonly onQuery: (query: string) => void;
  readonly onClose: () => void;
  readonly onMove: (delta: 1 | -1) => void;
  readonly onEnter: () => void;
};

/**
 * «Поиск» (ТЗ фаза 4 §9): the pill opens into a field with ✕ — it grows leftwards from the pill (a clip on a small
 * element). A combobox: ↑/↓ move through the results, Enter opens the dish, Esc closes and restores the menu.
 */
export function SearchField({
  open,
  query,
  listId,
  activeId,
  onOpen,
  onQuery,
  onClose,
  onMove,
  onEnter,
}: SearchFieldProps) {
  const calm = useCalmMotion();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {open ? (
        <m.div
          key="field"
          className="menu-search"
          initial={
            calm ? { opacity: 0 } : { opacity: 0, clipPath: 'inset(0px 0px 0px 70% round 999px)' }
          }
          animate={{
            opacity: 1,
            clipPath: 'inset(0px 0px 0px 0% round 999px)',
            transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] },
          }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          <IconSearch stroke={2} aria-hidden />
          <input
            ref={input}
            type="search"
            role="combobox"
            aria-label={menu.search.label}
            aria-expanded={query.trim() !== ''}
            aria-controls={listId}
            aria-activedescendant={activeId ?? undefined}
            aria-autocomplete="list"
            placeholder={menu.search.placeholder}
            value={query}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              onQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                onMove(event.key === 'ArrowDown' ? 1 : -1);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                onEnter();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }
            }}
          />
          <button
            type="button"
            className="menu-search-clear"
            aria-label={menu.search.clear}
            onClick={onClose}
          >
            <IconX stroke={2.2} aria-hidden />
          </button>
        </m.div>
      ) : (
        <m.button
          key="pill"
          type="button"
          className="menu-pill menu-search-pill"
          aria-label={menu.search.label}
          onClick={onOpen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.18 } }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
        >
          <IconSearch stroke={2} aria-hidden />
          <span aria-hidden>{menu.top.search}</span>
        </m.button>
      )}
    </AnimatePresence>
  );
}
