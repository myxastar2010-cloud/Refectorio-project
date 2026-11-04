import {
  IconBell,
  IconDownload,
  IconExternalLink,
  IconLifebuoy,
  IconLogin2,
  IconMessageCircle,
  IconTrash,
  IconUserCircle,
} from '@tabler/icons-react';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import { Pic } from '../components/Pic';
import { Popover, Submenu } from '../components/Popover';
import { AVATARS } from '../data/pictures';

type Props = {
  readonly anchor: HTMLElement | null;
  readonly avatar: number | null;
  readonly dailyDigest: boolean;
  /** `?demo=week`: the synthetic history is on (the team's demo). */
  readonly demoHistory: boolean;
  readonly onClose: () => void;
  readonly onAvatar: (index: number) => void;
  readonly onNotifications: () => void;
  readonly onDigest: (on: boolean) => void;
  readonly onSupport: () => void;
  readonly onDownload: () => void;
  readonly onWipe: () => void;
  readonly onLogin: () => void;
};

/**
 * Account-lite (ТЗ фаза 4 §12, decision 1): no login yet — «Гость», the avatar (nine to choose from), notifications and
 * the daily digest, support (Kiki or a GitHub issue), the person's data (download, delete) and «Войти» (a demo toast).
 */
export function AccountMenu({
  anchor,
  avatar,
  dailyDigest,
  demoHistory,
  onClose,
  onAvatar,
  onNotifications,
  onDigest,
  onSupport,
  onDownload,
  onWipe,
  onLogin,
}: Props) {
  const picture = AVATARS[avatar ?? 0];
  return (
    <Popover
      anchor={anchor}
      label={menu.account.label}
      role="menu"
      className="popover--account"
      onClose={onClose}
    >
      <div className="account-head">
        {picture ? <Pic picture={picture} alt="" className="account-avatar" /> : null}
        <span className="account-name">
          {menu.account.guest}
          <span>{demoHistory ? menu.account.demoHistory : menu.account.guestNote}</span>
        </span>
      </div>
      <Submenu label={menu.account.avatar} icon={IconUserCircle}>
        <div className="account-avatars">
          {AVATARS.map((choice, index) => (
            <button
              key={choice.src}
              type="button"
              role="menuitemradio"
              aria-checked={avatar === index}
              aria-label={fill(menu.account.avatarItem, { n: index + 1 })}
              className="account-avatar-choice"
              onClick={() => {
                onAvatar(index);
              }}
            >
              <Pic picture={choice} alt="" />
            </button>
          ))}
        </div>
      </Submenu>
      <button type="button" role="menuitem" className="menu-item" onClick={onNotifications}>
        <IconBell stroke={1.8} aria-hidden />
        {menu.account.notifications}
      </button>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={dailyDigest}
        className="menu-item menu-item--switch"
        onClick={() => {
          onDigest(!dailyDigest);
        }}
      >
        <span className="menu-switch" aria-hidden />
        {menu.news.digest}
      </button>
      <Submenu label={menu.account.support} icon={IconLifebuoy}>
        <button type="button" role="menuitem" className="menu-item" onClick={onSupport}>
          <IconMessageCircle stroke={1.8} aria-hidden />
          {menu.account.supportKiki}
        </button>
        <a
          role="menuitem"
          className="menu-item"
          href={menu.account.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
        >
          <IconExternalLink stroke={1.8} aria-hidden />
          {menu.account.report}
        </a>
      </Submenu>
      <button type="button" role="menuitem" className="menu-item" onClick={onDownload}>
        <IconDownload stroke={1.8} aria-hidden />
        {menu.account.download}
      </button>
      <button
        type="button"
        role="menuitem"
        className="menu-item menu-item--danger"
        onClick={onWipe}
      >
        <IconTrash stroke={1.8} aria-hidden />
        {menu.account.wipe}
      </button>
      <button type="button" role="menuitem" className="menu-item" onClick={onLogin}>
        <IconLogin2 stroke={1.8} aria-hidden />
        {menu.account.login}
      </button>
    </Popover>
  );
}
