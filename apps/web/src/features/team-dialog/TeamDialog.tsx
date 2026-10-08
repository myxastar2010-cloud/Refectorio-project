import { IconX } from '@tabler/icons-react';
import { AnimatePresence, m, usePresence, type MotionStyle } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { site } from '../../content/site.ru';
import { focusQuietly } from '../../lib/quietFocus';
import { useCalmMotion } from '../../motion/hooks';
import { DIALOG, DURATION, EASE_OUT_SOFT, SPRING } from '../../motion/tokens';
import { useWave } from '../../motion/useWave';
import { WaveLayer } from '../../motion/WaveHover';
import { TeamDialogSurface } from './TeamSurface';
import { NameFlip } from './NameFlip';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLImageElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const close = useWave<HTMLButtonElement>();
  const [revealed, setRevealed] = useState(false);
  const { teamDialog } = site;
  // The names fill the columns top to bottom: as many rows as the longest column.
  const memberRows = Math.max(...teamDialog.members.map((column) => column.length));

  useCornerMorph({
    surface: surfaceRef,
    picture: pictureRef,
    logo: logoRef,
    tile: tileRef,
    present,
    calm,
    onReveal: () => {
      setRevealed(true);
    },
    onLanded,
    onDone: () => {
      safeToRemove?.();
    },
  });

  useEffect(() => {
    focusQuietly(closeRef.current);
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

  // The text comes in once the card itself is far enough open — by its shape, not by a clock: the flight may start
  // a little later (the picture is decoded first), and the text must never hang in the air outside the card.
  const content = (index: number) => {
    const delay = (index * DIALOG.contentStaggerMs) / 1000;
    const hidden = { opacity: 0, transform: `translate3d(0px, ${calm ? 0 : 16}px, 0px)` };
    return {
      initial: hidden,
      animate: revealed
        ? {
            opacity: 1,
            transform: 'translate3d(0px, 0px, 0px)',
            transition: calm
              ? { duration: DURATION.fade }
              : {
                  default: { ...SPRING.dialogContent, delay },
                  opacity: { duration: 0.35, ease: EASE_OUT_SOFT, delay },
                },
          }
        : hidden,
      exit: { opacity: 0, transition: { duration: DIALOG.contentExitS } },
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
        exit={{ opacity: 0, transition: { duration: DURATION.scrimOut } }}
      />
      <div
        ref={dialogRef}
        className="team-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-dialog-title"
        onKeyDown={onKeyDown}
      >
        <TeamDialogSurface surfaceRef={surfaceRef} pictureRef={pictureRef} logoRef={logoRef} />
        <div className="team-dialog-content">
          <m.h2 id="team-dialog-title" className="dialog-title" {...content(0)}>
            <NameFlip lines={teamDialog.nameLines} translation={teamDialog.nameTranslationLines} />
          </m.h2>
          <m.p className="dialog-lead" {...content(1)}>
            <Lines lines={teamDialog.leadLines} />
          </m.p>
          <m.ul
            className="dialog-members"
            aria-label={teamDialog.membersLabel}
            style={{ '--member-rows': memberRows } as MotionStyle}
            {...content(2)}
          >
            {teamDialog.members.flat().map((name) => (
              <li key={name} className="dialog-member">
                {name}
              </li>
            ))}
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
              onClick={(event) => {
                close.act(event, onClose);
              }}
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
