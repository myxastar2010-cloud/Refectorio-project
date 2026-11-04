import {
  IconBook2,
  IconCalendarEvent,
  IconChartBar,
  IconShoppingBag,
  type Icon,
} from '@tabler/icons-react';
import { BrandLogo } from '../../../components/BrandLogo';
import { menu } from '../../../content/menu.ru';
import { Pic } from '../components/Pic';
import { AVATARS } from '../data/pictures';

type Props = {
  readonly avatar: number | null;
  readonly onHome: () => void;
  readonly onNotify: (text: string) => void;
  readonly onAccount: (button: HTMLElement) => void;
};

type Tab = {
  readonly id: 'menu' | 'stats' | 'shops' | 'recipes';
  readonly label: string;
  readonly icon: Icon;
};

const TABS: readonly Tab[] = [
  { id: 'menu', label: menu.nav.menu, icon: IconCalendarEvent },
  { id: 'stats', label: menu.nav.stats, icon: IconChartBar },
  { id: 'shops', label: menu.nav.shops, icon: IconShoppingBag },
  { id: 'recipes', label: menu.nav.recipes, icon: IconBook2 },
];

/**
 * The app's navigation (ТЗ фаза 4 §2): a sidebar on wide screens (logo, vertical tabs, the avatar at the bottom) and
 * a bottom tab bar on phones and tablets — one list, laid out by CSS. «Статистика», «Магазины» and, until phase 6,
 * «Рецепты» answer with the demo toast.
 */
export function Nav({ avatar, onHome, onNotify, onAccount }: Props) {
  const picture = AVATARS[avatar ?? 0];
  return (
    <nav className="menu-nav" aria-label={menu.nav.label}>
      <a
        className="menu-nav-logo"
        href="./"
        aria-label={menu.nav.home}
        onClick={(event) => {
          event.preventDefault();
          onHome();
        }}
      >
        <BrandLogo sizes="64px" />
      </a>
      <ul className="menu-nav-tabs">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const active = tab.id === 'menu';
          return (
            <li key={tab.id}>
              <button
                type="button"
                className="menu-nav-tab"
                aria-current={active ? 'page' : undefined}
                data-active={active || undefined}
                onClick={() => {
                  if (!active) onNotify(menu.demoSoon);
                }}
              >
                <span className="menu-nav-icon" aria-hidden>
                  <TabIcon stroke={1.8} />
                </span>
                <span className="menu-nav-text">{tab.label}</span>
              </button>
            </li>
          );
        })}
        <li className="menu-nav-account">
          <button
            type="button"
            className="menu-nav-avatar"
            aria-label={menu.nav.account}
            aria-haspopup="menu"
            onClick={(event) => {
              onAccount(event.currentTarget);
            }}
          >
            {picture ? <Pic picture={picture} alt="" eager /> : null}
          </button>
        </li>
      </ul>
    </nav>
  );
}
