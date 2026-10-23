import { IconArrowUpRight } from '@tabler/icons-react';
import { useWave } from '../motion/useWave';
import { WaveLayer } from '../motion/WaveHover';

type Props = {
  readonly label: string;
  readonly onPress: () => void;
};

/**
 * A link with a round arrow that goes nowhere yet: the source code, the documentation and the photo credits are not
 * public, so a press says «Мы работаем над этим» (D-051) — a button, nothing opens. The wave works as on every control:
 * on the white project card it turns the label deep red and the circle black.
 */
export function SoonLink({ label, onPress }: Props) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  const content = (tone: 'base' | 'wave') => (
    <>
      <span>{label}</span>
      <span className={`soon-link-circle soon-link-circle--${tone}`}>
        <IconArrowUpRight aria-hidden className="soon-link-arrow" stroke={2.5} />
      </span>
    </>
  );
  return (
    <button
      ref={setHost}
      type="button"
      className="soon-link wave-host"
      onClick={(event) => {
        act(event, onPress);
      }}
      {...handlers}
    >
      <span className="wave-content soon-link-content">{content('base')}</span>
      <WaveLayer clipPath={clipPath} className="wave-layer--light soon-link-content">
        {content('wave')}
      </WaveLayer>
    </button>
  );
}
