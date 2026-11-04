import type { QuizAnswersV1 } from '@refectorio/contracts';
import type { Alternative, Plan, SlotRef } from '@refectorio/menu-core';
import { IconListDetails, IconPencil, IconReplace, IconSparkles } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import { photosFor } from '../../quiz/tinder/photos';
import { Popover, Submenu } from '../components/Popover';
import type { Catalog } from '../data/catalog';
import { ROLE_ICONS } from './roleIcons';
import { useAlternatives } from './useReplace';

/** A dish of the visible meal the ⋯ menu or the picker is about. */
export type DishTarget = {
  readonly anchor: HTMLElement;
  readonly slot: SlotRef;
  readonly itemId: string;
  /** Why it cannot be replaced (a past day, eaten, pinned by a rule), or null. */
  readonly blocked: string | null;
};

type MenuProps = {
  readonly target: DishTarget | null;
  readonly catalog: Catalog;
  readonly onClose: () => void;
  readonly onDetails: (target: DishTarget) => void;
  readonly onReplaceAi: (target: DishTarget) => void;
  readonly onReplaceSelf: () => void;
  readonly onBlocked: (reason: string) => void;
};

/**
 * The dish's ⋯ menu (ТЗ фаза 4 §7): «Подробнее» and «Заменить блюдо ▸» with «Заменить с ИИ» / «Заменить самому» to the
 * side. A dish that cannot change keeps the item, says why under it and in a toast.
 */
export function DishMenu({
  target,
  catalog,
  onClose,
  onDetails,
  onReplaceAi,
  onReplaceSelf,
  onBlocked,
}: MenuProps) {
  const name = target ? (catalog.get(target.itemId)?.nameRu ?? '') : '';
  return (
    <Popover
      anchor={target?.anchor ?? null}
      label={fill(menu.dish.menuLabel, { name })}
      role="menu"
      onClose={onClose}
    >
      {target ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              onDetails(target);
            }}
          >
            <IconListDetails stroke={1.8} aria-hidden />
            {menu.dish.details}
          </button>
          {target.blocked ? (
            <button
              type="button"
              role="menuitem"
              className="menu-item menu-item--two"
              aria-disabled
              onClick={() => {
                onBlocked(target.blocked ?? '');
              }}
            >
              <IconReplace stroke={1.8} aria-hidden />
              <span className="menu-item-label">
                {menu.dish.replace}
                <span className="menu-item-note">{target.blocked}</span>
              </span>
            </button>
          ) : (
            <Submenu label={menu.dish.replace} icon={IconReplace}>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  onReplaceAi(target);
                }}
              >
                <IconSparkles stroke={1.8} aria-hidden />
                {menu.dish.replaceAi}
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={onReplaceSelf}>
                <IconPencil stroke={1.8} aria-hidden />
                {menu.dish.replaceSelf}
              </button>
            </Submenu>
          )}
        </>
      ) : null}
    </Popover>
  );
}

type PickerProps = {
  readonly target: DishTarget | null;
  readonly plan: Plan;
  readonly answers: QuizAnswersV1 | null;
  readonly catalog: Catalog;
  readonly onClose: () => void;
  readonly onPick: (target: DishTarget, alternative: Alternative) => void;
};

/**
 * «Заменить с ИИ» until Kiki is connected (ТЗ фаза 4 §7): the engine's ranked replacements for the slot — dishes the
 * safety filter, the rules and the day's limits allow — each with its reasons; a choice re-solves the day.
 */
export function ReplacePicker({ target, plan, answers, catalog, onClose, onPick }: PickerProps) {
  const name = target ? (catalog.get(target.itemId)?.nameRu ?? '') : '';
  const title = fill(menu.dish.replaceTitle, { name });
  return (
    <Popover
      anchor={target?.anchor ?? null}
      label={title}
      role="dialog"
      className="popover--replace"
      onClose={onClose}
    >
      {target ? (
        <PickerBody
          target={target}
          plan={plan}
          answers={answers}
          catalog={catalog}
          title={title}
          onPick={onPick}
        />
      ) : null}
    </Popover>
  );
}

function PickerBody({
  target,
  plan,
  answers,
  catalog,
  title,
  onPick,
}: Omit<PickerProps, 'target' | 'onClose'> & {
  readonly target: DishTarget;
  readonly title: string;
}) {
  const { list, error } = useAlternatives(plan, answers, target.slot);
  const listRef = useRef<HTMLUListElement>(null);

  // The options arrive after the popover opened: the first one takes the focus if it is still at the ⋯ button.
  useEffect(() => {
    if (!list?.length) return;
    const box = listRef.current?.closest('.popover');
    if (box && !box.contains(document.activeElement))
      listRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [list]);

  return (
    <div className="replace">
      <p className="replace-title">{title}</p>
      <p className="replace-hint">{menu.dish.replaceHint}</p>
      {list === null ? (
        <ul className="replace-list" aria-busy>
          <li className="visually-hidden">{menu.dish.replaceLoading}</li>
          {[0, 1, 2].map((i) => (
            <li key={i} className="replace-option replace-option--ghost" aria-hidden />
          ))}
        </ul>
      ) : list.length === 0 ? (
        <p className="replace-empty">{error ?? menu.dish.replaceNone}</p>
      ) : (
        <ul ref={listRef} className="replace-list">
          {list.map((alternative) => {
            const view = catalog.get(alternative.itemId);
            if (!view) return null;
            const photo = photosFor(view.id).sources[0];
            const RoleIcon = ROLE_ICONS[view.role];
            return (
              <li key={alternative.itemId}>
                <button
                  type="button"
                  className="replace-option"
                  onClick={() => {
                    onPick(target, alternative);
                  }}
                >
                  <span className="replace-thumb" aria-hidden>
                    {photo ? (
                      <img
                        src={photo.src}
                        srcSet={photo.srcSet}
                        sizes="56px"
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    ) : (
                      <RoleIcon stroke={1.5} />
                    )}
                  </span>
                  <span className="replace-text">
                    <span className="replace-name">{view.nameRu}</span>
                    <span className="replace-why">
                      {[...alternative.reasons]
                        // The taste match is common to most choices: the reasons that tell them apart go first.
                        .sort((x, y) => Number(x === 'tasteMatch') - Number(y === 'tasteMatch'))
                        .slice(0, 2)
                        .map((code) => menu.reasons[code])
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
