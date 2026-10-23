import { IconApple } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { memo, useCallback, useRef, type RefObject } from 'react';
import { SoonLink } from '../../components/SoonLink';
import { site } from '../../content/site.ru';
import { DIALOG } from '../../motion/tokens';
import { CardDialog } from './CardDialog';

type Props = {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The project icon (the white tile with the apple) the card flies from and back to. */
  readonly tileRef: RefObject<HTMLElement | null>;
  readonly onLanded: () => void;
  /** A short message: the project's materials are not public yet. */
  readonly onNotify: (message: string) => void;
};

/**
 * The project details card (stage 3, 4.19): the shared CardDialog on a white surface — it grows out of the white
 * project icon, so at the icon it is the icon. The icon's apple stays where it was and melts away over the first frames
 * (as the team icon's logo does), and comes back as the card lands.
 */
/* memo: a scene change re-rendered every scene, the hidden ones too (stage-3 performance audit, F3). */
export const ProjectDialog = memo(function ProjectDialog({
  open,
  onClose,
  tileRef,
  onLanded,
  onNotify,
}: Props) {
  const { projectDialog } = site;
  const appleRef = useRef<HTMLDivElement | null>(null);

  // The apple is laid exactly over the icon's own (hidden while the card is out) once, when the card mounts.
  const dockApple = useCallback(
    (node: HTMLDivElement | null) => {
      appleRef.current = node;
      const tile = tileRef.current;
      if (!node || !tile) return;
      const rect = tile.getBoundingClientRect();
      node.style.left = `${rect.left.toFixed(2)}px`;
      node.style.top = `${rect.top.toFixed(2)}px`;
      node.style.width = `${rect.width.toFixed(2)}px`;
      node.style.height = `${rect.height.toFixed(2)}px`;
    },
    [tileRef],
  );
  const onFrame = useCallback((openness: number) => {
    const apple = appleRef.current;
    if (apple) apple.style.opacity = String(1 - Math.min(1, openness / DIALOG.logoCrossfadeEnd));
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <CardDialog
          key="project-dialog"
          className="project-dialog"
          labelledBy="project-dialog-title"
          anchorRef={tileRef}
          closeLabel={projectDialog.close}
          closeTone="ink"
          closeIndex={4}
          onClose={onClose}
          onLanded={onLanded}
          surface={(refs) => <div ref={refs.surface} className="project-surface" />}
          onFrame={onFrame}
          revealAt={DIALOG.projectRevealAt}
          overlay={
            <div ref={dockApple} className="project-docked-apple" aria-hidden>
              <IconApple className="project-tile-icon" stroke={2} />
            </div>
          }
        >
          {(reveal) => (
            <>
              <m.h2 id="project-dialog-title" className="project-dialog-title" {...reveal(0)}>
                {projectDialog.title}
              </m.h2>
              <m.div className="project-dialog-text" {...reveal(1)}>
                {projectDialog.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </m.div>
              <m.p className="project-dialog-team" {...reveal(2)}>
                {projectDialog.teamLine}
              </m.p>
              <m.ul
                className="project-dialog-links"
                aria-label={projectDialog.linksLabel}
                {...reveal(3)}
              >
                {projectDialog.links.map((link) => (
                  <li key={link.label}>
                    <SoonLink
                      label={link.label}
                      onPress={() => {
                        onNotify(site.notices.workingOnIt);
                      }}
                    />
                  </li>
                ))}
              </m.ul>
            </>
          )}
        </CardDialog>
      )}
    </AnimatePresence>
  );
});
