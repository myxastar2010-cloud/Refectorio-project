import { IconInfoCircle } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { menu } from '../../../content/menu.ru';
import { useCalmMotion } from '../../../motion/hooks';
import type { Notice } from './noticeRules';
import { focusQuietly } from '../../../lib/quietFocus';

type Props = {
  readonly notices: readonly Notice[];
  readonly onDownload: () => void;
  readonly onClose: (id: string) => void;
};

export function Notices({ notices, onDownload, onClose }: Props) {
  const calm = useCalmMotion();
  const notice = notices[0];
  return (
    <div className="menu-notices" role="region" aria-label={menu.notices.label} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {notice ? (
          <m.div
            key={notice.id}
            className="menu-notice"
            data-kind={notice.id}
            initial={{ opacity: 0, y: calm ? 0 : -6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.24 } }}
            exit={{ opacity: 0, transition: { duration: 0.14 } }}
          >
            <IconInfoCircle stroke={1.8} aria-hidden />
            <p>{notice.text}</p>
            <div className="menu-notice-actions">
              {notice.download ? (
                <button type="button" className="menu-notice-button" onClick={onDownload}>
                  {menu.notices.download}
                </button>
              ) : null}
              {notice.id === 'volatile' ? null : (
                <button
                  type="button"
                  className="menu-notice-button menu-notice-button--ghost"
                  onClick={() => {
                    // The notice goes away: the focus moves on to the week (what follows it), not to the page's start.
                    focusQuietly(
                      document.querySelector<HTMLElement>('.day-pill[aria-selected="true"]'),
                    );
                    onClose(notice.id);
                  }}
                >
                  {menu.notices.ok}
                </button>
              )}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
