import { IconArrowUpRight, IconChevronUp } from '@tabler/icons-react';
import { m, type MotionStyle } from 'motion/react';
import { useEffect, useRef, type Ref } from 'react';
import { site } from '../content/site.ru';
import { TeamTile } from '../features/team-dialog/TeamTile';
import { preloadTeamBackground } from '../features/team-dialog/preload';
import { useCalmMotion } from '../motion/hooks';
import { TILT } from '../motion/tokens';
import { TiltGlare, type TiltHandle } from '../motion/TiltGlare';
import { useWave } from '../motion/useWave';
import { WaveLayer } from '../motion/WaveHover';
import { images } from '../lib/assets';
import { aboutCardVariants, aboutTitleVariants, type Phase } from './choreography';
import { Lines } from '../components/Lines';

/** The team card and the project card. */
const ABOUT_CARDS = 2;

type Props = {
  readonly phase: Phase;
  readonly instant: boolean;
  readonly titleRef: Ref<HTMLButtonElement>;
  readonly onBack: () => void;
  readonly teamOpen: boolean;
  /** The team card is out of its icon (open or flying): the icon is empty and the card does not tilt. */
  readonly teamOut: boolean;
  readonly tileRef: Ref<HTMLDivElement>;
  readonly onOpenTeam: () => void;
  /** Receives the «Ещё» button so focus can return to it after the dialog closes. */
  readonly onMoreRef: (node: HTMLButtonElement | null) => void;
};

/** Part 2 «О проекте»: the title (a button back to the start) and the team and project cards (ТЗ 6.3). */
export function AboutScene({
  phase,
  instant,
  titleRef,
  onBack,
  teamOpen,
  teamOut,
  tileRef,
  onOpenTeam,
  onMoreRef,
}: Props) {
  const calm = useCalmMotion();
  const hidden = phase === 'hidden';
  const teamTilt = useRef<TiltHandle>(null);
  const more = useWave<HTMLButtonElement>();
  const { team, project } = site.about;
  const initial = instant ? ({ initial: false } as const) : {};

  const openTeam = () => {
    // The card must be flat before the icon is measured for the corner morph (ТЗ 6.4).
    teamTilt.current?.reset();
    onOpenTeam();
  };

  // The card background is not on the first screen: fetch it once part 2 is shown, before the first opening.
  useEffect(() => {
    if (!hidden) preloadTeamBackground();
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
          className="about-title-button focus-ring"
          aria-label={`${site.about.title}. ${site.about.backLabel}`}
          onClick={onBack}
        >
          <span>{site.about.title}</span>
          <IconChevronUp aria-hidden className="about-chevron" stroke={2.5} />
        </button>
      </m.h2>

      <m.article
        className="info-card info-card--team at box"
        style={{ '--i': 0, '--name-lines': team.nameLines.length } as MotionStyle}
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
          disabled={teamOut}
        >
          <p className="info-label at text-at">{team.label}</p>
          <TeamTile ref={tileRef} hidden={teamOut} />
          <h3 id="team-card-name" className="info-name at text-at">
            <Lines lines={team.nameLines} />
          </h3>
          <p className="info-lead at text-at">
            <Lines lines={team.leadLines} />
          </p>
          <button
            ref={(node) => {
              more.setHost(node);
              onMoreRef(node);
            }}
            type="button"
            className="info-more at box wave-host focus-ring"
            aria-label={team.moreLabel}
            aria-haspopup="dialog"
            aria-expanded={teamOpen}
            onClick={openTeam}
            {...more.handlers}
          >
            <span className="wave-content">{team.more}</span>
            <WaveLayer clipPath={more.clipPath} className="wave-layer--ink wave-layer--outline">
              {team.more}
            </WaveLayer>
          </button>
        </TiltGlare>
      </m.article>

      <m.article
        className="info-card at box"
        style={{ '--i': 1, '--name-lines': project.nameLines.length } as MotionStyle}
        aria-labelledby="project-card-name"
        data-opaque
        variants={aboutCardVariants(1, ABOUT_CARDS, calm)}
        {...initial}
        animate={phase}
      >
        <TiltGlare maxDeg={TILT.infoCardMaxDeg} className="info-surface">
          <p className="info-label at text-at">{project.label}</p>
          <picture className="info-tile at box">
            <source type="image/avif" srcSet={images[project.image].avifSrcSet} />
            <img
              src={images[project.image].fallback}
              srcSet={images[project.image].webpSrcSet}
              alt={project.imageAlt}
            />
          </picture>
          <h3 id="project-card-name" className="info-name at text-at">
            <Lines lines={project.nameLines} />
          </h3>
          <p className="info-lead at text-at">
            <Lines lines={project.leadLines} />
          </p>
          <ul className="info-links at">
            {project.links.map((link) => (
              <li key={link.label}>
                <SoonLink label={link.label} href={link.href} hint={link.soonHint} />
              </li>
            ))}
          </ul>
        </TiltGlare>
      </m.article>
    </section>
  );
}

type SoonLinkProps = {
  readonly label: string;
  readonly href: string | null;
  readonly hint: string;
};

/** Link with a round arrow; while the address is unknown it is disabled with a «Скоро» hint, the wave still works. */
function SoonLink({ label, href, hint }: SoonLinkProps) {
  const { setHost: linkRef, handlers: linkWave, clipPath: linkClip } = useWave<HTMLAnchorElement>();
  const disabled = href === null;
  const content = (tone: 'base' | 'wave') => (
    <>
      <span>{label}</span>
      <span className={`info-link-circle info-link-circle--${tone}`}>
        <IconArrowUpRight aria-hidden className="info-link-arrow" stroke={2.5} />
      </span>
    </>
  );
  return (
    <a
      ref={linkRef}
      className="info-link wave-host focus-ring"
      href={href ?? undefined}
      role={disabled ? 'link' : undefined}
      tabIndex={0}
      aria-disabled={disabled || undefined}
      title={disabled ? hint : undefined}
      target={disabled ? undefined : '_blank'}
      rel={disabled ? undefined : 'noreferrer'}
      onClick={(event) => {
        if (disabled) event.preventDefault();
      }}
      {...linkWave}
    >
      <span className="wave-content info-link-content">{content('base')}</span>
      <WaveLayer clipPath={linkClip} className="wave-layer--accent info-link-content">
        {content('wave')}
      </WaveLayer>
      {disabled && <span className="visually-hidden">{` (${hint})`}</span>}
    </a>
  );
}
