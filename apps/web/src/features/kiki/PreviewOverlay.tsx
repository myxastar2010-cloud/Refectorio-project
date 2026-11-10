import { IconX } from '@tabler/icons-react';
import type { PlannedItem } from '@refectorio/menu-core';
import { useEffect, useRef, useState } from 'react';
import { kiki } from '../../content/kiki.ru';
import { menu } from '../../content/menu.ru';
import { fill, formatWhole } from '../../lib/format';
import type { Catalog } from '../menu/data/catalog';
import { isStale, previewPlan, type ComputedPreview } from './chat';
import type { PreviewRecord } from './session';

type Props = {
  readonly record: PreviewRecord;
  readonly catalog: Catalog | null;
  readonly deemphasizeNumbers: boolean;
  readonly onApply: () => void;
  readonly onDismiss: () => void;
  readonly onClose: () => void;
};

/** «Вторник, 10 ноября». */
function dayTitle(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${menu.week.weekdaysLong[(d.getDay() + 6) % 7] ?? ''}, ${d.getDate()} ${menu.week.monthsGenitive[d.getMonth()] ?? ''}`;
}

/** Longer than the exit animation (0.22 s): the hand-over never waits on an animation that did not run. */
const EXIT_FALLBACK_MS = 400;

const grams = (item: PlannedItem) => `${formatWhole(item.grams)} ${menu.units.g}`;

/**
 * A proposal as a week of changes (ТЗ 07 §7): only the changed days, every meal with its dishes — new ones outlined in
 * the accent, removed ones struck and faded — the day's kcal before → after (hidden with `deemphasizeNumbers`), the
 * rules in plain words; «Применить» / «Отменить». A native modal <dialog>: focus stays inside, Esc closes, the page
 * behind is inert.
 */
export function PreviewOverlay({
  record,
  catalog,
  deemphasizeNumbers,
  onApply,
  onDismiss,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [computed, setComputed] = useState<ComputedPreview | null>(null);
  const [stale, setStale] = useState(() => isStale(record));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => {
      d?.close();
    };
  }, []);

  // Leaving plays the exit (kiki-chat.css, `[data-closing]`) and then hands over; a timer covers a skipped animation.
  const leaving = useRef(false);
  const leave = (then: () => void) => {
    const d = dialog.current;
    if (leaving.current) return;
    leaving.current = true;
    if (!d) {
      then();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      then();
    };
    d.addEventListener(
      'animationend',
      (event) => {
        if (event.target === d) finish();
      },
      { once: true },
    );
    window.setTimeout(finish, EXIT_FALLBACK_MS);
    d.dataset.closing = '';
  };

  useEffect(() => {
    let alive = true;
    void previewPlan(record).then((p) => {
      if (!alive) return;
      setComputed(p);
      setFailed(p === null);
    });
    return () => {
      alive = false;
    };
  }, [record, stale]);

  const name = (id: string) => catalog?.get(id)?.nameRu ?? id;
  const mealTitle = (mealId: string) =>
    plan?.structure.find((m) => m.id === mealId)?.titleRu ?? mealId;
  const plan = computed?.plan ?? null;
  // The fresh diff (a recomputed proposal) wins over the one stored with the message.
  const fresh = computed?.diff;
  const days = fresh
    ? fresh.days.map((d) => ({
        date: d.date,
        weekday: '',
        kcalBefore: d.totalsBefore?.energyKcal ?? null,
        kcalAfter: d.totalsAfter?.energyKcal ?? null,
      }))
    : record.stats.days;
  const mealChanges = fresh
    ? fresh.days.flatMap((d) =>
        d.meals
          .filter((m) => m.added.length > 0 || m.removed.length > 0)
          .map((m) => ({
            date: d.date,
            mealId: m.mealId,
            addedIds: m.added,
            removedIds: m.removed,
          })),
      )
    : record.mealChanges;

  return (
    <dialog
      ref={dialog}
      className="kiki-preview"
      aria-labelledby={`${record.id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        leave(onClose);
      }}
      onClick={(event) => {
        if (event.target === dialog.current) leave(onClose);
      }}
    >
      <div className="kiki-preview-sheet">
        <header className="kiki-preview-head">
          <span className="kiki-pill">{kiki.preview.pill[record.kind]}</span>
          <h2 id={`${record.id}-title`}>{kiki.preview.title}</h2>
          <button
            type="button"
            className="kiki-preview-close"
            aria-label={kiki.preview.close}
            onClick={() => {
              leave(onClose);
            }}
          >
            <IconX stroke={2} aria-hidden />
          </button>
        </header>

        {/* Scrolls with the keyboard too (a focusable region, named by the title). */}
        <div
          className="kiki-preview-body"
          tabIndex={0}
          role="region"
          aria-labelledby={`${record.id}-title`}
        >
          {record.rulesAdded.length > 0 || record.rulesRemoved.length > 0 ? (
            <section className="kiki-preview-rules">
              <h3>{kiki.preview.rules}</h3>
              <ul>
                {record.rulesAdded.map((r) => (
                  <li key={`+${r}`}>{r}</li>
                ))}
                {record.rulesRemoved.map((r) => (
                  <li key={`-${r}`} className="is-removed">
                    {kiki.preview.rulesRemoved}: {r}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {record.stats.targets && !deemphasizeNumbers ? (
            <section className="kiki-preview-rules">
              <h3>{kiki.preview.targets}</h3>
              <p>
                {fill(kiki.preview.kcal, {
                  before: formatWhole(record.stats.targets.kcalBefore),
                  after: formatWhole(record.stats.targets.kcalAfter),
                })}
                {' · '}
                {fill(kiki.preview.protein, {
                  before: formatWhole(record.stats.targets.proteinBefore),
                  after: formatWhole(record.stats.targets.proteinAfter),
                })}
              </p>
            </section>
          ) : null}

          {stale ? (
            <p className="kiki-preview-stale">
              {kiki.preview.stale}{' '}
              <button
                type="button"
                className="kiki-link"
                onClick={() => {
                  setStale(false);
                }}
              >
                {kiki.preview.recompute}
              </button>
            </p>
          ) : null}
          {failed ? <p className="kiki-preview-stale">{kiki.preview.failed}</p> : null}

          {days.length === 0 ? <p>{kiki.preview.noChanges}</p> : null}
          <ol className="kiki-preview-days">
            {days.map((day) => {
              const planned = plan?.days.find((d) => d.date === day.date);
              const changes = mealChanges.filter((c) => c.date === day.date);
              return (
                <li key={day.date} className="kiki-preview-day">
                  <div className="kiki-preview-day-head">
                    <h3>{dayTitle(day.date)}</h3>
                    {!deemphasizeNumbers && day.kcalBefore != null && day.kcalAfter != null ? (
                      <span className="kiki-preview-kcal">
                        {fill(kiki.preview.dayKcal, {
                          before: formatWhole(day.kcalBefore),
                          after: formatWhole(day.kcalAfter),
                        })}
                      </span>
                    ) : null}
                  </div>
                  {changes.map((change) => (
                    <div key={change.mealId} className="kiki-preview-meal">
                      <p className="kiki-preview-meal-title">{mealTitle(change.mealId)}</p>
                      <ul>
                        {(planned?.meals[change.mealId] ?? []).map((item) => {
                          const added = change.addedIds.includes(item.itemId);
                          return (
                            <li key={item.itemId} className={added ? 'is-added' : undefined}>
                              <span>{name(item.itemId)}</span>
                              {!deemphasizeNumbers ? (
                                <span className="kiki-badge">{grams(item)}</span>
                              ) : null}
                              {added ? (
                                <span className="kiki-tag">{kiki.preview.added}</span>
                              ) : null}
                            </li>
                          );
                        })}
                        {change.removedIds.map((id) => (
                          <li key={`-${id}`} className="is-removed">
                            <s>{name(id)}</s>
                            <span className="kiki-tag">{kiki.preview.removed}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </li>
              );
            })}
          </ol>
        </div>

        <footer className="kiki-preview-actions">
          <button
            type="button"
            className="kiki-button kiki-button--ghost"
            onClick={() => {
              leave(onDismiss);
            }}
          >
            {kiki.preview.cancel}
          </button>
          <button
            type="button"
            className="kiki-button"
            onClick={() => {
              leave(onApply);
            }}
            disabled={failed}
          >
            {kiki.preview.apply}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
