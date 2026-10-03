import type { Ref } from 'react';
import { TeamTileArt } from './TeamSurface';

type Props = {
  /** The card is out (open or on its way): the slot stays empty, like an app icon that became the app window. */
  readonly hidden: boolean;
  readonly ref?: Ref<HTMLDivElement>;
};

/** The team icon in the about card: where the team card flies from and lands back. */
export function TeamTile({ hidden, ref }: Props) {
  return (
    <div ref={ref} className="info-tile at box team-tile">
      <TeamTileArt hidden={hidden} />
    </div>
  );
}
