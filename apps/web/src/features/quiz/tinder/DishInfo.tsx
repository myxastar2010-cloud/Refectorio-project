import type { Dish } from '@refectorio/taste-core';
import { animate, m, useMotionValue, type Variants } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { DURATION, EASE_IN_OUT, EASE_OUT_SOFT, TINDER } from '../../../motion/tokens';
import { fill } from '../quizContext';
import { cuisineLine, formatEnergy, formatGrams, numbersFor, type DishText } from './dishData';

/** Mockup proportions of the 448 × 583 card (tokens.css --quiz-info-*). */
const CARD_H = 583;
const INFO_GAP = 34;
const CHEVRON_OPEN_Y = 520;
/** The closed chevron's button starts this far above the name's bottom (its glyph sits right under the name). */
const CHEVRON_UNDER_NAME_PX = 6;

/**
 * The info fits the card at every size without scrolling (§5.4): each level gives up a little more — smaller text,
 * the values 2 × 2, no cuisine line, the short description, smaller still; on the tiniest cards (low landscape
 * phones) the name moves into the text and the info takes its place, and last the values give way to the description
 * (styles: .quiz-card-info[data-fit]).
 */
const FIT_LEVELS = 8;
function fitInfo(info: HTMLElement) {
  for (let level = 0; level < FIT_LEVELS; level += 1) {
    info.dataset.fit = String(level);
    if (info.scrollHeight <= info.clientHeight) return;
  }
}

/** Where the name ends (px from the card's top): the info starts below it and the closed chevron sits right under it. */
function nameBottom(card: HTMLElement): number {
  const name = card.querySelector<HTMLElement>('.quiz-card-name');
  return name ? name.offsetTop + name.offsetHeight : card.offsetHeight * 0.2;
}

type InfoProps = {
  readonly id: string;
  readonly dish: Dish;
  readonly open: boolean;
  readonly calm: boolean;
  /** null: the descriptions are still loading (a skeleton line). */
  readonly text: DishText | null;
  readonly deemphasize: boolean;
  /** Changes when the card is resized. */
  readonly measured: number;
};

/**
 * The open card's info (design «описание для карточек блюд»): energy, protein, fat and carbohydrate per one standard
 * portion, the cuisine of a less familiar dish, and the description that continues the name. It comes in blurred,
 * moving down a little; reduced motion — a cross-fade.
 */
export function DishInfo({ id, dish, open, calm, text, deemphasize, measured }: InfoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const numbers = deemphasize ? null : numbersFor(dish.id);
  const cuisine = cuisineLine(dish);

  // Placed below the name and fitted before the open card is painted; again when the card is resized or the text comes.
  useLayoutEffect(() => {
    const info = ref.current;
    const card = info?.parentElement;
    if (!info || !card || !open) return;
    info.style.setProperty(
      '--info-top',
      `${nameBottom(card) + (card.offsetHeight * INFO_GAP) / CARD_H}px`,
    );
    fitInfo(info);
  }, [open, text, measured]);

  const variants: Variants = calm
    ? {
        open: { opacity: 1, visibility: 'visible', transition: { duration: DURATION.fade } },
        closed: {
          opacity: 0,
          transition: { duration: DURATION.fade },
          transitionEnd: { visibility: 'hidden' },
        },
      }
    : {
        open: {
          opacity: 1,
          y: 0,
          filter: `blur(0px)`,
          visibility: 'visible',
          transition: {
            duration: TINDER.info.openS,
            delay: TINDER.info.textDelayS,
            ease: EASE_OUT_SOFT,
          },
          transitionEnd: { filter: 'none' },
        },
        closed: {
          opacity: 0,
          transition: { duration: TINDER.info.closeS * 0.6, ease: EASE_IN_OUT },
          transitionEnd: {
            visibility: 'hidden',
            y: TINDER.info.textShiftPx,
            filter: `blur(${String(TINDER.info.textBlurPx)}px)`,
          },
        },
      };

  return (
    <m.div
      ref={ref}
      id={id}
      role="region"
      aria-label={fill(quiz.taste.info.region, { dish: dish.nameRu })}
      aria-hidden={!open || undefined}
      className="quiz-card-info"
      initial={false}
      animate={open ? 'open' : 'closed'}
      variants={variants}
    >
      {numbers ? (
        <dl className="quiz-card-values">
          <div>
            <dt>{quiz.taste.info.energy}</dt>
            <dd>{formatEnergy(numbers.energyKcal)}</dd>
          </div>
          <div>
            <dt>{quiz.taste.info.protein}</dt>
            <dd>{formatGrams(numbers.proteinG)}</dd>
          </div>
          <div>
            <dt>{quiz.taste.info.fat}</dt>
            <dd>{formatGrams(numbers.fatG)}</dd>
          </div>
          <div>
            <dt>{quiz.taste.info.carbs}</dt>
            <dd>{formatGrams(numbers.carbsG)}</dd>
          </div>
        </dl>
      ) : null}
      {numbers ? <p className="quiz-card-portion">{quiz.taste.info.portionNote}</p> : null}
      {cuisine ? <p className="quiz-card-cuisine">{cuisine}</p> : null}
      {text ? (
        <p className="quiz-card-text">
          <span className="quiz-card-text-long">
            {quiz.taste.info.lead} {text.long}
          </span>
          <span className="quiz-card-text-short">
            <span className="quiz-card-text-name">{dish.nameRu} </span>
            {quiz.taste.info.lead} {text.short}
          </span>
        </p>
      ) : (
        <p className="quiz-card-skeleton">
          <span className="visually-hidden">{quiz.taste.info.loading}</span>
        </p>
      )}
    </m.div>
  );
}

