import { IconApple, IconChevronUp } from '@tabler/icons-react';
import { m, type MotionStyle } from 'motion/react';
import { memo, useEffect, useRef, type Ref, type RefObject } from 'react';
import { site } from '../content/site.ru';
import { TeamTile } from '../features/team-dialog/TeamTile';
import { preloadTeamPicture } from '../features/team-dialog/preload';
import { useCalmMotion } from '../motion/hooks';
import { TILT } from '../motion/tokens';
import { TiltGlare, type TiltHandle } from '../motion/TiltGlare';
import { useWave } from '../motion/useWave';
import { WaveLayer } from '../motion/WaveHover';
import { aboutCardVariants, aboutTitleVariants, type Phase } from './choreography';
import { Lines } from '../components/Lines';

/** The team card and the project card. */
const ABOUT_CARDS = 2;

type Props = {
  readonly phase: Phase;
  readonly instant: boolean;
  readonly titleRef: Ref<HTMLButtonElement>;
  readonly onBack: () => void;
  readonly team: CardProps;
  readonly project: CardProps;
  readonly teamTileRef: Ref<HTMLDivElement>;
  readonly projectTileRef: Ref<HTMLDivElement>;
};

/** The expanded card of one about card (the team's, the project's). */
type CardProps = {
  readonly open: boolean;
  /** The card is out of its icon (open or flying): the icon is empty and the card does not tilt. */
  readonly out: boolean;
  readonly onOpen: () => void;
  /** Receives the «Подробнее» button so focus can return to it after the card closes. */
  readonly onMoreButton: (node: HTMLButtonElement | null) => void;
};

/** Part 2 «О проекте»: the title (a button back to the start) and the team and project cards (ТЗ 6.3). */
/* memo: a scene change re-rendered every scene, the hidden ones too (stage-3 performance audit, F3). */
export const AboutScene = memo(function AboutScene({
  phase,
  instant,
  titleRef,
  onBack,
  team,
  project,
  teamTileRef,
  projectTileRef,
}: Props) {
  const calm = useCalmMotion();
  const hidden = phase === 'hidden';
  const teamTilt = useRef<TiltHandle>(null);
  const projectTilt = useRef<TiltHandle>(null);
  const { team: teamText, project: projectText } = site.about;
  const initial = instant ? ({ initial: false } as const) : {};

  // The card picture is not on the first screen: fetch it once part 2 is shown, before the first opening.
  useEffect(() => {
    if (!hidden) preloadTeamPicture();
  }, [hidden]);

  return (
    <section
      className="scene scene--about"
      aria-labelledby="about-title"
      inert={hidden}
      aria-hidden={hidden}
      data-scene-active={!hidden}
    >
      <m.h2
        id="about-title"
        className="about-title at text-at"
        variants={aboutTitleVariants(calm)}
        {...initial}
        animate={phase}
      >
        <button
          ref={titleRef}
          type="button"
          className="about-title-button"
          aria-label={`${site.about.title}. ${site.about.backLabel}`}
          onClick={onBack}
        >
          <span>{site.about.title}</span>
          <IconChevronUp aria-hidden className="about-chevron" stroke={2.5} />
        </button>
      </m.h2>

      <m.article
        className="info-card info-card--team at box"
        style={{ '--i': 0, '--name-lines': teamText.nameLines.length } as MotionStyle}
        aria-labelledby="team-card-name"
        data-opaque
        variants={aboutCardVariants(0, ABOUT_CARDS, calm)}
        {...initial}
        animate={phase}
      >
        <TiltGlare
          ref={teamTilt}
          maxDeg={TILT.infoCardMaxDeg}
          className="info-surface"
          disabled={team.out}
        >
          <p className="info-label at text-at">{teamText.label}</p>
          <TeamTile ref={teamTileRef} hidden={team.out} />
          <h3 id="team-card-name" className="info-name at text-at">
            <Lines lines={teamText.nameLines} />
          </h3>
          <p className="info-lead at text-at">
            <Lines lines={teamText.leadLines} />
          </p>
          <MoreButton
            label={teamText.more}
            ariaLabel={teamText.moreLabel}
            card={team}
            tilt={teamTilt}
          />
        </TiltGlare>
      </m.article>

      <m.article
        className="info-card at box"
        style={{ '--i': 1, '--name-lines': projectText.nameLines.length } as MotionStyle}
        aria-labelledby="project-card-name"
        data-opaque
        variants={aboutCardVariants(1, ABOUT_CARDS, calm)}
        {...initial}
        animate={phase}
      >
        <TiltGlare
          ref={projectTilt}
          maxDeg={TILT.infoCardMaxDeg}
          className="info-surface"
          disabled={project.out}
        >
          <p className="info-label at text-at">{projectText.label}</p>
          <div
            ref={projectTileRef}
            className="info-tile at box project-tile"
            role="img"
            aria-label={projectText.logoAlt}
          >
            <IconApple
              aria-hidden
              className="project-tile-icon"
              stroke={2}
              style={project.out ? { visibility: 'hidden' } : undefined}
            />
          </div>
          <h3 id="project-card-name" className="info-name at text-at">
            <Lines lines={projectText.nameLines} />
          </h3>
          <p className="info-lead at text-at">
            <Lines lines={projectText.leadLines} />
          </p>
          <MoreButton
            label={projectText.more}
            ariaLabel={projectText.moreLabel}
            card={project}
            tilt={projectTilt}
          />
        </TiltGlare>
      </m.article>
    </section>
  );
});

type MoreButtonProps = {
  readonly label: string;
  readonly ariaLabel: string;
  readonly card: CardProps;
  readonly tilt: RefObject<TiltHandle | null>;
};

/** «Подробнее» of an about card: opens its expanded card. */
function MoreButton({ label, ariaLabel, card, tilt }: MoreButtonProps) {
  const more = useWave<HTMLButtonElement>();
  const open = () => {
    // The card must be flat before the icon is measured for the corner morph (ТЗ 6.4).
    tilt.current?.reset();
    card.onOpen();
  };
  return (
    <button
      ref={(node) => {
        more.setHost(node);
        card.onMoreButton(node);
      }}
      type="button"
      className="info-more at box wave-host"
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={card.open}
      onClick={(event) => {
        more.act(event, open);
      }}
      {...more.handlers}
    >
      <span className="wave-content">{label}</span>
      <WaveLayer clipPath={more.clipPath} className="wave-layer--ink wave-layer--outline">
        {label}
      </WaveLayer>
    </button>
  );
}
