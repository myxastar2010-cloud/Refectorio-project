import {
  IconCalendarEvent,
  IconCode,
  IconDownload,
  IconFileText,
  IconFileTypePdf,
  IconPhoto,
  IconRefresh,
  IconTable,
  IconTarget,
  IconUpload,
  type Icon,
} from '@tabler/icons-react';
import { menu } from '../../../content/menu.ru';
import { Popover, Submenu } from '../components/Popover';
import type { ExportFormat } from '../export';

/** The download formats in the menu's order (the export chunk itself loads on the first click). */
const FORMATS: readonly { readonly id: ExportFormat; readonly icon: Icon }[] = [
  { id: 'png', icon: IconPhoto },
  { id: 'jpeg', icon: IconPhoto },
  { id: 'pdf', icon: IconFileTypePdf },
  { id: 'xlsx', icon: IconTable },
  { id: 'csv', icon: IconTable },
  { id: 'ics', icon: IconCalendarEvent },
  { id: 'txt', icon: IconFileText },
  { id: 'json', icon: IconCode },
];

type Props = {
  readonly anchor: HTMLElement | null;
  readonly onClose: () => void;
  readonly onGoal: () => void;
  readonly onRegenerate: () => void;
  readonly onDownload: (format: ExportFormat) => void;
  readonly onRestore: () => void;
};

/**
 * The top bar's ⋯ (ТЗ фаза 4 §10): «Изменить цель», «Перегенерировать меню», «Скачать меню ▸» (eight formats) and
 * «Загрузить меню из файла».
 */
export function MoreMenu({ anchor, onClose, onGoal, onRegenerate, onDownload, onRestore }: Props) {
  return (
    <Popover anchor={anchor} label={menu.more.label} role="menu" onClose={onClose}>
      <button type="button" role="menuitem" className="menu-item" onClick={onGoal}>
        <IconTarget stroke={1.8} aria-hidden />
        {menu.more.goal}
      </button>
      <button type="button" role="menuitem" className="menu-item" onClick={onRegenerate}>
        <IconRefresh stroke={1.8} aria-hidden />
        {menu.more.regenerate}
      </button>
      <Submenu label={menu.more.download} icon={IconDownload}>
        {FORMATS.map(({ id, icon: FormatIcon }) => (
          <button
            key={id}
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              onDownload(id);
            }}
          >
            <FormatIcon stroke={1.8} aria-hidden />
            {menu.export.formats[id]}
          </button>
        ))}
      </Submenu>
      <button type="button" role="menuitem" className="menu-item" onClick={onRestore}>
        <IconUpload stroke={1.8} aria-hidden />
        {menu.more.restore}
      </button>
    </Popover>
  );
}
