import { TeamSurface } from './TeamSurface';

type Props = {
  readonly open: boolean;
  /** True until the dialog has been opened once: the tile renders without the cross-fade. */
  readonly still: boolean;
};

/**
 * The team icon in the about card. While the dialog is open the slot stays empty —
 * like an app icon whose artwork has flown out to become the app window.
 */
export function TeamTile({ open, still }: Props) {
  return (
    <div className="info-tile at box team-tile">
      {!open && <TeamSurface mode="tile" still={still} />}
    </div>
  );
}
