import { IconX } from '@tabler/icons-react';
import clsx from 'clsx';
import { m, usePresence } from 'motion/react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { focusQuietly } from '../../lib/quietFocus';
import { useCalmMotion } from '../../motion/hooks';
import { revealMotion, useCornerMorph, type MorphPicture } from '../../motion/cornerMorph';
import { DURATION } from '../../motion/tokens';
import { useWave } from '../../motion/useWave';
import { WaveLayer } from '../../motion/WaveHover';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type SurfaceRefs = {
  readonly surface: RefObject<HTMLDivElement | null>;
  readonly picture: RefObject<HTMLImageElement | null>;
  readonly logo: RefObject<HTMLImageElement | null>;
};

/** The entrance of the n-th block of the card's content (revealMotion: after ≈ 70 % of the shape). */
export type Reveal = (index: number) => ReturnType<typeof revealMotion>;

type Props = {
  /** The card's own class: its size, corners and colours (team-dialog, project-dialog). */
  readonly className: string;
  readonly labelledBy: string;
  /** The icon the card grows out of and lands back on. */
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly closeLabel: string;
  /** The ✕ on a light card is ink; on the dark team card it is white. */
  readonly closeTone: 'light' | 'ink';
  /** Order of the ✕ among the revealed blocks. */
  readonly closeIndex: number;
  readonly onClose: () => void;
  readonly onLanded: () => void;
  /** The surface at its final size; useCornerMorph squeezes it onto the anchor. */
  readonly surface: (refs: SurfaceRefs) => ReactNode;
  /** A picture that must never stretch with the surface (the team card's star). */
  readonly picture?: Omit<MorphPicture, 'image' | 'logo'>;
  /** Every drawn frame: how open the card is (0 — the icon, 1 — open). */
  readonly onFrame?: (openness: number) => void;
  /** The content comes in once the card is this far open (default DIALOG.contentRevealAt). */
  readonly revealAt?: number;
  /** Laid over the surface, outside the content (the project card's apple docked on its icon). */
  readonly overlay?: ReactNode;
  readonly children: (reveal: Reveal) => ReactNode;
};

/**
 * An expanded card of part 2 (ТЗ 6.4, stage 3 — 4.19): the shape grows out of its icon with the four-corner morph and
 * lands back on it, the page behind dims, role="dialog" with aria-modal, a focus trap, Esc / ✕ / a click outside
 * close it. The team card and the project card are this one dialog with their own surface and content. Render it
 * keyed inside AnimatePresence: it waits for its flight back before it leaves.
 */
export function CardDialog({
  className,
  labelledBy,
  anchorRef,
  closeLabel,
  closeTone,
  closeIndex,
  onClose,
  onLanded,
  surface,
  picture,
  onFrame,
  revealAt,
  overlay,
  children,
}: Props) {
  const [present, safeToRemove] = usePresence();
  const calm = useCalmMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLImageElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const close = useWave<HTMLButtonElement>();
  const [revealed, setRevealed] = useState(false);

  useCornerMorph({
    surface: surfaceRef,
    anchor: anchorRef,
    ...(picture ? { picture: { ...picture, image: pictureRef, logo: logoRef } } : {}),
    present,
    calm,
    onReveal: () => {
      setRevealed(true);
    },
    onLanded,
    onDone: () => {
      safeToRemove?.();
    },
    ...(onFrame ? { onFrame } : {}),
    ...(revealAt === undefined ? {} : { revealAt }),
  });

  useEffect(() => {
    focusQuietly(closeRef.current);
  }, []);

  // Esc on the whole page, not only inside the card: Safari does not focus a button it clicks, so after a press on a
  // link the focus may be on the page itself (the scenes ignore keys while a card is open).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!present) return undefined;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [present]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

  const reveal: Reveal = (index) => revealMotion(index, revealed, calm);
  const waveTone = closeTone === 'ink' ? 'wave-layer--ink' : 'wave-layer--light';

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
        className={clsx('card-dialog', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
      >
        {surface({ surface: surfaceRef, picture: pictureRef, logo: logoRef })}
        <div className="team-dialog-content">
          {children(reveal)}
          <m.div className="dialog-close-slot" {...reveal(closeIndex)}>
            <button
              ref={(node) => {
                closeRef.current = node;
                close.setHost(node);
              }}
              type="button"
              className={clsx('dialog-close wave-host', closeTone === 'ink' && 'dialog-close--ink')}
              aria-label={closeLabel}
              onClick={(event) => {
                close.act(event, onClose);
              }}
              {...close.handlers}
            >
              <IconX aria-hidden className="dialog-close-icon" stroke={2} />
              <WaveLayer clipPath={close.clipPath} className={waveTone}>
                <IconX aria-hidden className="dialog-close-icon" stroke={2} />
              </WaveLayer>
            </button>
          </m.div>
        </div>
      </div>
      {overlay}
    </div>
  );
}
