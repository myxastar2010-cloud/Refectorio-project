import type { Plan } from '@refectorio/menu-core';
import { IconChevronLeft } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import { useCalmMotion } from '../../../motion/hooks';
import { MENU } from '../../../motion/tokens';
import { Pic } from '../components/Pic';
import { LETTER_PICTURES } from '../data/pictures';
import type { Letter } from '../store/schema';
import { letterText } from './letters';

type Props = {
  /** The bell; null — closed. */
  readonly anchor: HTMLElement | null;
  /** Opened from the keyboard: focus goes to the first letter. */
  readonly focusFirst: boolean;
  readonly letters: readonly Letter[];
  readonly plan: Plan;
  readonly today: string;
  readonly deemphasizeNumbers: boolean;
  readonly onClose: () => void;
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
  readonly onRead: (ids: readonly string[]) => void;
  readonly onAskKiki: () => void;
  readonly onDownload: () => void;
};

const MARGIN = 12;
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const localDay = (date: Date) =>
  `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function when(iso: string, today: string): string {
  const at = new Date(iso);
  const day = localDay(at);
  const yesterday = localDay(new Date(new Date(`${today}T12:00:00`).getTime() - 86_400_000));
  if (day === today) return fill(menu.news.today, { time: timeFormat.format(at) });
  if (day === yesterday) return fill(menu.news.yesterday, { time: timeFormat.format(at) });
  return dateFormat.format(at);
}

/** «**bold**» inside a line. */
function inline(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

/** The letters' little Markdown: paragraphs, «- » lists and bold. */
function body(text: string): ReactNode {
  return text.split(/\n{2,}/).map((block, i) => {
    const lines = block.split('\n');
    if (lines.every((line) => line.startsWith('- ')))
      return (
        <ul key={i}>
          {lines.map((line, j) => (
            <li key={j}>{inline(line.slice(2))}</li>
          ))}
        </ul>
      );
    return <p key={i}>{inline(block)}</p>;
  });
}

/**
 * «Новости от Кики» (ТЗ фаза 4 §11, mockup): the black rounded panel under the bell — «Кики» in the accent, a glass
 * spiral over its corner, the letters as a list (a white dot — unread). A letter opens in place: its picture, text and
 * actions, «Назад». It opens on hover (with intent) and stays while hovered or focused; a click pins it.
 */
export function NewsPanel(props: Props) {
  return createPortal(
    <AnimatePresence>
      {props.anchor ? <PanelBody key="news" {...props} anchor={props.anchor} /> : null}
    </AnimatePresence>,
    document.querySelector('.menu-scene') ?? document.body,
  );
}

function PanelBody({
  anchor,
  focusFirst,
  letters,
  plan,
  today,
  deemphasizeNumbers,
  onClose,
  onPointerEnter,
  onPointerLeave,
  onRead,
  onAskKiki,
  onDownload,
}: Props & { readonly anchor: HTMLElement }) {
  const calm = useCalmMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ right: number; top: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const newest = [...letters].reverse();
  const open = letters.find((l) => l.id === openId) ?? null;
  const cover = LETTER_PICTURES[((open ?? newest[0])?.image ?? 1) - 1];

  // Under the bell, right edges aligned; placed again when the window changes.
  useLayoutEffect(() => {
    const placeIt = () => {
      const a = anchor.getBoundingClientRect();
      setPlace({ right: Math.max(MARGIN, window.innerWidth - a.right), top: a.bottom + MARGIN });
    };
    placeIt();
    window.addEventListener('resize', placeIt);
    return () => {
      window.removeEventListener('resize', placeIt);
    };
  }, [anchor]);

  // The panel keeps the height it opened with: list ↔ letter swap inside it (a longer letter scrolls) instead of the
  // black panel jumping by a few lines at every switch. The CSS max-height still caps it on short windows.
  useLayoutEffect(() => {
    const panel = ref.current;
    if (panel) panel.style.height = `${String(panel.offsetHeight)}px`;
  }, []);

  useEffect(() => {
    if (place && focusFirst)
      ref.current
        ?.querySelector<HTMLElement>('.news-item, .news-back')
        ?.focus({ preventScroll: true });
  }, [place, focusFirst]);

  // Esc closes and gives the focus back to the bell; a press outside closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (openId) setOpenId(null);
      else {
        onClose();
        anchor.focus({ preventScroll: true });
      }
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchor, onClose, openId]);

  const read = (letter: Letter) => {
    setOpenId(letter.id);
    if (!letter.read) onRead([letter.id]);
  };

  const onListKey = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('.news-item')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const unread = letters.filter((l) => !l.read).map((l) => l.id);
  const slide = calm ? 0 : 16;

  return (
    <m.div
      ref={ref}
      id="menu-news"
      className="news"
      role="dialog"
      aria-label={menu.news.label}
      style={place ? { right: place.right, top: place.top } : { visibility: 'hidden' }}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') onPointerEnter();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') onPointerLeave();
      }}
      initial={calm ? { opacity: 0 } : { opacity: 0, scale: MENU.popover.scaleFrom }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } }}
      exit={{
        opacity: 0,
        scale: calm ? 1 : MENU.popover.scaleFrom,
        transition: { duration: 0.12 },
      }}
    >
      {cover ? <Pic picture={cover} alt="" className="news-art" /> : null}
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <m.article
            key={open.id}
            className="news-view news-letter"
            initial={{ opacity: 0, x: slide }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, x: slide, transition: { duration: 0.12 } }}
          >
            <button
              type="button"
              className="news-back"
              onClick={() => {
                setOpenId(null);
              }}
            >
              <IconChevronLeft stroke={2.2} aria-hidden />
              {menu.news.back}
            </button>
            <LetterView
              letter={open}
              plan={plan}
              today={today}
              deemphasizeNumbers={deemphasizeNumbers}
            />
            <div className="news-actions">
              <button type="button" className="news-action news-action--main" onClick={onClose}>
                {menu.news.openMenu}
              </button>
              <button type="button" className="news-action" onClick={onAskKiki}>
                {menu.news.askKiki}
              </button>
              {open.kind === 'localOnly' || open.kind === 'welcome' ? (
                <button type="button" className="news-action" onClick={onDownload}>
                  {menu.news.download}
                </button>
              ) : null}
            </div>
          </m.article>
        ) : (
          <m.div
            key="list"
            className="news-view"
            initial={{ opacity: 0, x: -slide }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, x: -slide, transition: { duration: 0.12 } }}
          >
            <h2 className="news-title">
              {menu.news.title} <span>{menu.news.titleName}</span>
            </h2>
            {newest.length === 0 ? (
              <p className="news-empty">{menu.news.empty}</p>
            ) : (
              <ul className="news-list" onKeyDown={onListKey}>
                {newest.map((letter) => {
                  const text = letterText(letter, plan, deemphasizeNumbers, today);
                  return (
                    <li key={letter.id}>
                      <button
                        type="button"
                        className="news-item"
                        data-unread={!letter.read || undefined}
                        onClick={() => {
                          read(letter);
                        }}
                      >
                        <span className="news-dot" aria-hidden />
                        <span className="news-item-text">
                          <span className="news-item-title">
                            {text.title}
                            {letter.read ? null : (
                              <span className="visually-hidden">, {menu.news.unread}</span>
                            )}
                          </span>
                          <span className="news-item-preview">{text.preview}</span>
                          <span className="news-item-time">{when(letter.at, today)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {unread.length > 0 ? (
              <button
                type="button"
                className="news-read-all"
                onClick={() => {
                  onRead(unread);
                }}
              >
                {menu.news.readAll}
              </button>
            ) : null}
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

function LetterView({
  letter,
  plan,
  today,
  deemphasizeNumbers,
}: {
  readonly letter: Letter;
  readonly plan: Plan;
  readonly today: string;
  readonly deemphasizeNumbers: boolean;
}) {
  const text = letterText(letter, plan, deemphasizeNumbers, today);
  return (
    <Fragment>
      <h3 className="news-letter-title">{text.title}</h3>
      <p className="news-item-time">{when(letter.at, today)}</p>
      <div className="news-letter-body">{body(text.body)}</div>
    </Fragment>
  );
}
