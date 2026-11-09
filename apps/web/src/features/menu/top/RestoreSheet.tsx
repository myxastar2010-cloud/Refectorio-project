import { m } from 'motion/react';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import { Sheet } from '../components/Sheet';
import { rangeLabel } from '../export/model';
import type { parseBackup } from '../store/store';

type Backup = Extract<ReturnType<typeof parseBackup>, { ok: true }>['backup'];

type Props = {
  readonly anchor: HTMLElement | null;
  readonly backup: Backup | null;
  readonly onClose: () => void;
  readonly onApply: () => void;
};

/**
 * «Загрузить меню из файла» (ТЗ фаза 4 §10.4, decision 2): what the checked file holds — its date, the menu's days, the
 * marks — and a plain warning before it replaces the data of this browser.
 */
export function RestoreSheet({ anchor, backup, onClose, onApply }: Props) {
  return (
    <Sheet
      anchor={backup ? anchor : null}
      name="restore"
      className="restore-sheet"
      onClose={onClose}
    >
      {(reveal) => {
        if (!backup) return null;
        const { plan, tracking } = backup.data;
        const marks = Object.values(tracking.days).reduce(
          (n, day) => n + Object.keys(day.eaten).length,
          0,
        );
        const saved = new Date(backup.exportedAt);
        return (
          <div className="goal">
            <m.h2 id="restore-title" className="goal-title" {...reveal(0)}>
              {menu.restore.title}
            </m.h2>
            <m.ul className="restore-facts" {...reveal(1)}>
              <li>
                {fill(menu.restore.summary, {
                  date: Number.isNaN(saved.getTime())
                    ? backup.exportedAt
                    : saved.toLocaleDateString('ru-RU'),
                })}
              </li>
              <li>
                {fill(menu.restore.plan, {
                  range: rangeLabel(plan.current.createdAt, plan.current.horizonEnd),
                })}
              </li>
              <li>{fill(menu.restore.marks, { n: marks })}</li>
            </m.ul>
            <m.p className="goal-note" {...reveal(2)}>
              {menu.restore.warning}
            </m.p>
            <m.div className="goal-actions" {...reveal(3)}>
              <button type="button" className="goal-apply" onClick={onApply}>
                {menu.restore.apply}
              </button>
              <button type="button" className="goal-cancel" data-autofocus onClick={onClose}>
                {menu.restore.cancel}
              </button>
            </m.div>
          </div>
        );
      }}
    </Sheet>
  );
}
