import { IconX } from '@tabler/icons-react';
import { AnimatePresence, m, usePresence } from 'motion/react';
import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { site } from '../../content/site.ru';
import { useViewport } from '../../lib/useViewport';
import { useCalmMotion } from '../../motion/hooks';
import { DIALOG, DURATION, EASE_OUT_SOFT, SPRING } from '../../motion/tokens';
import { useWave } from '../../motion/useWave';
import { WaveLayer } from '../../motion/WaveHover';
import { TeamDialogSurface } from './TeamSurface';
import { useCornerMorph } from './useCornerMorph';
import { Lines } from '../../components/Lines';

type Props = {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The team icon the card flies from and back to. */
  readonly tileRef: RefObject<HTMLElement | null>;
  /** The card has landed back on the icon after closing. */
  readonly onLanded: () => void;
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Expanded team card (ТЗ 6.4): role="dialog", aria-modal, focus trap, Esc / ✕ / click outside close it.
 * The rest of the page is made inert by the App while the dialog is open.
 */
export function TeamDialog({ open, onClose, tileRef, onLanded }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <DialogBody key="team-dialog" onClose={onClose} tileRef={tileRef} onLanded={onLanded} />
      )}
    </AnimatePresence>
  );
}

type BodyProps = Omit<Props, 'open'>;

function DialogBody({ onClose, tileRef, onLanded }: BodyProps) {
  const [present, safeToRemove] = usePresence();
  const calm = useCalmMotion();
  const viewport = useViewport();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLPictureElement>(null);
  const close = useWave<HTMLButtonElement>();
  const { teamDialog } = site;

  const radii = {
    tilePx:
      DIALOG.tileRadius * (viewport.phone ? viewport.width / DIALOG.phoneFrameWidth : viewport.s),
    dialogPx: viewport.phone ? DIALOG.phoneDialogRadiusPx : DIALOG.dialogRadius * viewport.sd,
  };
  useCornerMorph({
    surface: surfaceRef,
    logo: logoRef,
    tile: tileRef,
    present,
    calm,
    radii,
    onLanded,
    onDone: () => {
      safeToRemove?.();
    },
  });

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

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
  const content = (index: number) => {
    const delay = reveal + (index * DIALOG.contentStaggerMs) / 1000;
    return {
      initial: { opacity: 0, transform: `translate3d(0px, ${calm ? 0 : 16}px, 0px)` },
      animate: {
        opacity: 1,
        transform: 'translate3d(0px, 0px, 0px)',
        transition: calm
          ? { duration: DURATION.fade }
          : {
              default: { ...SPRING.dialogContent, delay },
              opacity: { duration: 0.35, ease: EASE_OUT_SOFT, delay },
            },
      },
      exit: { opacity: 0, transition: { duration: DURATION.micro } },
    };
  };

  return (
    // While the card flies back, the dialog is already gone for keyboards and screen readers.
    <div className="team-dialog-root" inert={!present}>
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
        <TeamDialogSurface surfaceRef={surfaceRef} logoRef={logoRef} radiusPx={radii.dialogPx} />
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
  );
}
