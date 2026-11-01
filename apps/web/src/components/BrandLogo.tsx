import { images } from '../lib/assets';

type Props = {
  readonly className?: string;
  /** Its width on the page, as in <img sizes>. */
  readonly sizes: string;
};

/** The cabbage. Decorative: the name stands next to it, or the parent carries the label. */
export function BrandLogo({ className, sizes }: Props) {
  const logo = images.brandLogo;
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={logo.avifSrcSet} sizes={sizes} />
      <img src={logo.fallback} srcSet={logo.webpSrcSet} sizes={sizes} alt="" draggable={false} />
    </picture>
  );
}