/** The hint runs once per page: on the first card, the first time the game is seen. */
let nudged = false;

type ChevronProps = {
  readonly controls: string;
  readonly open: boolean;
  readonly calm: boolean;
  readonly nudge: boolean;
  readonly enabled: boolean;
  readonly cardRef: RefObject<HTMLElement | null>;
  readonly measured: number;
  readonly onToggle: () => void;
};

/**
 * The wide chevron (§5.1): right under the name pointing down; open, it glides to the bottom of the card and points up.
 * A real button for the keyboard (Enter, Space) and screen readers; a pointer tap is handled by the card itself, which
 * tells a tap from a drag.
 */
export function InfoChevron({
  controls,
  open,
  calm,
  nudge,
  enabled,
  cardRef,
  measured,
  onToggle,
}: ChevronProps) {
  const button = useRef<HTMLButtonElement>(null);
  const glyph = useRef<HTMLSpanElement>(null);
  const y = useMotionValue(0);
  const rotate = useMotionValue(0);
  const wasOpen = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const element = button.current;
    if (!card || !element) return undefined;
    const height = card.offsetHeight;
    const target = open
      ? (height * CHEVRON_OPEN_Y) / CARD_H - element.offsetHeight / 2
      : nameBottom(card) - CHEVRON_UNDER_NAME_PX;
    const turned = open ? 180 : 0;
    const toggled = wasOpen.current !== null && wasOpen.current !== open;
    wasOpen.current = open;
    // A resize (or the first placement) moves it at once; a toggle glides.
    if (!toggled || calm) {
      y.set(target);
      rotate.set(turned);
      return undefined;
    }
    const glide = animate(y, target, TINDER.info.chevron);
    const turn = animate(rotate, turned, TINDER.info.chevron);
    return () => {
      glide.stop();
      turn.stop();
    };
  }, [open, measured, calm, cardRef, y, rotate]);

  useEffect(() => {
    if (!nudge || nudged || calm || open) return undefined;
    const timer = window.setTimeout(() => {
      const element = glyph.current;
      if (!element) return;
      nudged = true;
      const px = TINDER.info.nudgePx;
      void animate(
        element,
        { transform: ['translateY(0px)', `translateY(${String(px)}px)`, 'translateY(0px)'] },
        { duration: TINDER.info.nudgeS / 2, repeat: 1, ease: 'easeInOut' },
      );
    }, TINDER.info.nudgeDelayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [nudge, calm, open]);

  return (
    <m.button
      ref={button}
      type="button"
      className="quiz-card-toggle"
      style={{ y, x: '-50%' }}
      aria-label={quiz.taste.info.toggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-keyshortcuts="ArrowDown ArrowUp"
      tabIndex={enabled ? 0 : -1}
      disabled={!enabled}
      onClick={(event) => {
        // Pointer taps are the card's (tap or drag); this is Enter, Space and assistive technology.
        if (event.detail === 0) onToggle();
      }}
    >
      <span ref={glyph} className="quiz-card-chevron-nudge">
        <m.svg className="quiz-card-chevron" viewBox="0 0 38 12" aria-hidden style={{ rotate }}>
          <path
            d="M2.5 2.5 19 9.5 35.5 2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </m.svg>
      </span>
    </m.button>
  );
}
