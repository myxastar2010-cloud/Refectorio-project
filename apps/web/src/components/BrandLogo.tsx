import { site } from '../content/site.ru';
import { Kiki, type KikiMood } from './Kiki';

type Props = {
  readonly className?: string;
  /** Her face; the header logo changes it with her lines (BrandKiki), everywhere else she is calm. */
  readonly mood?: KikiMood;
};

/** The logo is Kiki: a still, cropped drawing of her. Decorative: the name stands next to it, or the parent carries the label. */
export function BrandLogo({ className, mood = 'good' }: Props) {
  return (
    <Kiki
      logo
      decorative
      mood={mood}
      level={2}
      label={site.brand.logoAlt}
      {...(className ? { className } : {})}
    />
  );
}
