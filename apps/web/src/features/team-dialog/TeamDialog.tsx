import { AnimatePresence, m, type MotionStyle } from 'motion/react';
import { memo, type RefObject } from 'react';
import { Lines } from '../../components/Lines';
import { site } from '../../content/site.ru';
import { DIALOG } from '../../motion/tokens';
import { CardDialog } from './CardDialog';
import { NameFlip } from './NameFlip';
import { TeamDialogSurface } from './TeamSurface';

type Props = {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The team icon the card flies from and back to. */
  readonly tileRef: RefObject<HTMLElement | null>;
  /** The card has landed back on the icon after closing. */
  readonly onLanded: () => void;
};

/**
 * Expanded team card (ТЗ 6.4): the shared CardDialog with the team's surface (the star) and its name, lead and members.
 * The rest of the page is made inert by the App while the dialog is open.
 */
/* memo: a scene change re-rendered every scene, the hidden ones too (stage-3 performance audit, F3). */
export const TeamDialog = memo(function TeamDialog({ open, onClose, tileRef, onLanded }: Props) {
  const { teamDialog } = site;
  // The names fill the columns top to bottom: as many rows as the longest column.
  const memberRows = Math.max(...teamDialog.members.map((column) => column.length));
  return (
    <AnimatePresence>
      {open && (
        <CardDialog
          key="team-dialog"
          className="team-dialog"
          labelledBy="team-dialog-title"
          anchorRef={tileRef}
          closeLabel={teamDialog.close}
          closeTone="light"
          closeIndex={3}
          onClose={onClose}
          onLanded={onLanded}
          surface={(refs) => (
            <TeamDialogSurface
              surfaceRef={refs.surface}
              pictureRef={refs.picture}
              logoRef={refs.logo}
            />
          )}
          picture={{
            spec: DIALOG.picture,
            dockedBelow: DIALOG.dockedBelow,
            logoCrossfadeEnd: DIALOG.logoCrossfadeEnd,
          }}
        >
          {(reveal) => (
            <>
              <m.h2 id="team-dialog-title" className="dialog-title" {...reveal(0)}>
                <NameFlip
                  lines={teamDialog.nameLines}
                  translation={teamDialog.nameTranslationLines}
                />
              </m.h2>
              <m.p className="dialog-lead" {...reveal(1)}>
                <Lines lines={teamDialog.leadLines} />
              </m.p>
              <m.ul
                className="dialog-members"
                aria-label={teamDialog.membersLabel}
                style={{ '--member-rows': memberRows } as MotionStyle}
                {...reveal(2)}
              >
                {teamDialog.members.flat().map((name) => (
                  <li key={name} className="dialog-member">
                    {name}
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
