import type { Picture } from '../data/pictures';

type Props = {
  readonly picture: Picture;
  readonly alt: string;
  readonly className?: string;
  readonly eager?: boolean;
};

/** A generated picture as <picture>: AVIF, then WebP. */
export function Pic({ picture, alt, className, eager = false }: Props) {
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={picture.avifSrcSet} />
      <img
        src={picture.src}
        srcSet={picture.webpSrcSet}
        alt={alt}
        width={picture.width}
        height={picture.height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
      />
    </picture>
  );
}
