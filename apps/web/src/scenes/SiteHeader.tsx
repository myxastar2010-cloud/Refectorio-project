import { IconApple } from '@tabler/icons-react';
import { m } from 'motion/react';
import { site } from '../content/site.ru';
import { useCalmMotion } from '../motion/hooks';
import { useWave } from '../motion/useWave';
import { WaveLayer } from '../motion/WaveHover';
import { heroVariants, type Phase } from './choreography';

type Props = {
  readonly phase: Phase;
  readonly instant: boolean;
  /** Part 1 is scrolled (small screens): the header gets its own background over the content. */
  readonly scrolled: boolean;
  readonly onAbout: () => void;
};

/**
 * Logo and «О проекте» (ТЗ 6.2). It belongs to part 1 and leaves with it, but lives outside <main>, so it stays
 * the page's banner landmark.
 */
export function SiteHeader({ phase, instant, scrolled, onAbout }: Props) {
  const calm = useCalmMotion();
  const hidden = phase === 'hidden';
  const { setHost, handlers, clipPath } = useWave<HTMLButtonElement>();

  return (
    <m.header
      className="site-header"
      inert={hidden}
      aria-hidden={hidden}
      data-scrolled={scrolled || undefined}
      variants={heroVariants(0, calm)}
      animate={phase}
      {...(instant ? { initial: false as const } : {})}
    >
      <div className="brand">
        <IconApple aria-hidden className="brand-icon at box" stroke={2} data-food-avoid />
        <span className="brand-name at text-at" data-food-avoid>
          {site.brand.name}
        </span>
      </div>
      <button
        ref={setHost}
        type="button"
        className="about-pill at box wave-host focus-ring"
        onClick={onAbout}
        {...handlers}
      >
        <span className="wave-content">{site.hero.aboutButton}</span>
        <WaveLayer clipPath={clipPath} className="wave-layer--ink">
          {site.hero.aboutButton}
        </WaveLayer>
      </button>
    </m.header>
  );
}
