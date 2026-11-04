import type { QuizAnswersV1 } from '@refectorio/contracts';
import { IconBell, IconDots, IconStarFilled } from '@tabler/icons-react';
import { menu } from '../../../content/menu.ru';
import { Pic } from '../components/Pic';
import { KIKI } from '../data/pictures';
import { SearchField, type SearchFieldProps } from '../search/SearchField';
import { goalText } from './goal';

type Props = {
  readonly answers: QuizAnswersV1 | null;
  readonly unread: boolean;
  readonly onGoal: (pill: HTMLElement) => void;
  readonly search: SearchFieldProps;
  readonly onMore: (button: HTMLElement) => void;
  /** A click (detail 0 — from the keyboard) pins the news; hover opens them with intent. */
  readonly onBell: (button: HTMLElement, keyboard: boolean) => void;
  readonly onBellHover: (button: HTMLElement | null) => void;
  readonly newsOpen: boolean;
  /** Below 1280 px Kiki lives in a sheet: its button sits in the top bar. */
  readonly onKiki: () => void;
};

/**
 * The top bar (ТЗ фаза 4 §3): the goal pill on the left; «Поиск», ⋯ and the bell on the right — in the mockup's order
 * (the brief put the bell left of ⋯; the mockup wins).
 */
export function TopBar({
  answers,
  unread,
  onGoal,
  search,
  onMore,
  onBell,
  onBellHover,
  newsOpen,
  onKiki,
}: Props) {
  return (
    <div className="menu-top" data-search={search.open || undefined}>
      <button
        type="button"
        className="menu-pill menu-goal"
        onClick={(event) => {
          onGoal(event.currentTarget);
        }}
        title={menu.goal.hint}
      >
        <IconStarFilled className="menu-goal-star" aria-hidden />
        <span>{goalText(answers)}</span>
      </button>
      <div className="menu-top-actions">
        <SearchField {...search} />
        <button
          type="button"
          className="menu-round"
          aria-label={menu.top.more}
          aria-haspopup="menu"
          onClick={(event) => {
            onMore(event.currentTarget);
          }}
        >
          <IconDots stroke={2.4} aria-hidden />
        </button>
        <button
          type="button"
          className="menu-round menu-bell"
          aria-label={unread ? menu.top.bellUnread : menu.top.bell}
          aria-expanded={newsOpen}
          aria-controls={newsOpen ? 'menu-news' : undefined}
          onClick={(event) => {
            onBell(event.currentTarget, event.detail === 0);
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') onBellHover(event.currentTarget);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') onBellHover(null);
          }}
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
