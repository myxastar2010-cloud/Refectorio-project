import { Fragment } from 'react';

type Props = { readonly lines: readonly string[] };

/**
 * Text broken into lines exactly as on the mockup. Lines are block spans on desktop and inline on phones;
 * the spaces between them keep words apart for screen readers and copy-paste («Питаться полезно…», not «Питатьсяполезно»).
 */
export function Lines({ lines }: Props) {
  return lines.map((line, index) => (
    <Fragment key={line}>
      {index > 0 && ' '}
      <span className="line">{line}</span>
    </Fragment>
  ));
}
