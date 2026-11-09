import { AnimatePresence, m, usePresence } from 'motion/react';
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useModal } from '../../../components/useModal';
import { revealMotion, useCornerMorph } from '../../../motion/cornerMorph';
import { useCalmMotion } from '../../../motion/hooks';
import { DURATION, MORPH } from '../../../motion/tokens';
import { useBackCloses } from '../shell/useBackCloses';

type Reveal = (index: number) => ReturnType<typeof revealMotion>;

type Props = {
  /** The control it grows from; null — closed. */
  readonly anchor: HTMLElement | null;
  /** History key (Back closes it) and the id base of its title: `${name}-title`. */
  readonly name: string;
  readonly className?: string;
  readonly onClose: () => void;
  readonly children: (reveal: Reveal) => ReactNode;
};

/**
 * A dialog of the menu without a mockup (the goal, a restored file): a card grown from its control by the corner morph,
 * centred over the main column with a scrim; a bottom sheet on phones. Focus is trapped, the page behind is inert;
 * Esc, the scrim and Back close it. Its content comes in by `reveal(i)` once the shape is open.
 */
export function Sheet({ anchor, ...props }: Props) {
  return createPortal(
    <AnimatePresence>
      {anchor ? <SheetBody key={props.name} anchor={anchor} {...props} /> : null}
    </AnimatePresence>,
    document.querySelector('.menu-scene') ?? document.body,
  );
}

function SheetBody({
  anchor,
  name,
  className,
  onClose,
  children,
}: Props & { readonly anchor: HTMLElement }) {
  const [present, safeToRemove] = usePresence();
  const calm = useCalmMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const anchorRef: RefObject<HTMLElement | null> = useRef(anchor);
  const [revealed, setRevealed] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number } | 'sheet' | null>(null);

  useModal({
    open: present,
    containerRef: panelRef,
    onClose,
    returnFocusTo: anchor,
    background: '.menu-app, .menu-kiki-fab',
    fallbackFocusId: 'menu-title',
  });
  useBackCloses(present, onClose, name);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (getComputedStyle(panel).getPropertyValue('--sheet-bottom').trim() === '1') {
      setBox('sheet');
      return;
    }
    const main = document.querySelector('.menu-main')?.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = panel;
    const margin = 16;
    const centre = main ? main.left + main.width / 2 : window.innerWidth / 2;
    setBox({
      left: Math.min(Math.max(margin, centre - width / 2), window.innerWidth - width - margin),
      top: Math.max(margin, (window.innerHeight - height) / 2),
    });
  }, []);

  useCornerMorph({
    surface: surfaceRef,
    anchor: anchorRef,
    present: present && box !== null,
    calm,
    fadeBelow: MORPH.cardFadeBelow,
    onReveal: () => {
      setRevealed(true);
    },
    onLanded: () => undefined,
    onDone: () => {
      safeToRemove?.();
    },
  });

  return (
    <div className="details-layer" inert={!present}>
      <m.div
        className="details-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: DURATION.scrim } }}
        exit={{ opacity: 0, transition: { duration: DURATION.scrimOut } }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        className={className ? `sheet ${className}` : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${name}-title`}
        style={
          box === null
            ? { visibility: 'hidden' }
            : box === 'sheet'
              ? undefined
              : { left: box.left, top: box.top }
        }
      >
        <div ref={surfaceRef} className="details-surface" aria-hidden />
        <div className="sheet-body">{children((index) => revealMotion(index, revealed, calm))}</div>
      </div>
    </div>
  );
}
