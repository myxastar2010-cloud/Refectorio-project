import type { QuizAnswersV1 } from '@refectorio/contracts';
import { IconBell, IconDots, IconSearch, IconStarFilled } from '@tabler/icons-react';
import { menu } from '../../../content/menu.ru';
import { Pic } from '../components/Pic';
import { KIKI } from '../data/pictures';
import { goalText } from './goal';

type Props = {
  readonly answers: QuizAnswersV1 | null;
  readonly unread: boolean;
  readonly onGoal: () => void;
  readonly onSearch: () => void;
  readonly onMore: () => void;
  readonly onBell: () => void;
  /** Below 1280 px Kiki lives in a sheet: its button sits in the top bar. */
  readonly onKiki: () => void;
};

/**
 * The top bar (ТЗ фаза 4 §3): the goal pill on the left; «Поиск», ⋯ and the bell on the right — in the mockup's order
 * (the brief put the bell left of ⋯; the mockup wins).
 */
export function TopBar({ answers, unread, onGoal, onSearch, onMore, onBell, onKiki }: Props) {
  return (
    <div className="menu-top">
      <button type="button" className="menu-pill menu-goal" onClick={onGoal} title={menu.goal.hint}>
        <IconStarFilled className="menu-goal-star" aria-hidden />
        <span>{goalText(answers)}</span>
      </button>
      <div className="menu-top-actions">
        <button type="button" className="menu-pill menu-search-pill" onClick={onSearch}>
          <IconSearch stroke={2} aria-hidden />
          <span>{menu.top.search}</span>
        </button>
        <button
          type="button"
          className="menu-round"
          aria-label={menu.top.more}
          aria-haspopup="menu"
          onClick={onMore}
        >
          <IconDots stroke={2.4} aria-hidden />
        </button>
        <button
          type="button"
          className="menu-round menu-bell"
          aria-label={unread ? menu.top.bellUnread : menu.top.bell}
          onClick={onBell}
        >
          <IconBell stroke={2} aria-hidden />
          {unread ? <span className="menu-bell-dot" aria-hidden /> : null}
        </button>
        <button
          type="button"
          className="menu-round menu-kiki-button"
          aria-label={menu.kiki.open}
          onClick={onKiki}
        >
          <Pic picture={KIKI} alt="" />
        </button>
      </div>
    </div>
  );
}
