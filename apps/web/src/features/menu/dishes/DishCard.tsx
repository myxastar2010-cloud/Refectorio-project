import type { ItemView } from '@refectorio/menu-core';
import { IconArrowUpRight, IconDots, IconPlus } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { memo } from 'react';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import { useCalmMotion } from '../../../motion/hooks';
import { EASE_OUT_EXPO, MENU } from '../../../motion/tokens';
import { photosFor, PHOTO_SIZES } from '../../quiz/tinder/photos';
import { ROLE_ICONS } from './roleIcons';

type Props = {
  readonly item: ItemView;
  readonly eaten: boolean;
  /** Why «+» is unavailable (a future day, too old), or null. */
  readonly lockedReason: string | null;
  readonly onToggle: () => void;
  readonly onMore: (button: HTMLElement) => void;
  /** Details: grown from this card. */
  readonly onOpen: (card: HTMLElement) => void;
  readonly onRecipe: () => void;
};

/**
 * A dish of the meal (ТЗ фаза 4 §7, mockup): a large rounded photo, the name in white over a soft top gradient, and
 * the buttons «Рецепт ↗», ⋯ and «+» (eaten: the accent circle with a drawn ✓). The gradients use the pre-blurred copy
 * of the photo under a mask (D-029: no live blur on photos). Click / Enter — details; right click — the ⋯ menu.
 */
export const DishCard = memo(function DishCard({
  item,
  eaten,
  lockedReason,
  onToggle,
  onMore,
  onOpen,
  onRecipe,
}: Props) {
  const calm = useCalmMotion();
  const photos = photosFor(item.id);
  const source = photos.sources[0];
  const RoleIcon = ROLE_ICONS[item.role];
  return (
    <article
      className="dish-card"
      data-eaten={eaten || undefined}
      style={photos.avgColor ? { backgroundColor: photos.avgColor } : undefined}
      onClick={(event) => {
        // The whole card opens the details; its own buttons and link do their own thing.
        if ((event.target as Element).closest('button, a')) return;
        onOpen(event.currentTarget);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMore(event.currentTarget.querySelector<HTMLElement>('.dish-more') ?? event.currentTarget);
      }}
    >
      <div className="dish-photo" aria-hidden>
        {source ? (
          <picture>
            {source.avifSrcSet ? (
              <source type="image/avif" srcSet={source.avifSrcSet} sizes={PHOTO_SIZES} />
            ) : null}
            <img
              src={source.src}
              srcSet={source.srcSet}
              sizes={PHOTO_SIZES}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </picture>
        ) : (
          <span className="dish-placeholder" data-role={item.role}>
            <RoleIcon stroke={1.5} />
          </span>
        )}
        {photos.blurred ? (
          <>
            <img
              className="dish-blur dish-blur--top"
              src={photos.blurred}
              alt=""
              draggable={false}
            />
            <img
              className="dish-blur dish-blur--bottom"
              src={photos.blurred}
              alt=""
              draggable={false}
            />
          </>
        ) : null}
      </div>
      <h3 className="dish-title">
        <button
          type="button"
          className="dish-open"
          onClick={(event) => {
            onOpen(event.currentTarget.closest<HTMLElement>('.dish-card') ?? event.currentTarget);
          }}
        >
          {item.nameRu}
        </button>
      </h3>
      <div className="dish-actions">
        <a
          className="dish-recipe"
          href={`#recipes/${item.id}`}
          aria-label={fill(menu.dish.recipeLabel, { name: item.nameRu })}
          onClick={(event) => {
            event.preventDefault();
            onRecipe();
          }}
        >
          {menu.dish.recipe}
          <IconArrowUpRight stroke={2.4} aria-hidden />
        </a>
        <button
          type="button"
          className="dish-round dish-more"
          aria-label={fill(menu.dish.more, { name: item.nameRu })}
          aria-haspopup="menu"
          onClick={(event) => {
            onMore(event.currentTarget);
          }}
        >
          <IconDots stroke={2.4} aria-hidden />
        </button>
        <button
          type="button"
          className="dish-round dish-eat"
          aria-pressed={eaten}
          aria-disabled={lockedReason !== null || undefined}
          aria-label={fill(eaten ? menu.dish.uneaten : menu.dish.eaten, { name: item.nameRu })}
          title={lockedReason ?? undefined}
          onClick={onToggle}
        >
          <AnimatePresence initial={false}>
            {eaten && (
              <m.span
                key="fill"
                className="dish-eat-fill"
                aria-hidden
                initial={calm ? { opacity: 0 } : { scale: MENU.eaten.fillFromScale, opacity: 0 }}
                animate={calm ? { opacity: 1 } : { scale: 1, opacity: 1, transition: MENU.spring }}
                exit={{ opacity: 0, transition: { duration: MENU.eaten.checkS / 2 } }}
              />
            )}
          </AnimatePresence>
          {eaten ? (
            <svg viewBox="0 0 24 24" className="dish-check" aria-hidden>
              <m.path
                d="M5 12.5l4.5 4.5L19 7.5"
                initial={calm ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: MENU.eaten.checkS, ease: EASE_OUT_EXPO }}
              />
            </svg>
          ) : (
            <IconPlus stroke={2.4} aria-hidden />
          )}
        </button>
      </div>
    </article>
  );
});
