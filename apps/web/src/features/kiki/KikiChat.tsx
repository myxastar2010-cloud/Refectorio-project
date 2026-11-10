import '../../styles/kiki-chat.css';
import {
  IconArrowUp,
  IconCopy,
  IconDots,
  IconPlayerStopFilled,
  IconPlus,
  IconRefresh,
} from '@tabler/icons-react';
import type { OpenUi } from '@refectorio/kiki-core';
import clsx from 'clsx';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { kiki } from '../../content/kiki.ru';
import { menu } from '../../content/menu.ru';
import { fill } from '../../lib/format';
import type { Catalog } from '../menu/data/catalog';
import type { Notify } from '../menu/notify';
import { Pic } from '../menu/components/Pic';
import { QUICK } from '../menu/data/pictures';
import { applyPreview, chatSession, chatUi, setAnnouncer, useChat, warmKiki } from './chat';
import { Markdown } from './Markdown';
import { PreviewOverlay } from './PreviewOverlay';
import type { ChatItem, PreviewRecord } from './session';
import { Thinking } from './Thinking';

type Props = {
  readonly catalog: Catalog | null;
  readonly deemphasizeNumbers: boolean;
  readonly hasMenu: boolean;
  readonly selectedDate: string;
  readonly today: string;
  /** Short suggestions from the person's plan (the empty state). */
  readonly suggestions: readonly string[];
  readonly onOpen: (ui: OpenUi) => void;
  readonly onNotify: Notify;
  /** A request to send as soon as the chat is ready («Заменить с ИИ»). */
  readonly request?: { readonly text: string; readonly key: number } | null;
};

const MAX_LINES = 6;

function errorText(item: Extract<ChatItem, { kind: 'error' }>): string {
  switch (item.code) {
    case 'offline':
      return kiki.errors.offline;
    case 'stopped':
      return kiki.stopped;
    case 'rate_limited':
      return fill(kiki.errors.rateLimited, {
        min: Math.max(1, Math.ceil((item.retryAfterMs ?? 60_000) / 60_000)),
      });
    case 'provider_unavailable':
    case 'timeout':
      return kiki.errors.unavailable;
    default:
      return kiki.errors.generic;
  }
}

/**
 * Kiki's chat (ТЗ 07 §10): the conversation, the thinking state, chips, buttons and proposal cards, the quick cards and
 * the composer. The log fades under the panel's header; it follows new text unless the person scrolled up (then a
 * «Новое сообщение» button). Streaming is announced politely, sentence by sentence.
 */
