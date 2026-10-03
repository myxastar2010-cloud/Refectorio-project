import { IconX } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { site } from '../../content/site.ru';
import { useCalmMotion } from '../../motion/hooks';
import { DIALOG, DURATION, SPRING } from '../../motion/tokens';
import { useWave } from '../../motion/useWave';
import { WaveLayer } from '../../motion/WaveHover';
import { TeamSurface } from './TeamSurface';
import { Lines } from '../../components/Lines';

type Props = {
  readonly open: boolean;
  readonly onClose: () => void;
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Expanded team card (ТЗ 6.4): role="dialog", aria-modal, focus trap, Esc / ✕ / click outside close it.
 * The rest of the page is made inert by the App while the dialog is open.
 */
export function TeamDialog({ open, onClose }: Props) {
  const calm = useCalmMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useWave<HTMLButtonElement>();
  const { teamDialog } = site;

  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true });
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const reveal = calm ? 0 : SPRING.expand.visualDuration * DIALOG.contentRevealAt;
  const content = (index: number) => ({
    initial: { opacity: 0, y: calm ? 0 : 12 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: calm ? DURATION.fade : 0.35,
        delay: reveal + (index * DIALOG.contentStaggerMs) / 1000,
      },
    },
    exit: { opacity: 0, transition: { duration: DURATION.micro } },
  });

  return (
    <AnimatePresence>
      {open && (
        <div className="team-dialog-root" key="team-dialog">
          <m.div
            className="team-scrim"
            aria-hidden
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DURATION.scrim } }}
            exit={{ opacity: 0, transition: { duration: DURATION.scrim } }}
          />
          <div
            ref={dialogRef}
            className="team-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-dialog-title"
            onKeyDown={onKeyDown}
          >
            <TeamSurface mode="dialog" still={false} />
            <div className="team-dialog-content">
              <m.h2 id="team-dialog-title" className="dialog-title" {...content(0)}>
                <Lines lines={teamDialog.nameLines} />
              </m.h2>
              <m.p className="dialog-lead" {...content(1)}>
                <Lines lines={teamDialog.leadLines} />
              </m.p>
              <m.ul className="dialog-members" aria-label={teamDialog.membersLabel} {...content(2)}>
                {teamDialog.members.flatMap((column, columnIndex) =>
                  column.map((name, rowIndex) => (
                    <li
                      key={name}
                      className="dialog-member"
                      style={{ gridColumn: columnIndex + 1, gridRow: rowIndex + 1 }}
                    >
                      {name}
                    </li>
                  )),
                )}
              </m.ul>
              <m.div className="dialog-close-slot" {...content(3)}>
                <button
                  ref={(node) => {
                    closeRef.current = node;
                    close.setHost(node);
                  }}
                  type="button"
                  className="dialog-close wave-host focus-ring-inverse"
                  aria-label={teamDialog.close}
                  onClick={onClose}
                  {...close.handlers}
                >
                  <IconX aria-hidden className="dialog-close-icon" stroke={2} />
                  <WaveLayer clipPath={close.clipPath} className="wave-layer--light">
                    <IconX aria-hidden className="dialog-close-icon" stroke={2} />
                  </WaveLayer>
                </button>
              </m.div>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