export function KikiChat({
  catalog,
  deemphasizeNumbers,
  hasMenu,
  selectedDate,
  today,
  suggestions,
  onOpen,
  onNotify,
  request,
}: Props) {
  const chat = useChat();
  const session = chatSession();
  const [draft, setDraft] = useState('');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [overlay, setOverlay] = useState<PreviewRecord | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [highlightAttach, setHighlightAttach] = useState(false);
  const [spoken, setSpoken] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const lastRequest = useRef<number | null>(null);

  useEffect(() => {
    warmKiki();
    setAnnouncer(setSpoken);
    return () => {
      setAnnouncer(null);
    };
  }, []);
  useEffect(() => {
    chatUi.selectedDate = selectedDate;
    chatUi.today = today;
  }, [selectedDate, today]);
  useEffect(() => {
    const on = () => {
      setOnline(true);
    };
    const off = () => {
      setOnline(false);
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Follow the conversation unless the person scrolled up to read.
  useLayoutEffect(() => {
    const el = log.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else setUnseen(true);
  }, [chat.items.length, chat.busy?.text, chat.busy?.phase]);
  const onScroll = () => {
    const el = log.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (stick.current) setUnseen(false);
  };
  const toBottom = () => {
    const el = log.current;
    if (!el) return;
    stick.current = true;
    setUnseen(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  // Autosize the composer up to six lines.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_LINES)}px`;
  }, [draft]);

  const send = useCallback(
    (text: string): Promise<void> => {
      const clean = text.trim();
      if (!clean || session.get().busy) return Promise.resolve();
      stick.current = true;
      setDraft('');
      return session.send(clean);
    },
    [session],
  );

  useEffect(() => {
    if (request && request.key !== lastRequest.current && hasMenu) {
      lastRequest.current = request.key;
      // The slot of «Заменить с ИИ» belongs to this one turn.
      void send(request.text).finally(() => {
        chatUi.replaceSlot = undefined;
      });
    }
  }, [request, hasMenu, send]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  const busy = chat.busy;
  const lastKiki = [...chat.items].reverse().find((i) => i.kind === 'kiki');
  const empty = chat.items.length === 0 && !busy;
  const disabled = !online || !hasMenu;

  const apply = async (record: PreviewRecord) => {
    setOverlay(null);
    const outcome = await applyPreview(record, onNotify);
    if (outcome === 'applied') session.settle(record.id, 'applied', kiki.preview.applied);
    else onNotify(kiki.preview.failed);
  };
  const dismiss = (record: PreviewRecord) => {
    setOverlay(null);
    session.settle(record.id, 'dismissed', kiki.preview.dismissed);
  };

  return (
    <div className="kiki-chat">
      <div className="kiki-more-wrap">
        <button
          type="button"
          className="kiki-more"
          aria-label={kiki.more}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((v) => !v);
            setConfirming(false);
          }}
        >
          <IconDots stroke={2} aria-hidden />
        </button>
        {menuOpen ? (
          <div className="kiki-more-menu" role="menu" aria-label={kiki.more}>
            {confirming ? (
              <div className="kiki-confirm" role="group" aria-label={kiki.clearConfirm.title}>
                <p>
                  <strong>{kiki.clearConfirm.title}</strong> {kiki.clearConfirm.body}
                </p>
                <div>
                  <button
                    type="button"
                    role="menuitem"
                    className="kiki-button kiki-button--small"
                    onClick={() => {
                      session.clear();
                      setMenuOpen(false);
                      setConfirming(false);
                      onNotify(kiki.cleared);
                    }}
                  >
                    {kiki.clearConfirm.yes}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="kiki-button kiki-button--ghost kiki-button--small"
                    // The safe choice takes the focus (as the menu's other confirmations).
                    autoFocus
                    onClick={() => {
                      setConfirming(false);
                      setMenuOpen(false);
                    }}
                  >
                    {kiki.clearConfirm.no}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="kiki-more-item"
                autoFocus
                disabled={chat.items.length === 0}
                onClick={() => {
                  setConfirming(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setMenuOpen(false);
                }}
              >
                {kiki.clear}
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="kiki-log" ref={log} onScroll={onScroll} aria-label={kiki.log} tabIndex={-1}>
        {empty ? (
          <div className="kiki-empty">
            <p className="kiki-greeting">{hasMenu ? kiki.greeting : kiki.errors.noMenu}</p>
            {hasMenu && suggestions.length > 0 ? (
              <div className="kiki-suggestions" aria-label={kiki.suggestionsLabel} role="group">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="kiki-chip"
                    onClick={() => {
                      setDraft(s);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="kiki-privacy">{kiki.privacy}</p>
          </div>
        ) : null}
        <ol className="kiki-messages">
          {chat.items.map((item) => (
            <Message
              key={item.id}
              item={item}
              previews={chat.previews}
              latest={item === lastKiki}
              busy={busy !== null}
              onPick={(option) => {
                void session.pick(item.id, option);
              }}
              onRetry={() => {
                void session.retry(item.id);
              }}
              onOpen={onOpen}
              onPreview={setOverlay}
              onNotify={onNotify}
            />
          ))}
          {busy ? (
            <li className="kiki-msg kiki-msg--kiki kiki-msg--live">
              {busy.text ? (
                <div className="kiki-text">
                  <Markdown text={busy.text} />
                </div>
              ) : null}
              <Thinking busy={busy} />
            </li>
          ) : null}
        </ol>
      </div>
      <div className="kiki-sr" role="status" aria-live="polite">
        {spoken}
      </div>
      {unseen ? (
        <button type="button" className="kiki-new" onClick={toBottom}>
          {kiki.newMessage}
        </button>
      ) : null}

      {draft.trim() === '' && !busy ? (
        <ul className="kiki-quick">
          {menu.kiki.quick.map((card, index) => {
            const picture = QUICK[index];
            return (
              <li key={card.image}>
                <button
                  type="button"
                  className="kiki-quick-card"
                  aria-label={card.label}
                  disabled={disabled}
                  onClick={() => {
                    setDraft(card.label);
                    setHighlightAttach(card.image === 'labs');
                    input.current?.focus();
                  }}
                >
                  {picture ? <Pic picture={picture} alt="" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!online ? <p className="kiki-offline">{kiki.errors.offline}</p> : null}
      <form
        className="kiki-input"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <button
          type="button"
          className={clsx('kiki-attach', highlightAttach && 'is-highlighted')}
          aria-label={menu.kiki.attach}
          onClick={() => {
            setHighlightAttach(false);
            onNotify(menu.demoSoon);
          }}
        >
          <IconPlus stroke={2} aria-hidden />
        </button>
        <textarea
          ref={input}
          rows={1}
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={menu.kiki.placeholder}
          aria-label={menu.kiki.placeholder}
          enterKeyHint="send"
          maxLength={4000}
        />
        {busy ? (
          <button
            type="button"
            className="kiki-send kiki-send--stop"
            aria-label={kiki.stop}
            onClick={() => {
              session.stop();
            }}
          >
            <IconPlayerStopFilled aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            className="kiki-send"
            aria-label={menu.kiki.send}
            disabled={disabled || draft.trim() === ''}
          >
            <IconArrowUp stroke={2.4} aria-hidden />
          </button>
        )}
      </form>

      {overlay ? (
        <PreviewOverlay
          record={chat.previews[overlay.id] ?? overlay}
          catalog={catalog}
          deemphasizeNumbers={deemphasizeNumbers}
          onApply={() => {
            void apply(chat.previews[overlay.id] ?? overlay);
          }}
          onDismiss={() => {
            dismiss(overlay);
          }}
          onClose={() => {
            setOverlay(null);
          }}
        />
      ) : null}
    </div>
  );
}

type MessageProps = {
  readonly item: ChatItem;
  readonly previews: Readonly<Record<string, PreviewRecord>>;
  readonly latest: boolean;
  readonly busy: boolean;
  readonly onPick: (option: string) => void;
  readonly onRetry: () => void;
  readonly onOpen: (ui: OpenUi) => void;
  readonly onPreview: (record: PreviewRecord) => void;
  readonly onNotify: Notify;
};

function Message({
  item,
  previews,
  latest,
  busy,
  onPick,
  onRetry,
  onOpen,
  onPreview,
  onNotify,
}: MessageProps) {
  switch (item.kind) {
    case 'user':
      return (
        <li className="kiki-msg kiki-msg--user">
          <span className="kiki-sr">{kiki.you}: </span>
          <p className="kiki-bubble">{item.text}</p>
        </li>
      );
    case 'note':
      return <li className="kiki-msg kiki-msg--note">{item.text}</li>;
    case 'error':
      return (
        <li className="kiki-msg kiki-msg--error">
          <p>{errorText(item)}</p>
          {item.retry ? (
            <button type="button" className="kiki-link" onClick={onRetry} disabled={busy}>
              <IconRefresh stroke={2} aria-hidden /> {kiki.retry}
            </button>
          ) : null}
        </li>
      );
    case 'kiki':
      return (
        <li className="kiki-msg kiki-msg--kiki">
          <span className="kiki-sr">{menu.kiki.name}: </span>
          <div className="kiki-text">
            <Markdown text={item.text} />
          </div>
          {item.replaced ? <span className="kiki-corrected">{kiki.corrected}</span> : null}
          {(item.previews ?? []).map((id) => {
            const record = previews[id];
            if (!record) return null;
            return (
              <button
                key={id}
                type="button"
                className={clsx('kiki-card', record.status !== 'pending' && 'is-settled')}
                onClick={() => {
                  onPreview(record);
                }}
              >
                <span className="kiki-card-title">{kiki.preview.pill[record.kind]}</span>
                <span className="kiki-card-open">
                  {record.status === 'applied'
                    ? kiki.preview.applied
                    : record.status === 'dismissed'
                      ? kiki.preview.dismissed
                      : kiki.preview.open}
                </span>
              </button>
            );
          })}
          {item.choice && latest && !item.choice.picked ? (
            <div className="kiki-choices" role="group" aria-label={item.choice.question}>
              {item.choice.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="kiki-chip"
                  disabled={busy}
                  onClick={() => {
                    onPick(option);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
          {(item.buttons ?? []).map((ui) => (
            <button
              key={`${ui.target}-${ui.id ?? ''}`}
              type="button"
              className="kiki-chip kiki-chip--open"
              onClick={() => {
                onOpen(ui);
              }}
            >
              {kiki.open[ui.target]}
            </button>
          ))}
          <div className="kiki-tools">
            <button
              type="button"
              className="kiki-tool"
              aria-label={kiki.copy}
              onClick={() => {
                void navigator.clipboard
                  .writeText(item.text)
                  .then(() => {
                    onNotify(kiki.copied);
                  })
                  .catch(() => {});
              }}
            >
              <IconCopy stroke={2} aria-hidden />
            </button>
          </div>
        </li>
      );
  }
}
