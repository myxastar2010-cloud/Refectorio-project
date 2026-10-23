import {
  DECISIVE_ANSWERS_REQUIRED,
  TASTE_ANSWERS,
  type TasteAnswer,
  type TasteDecision,
  type TasteHint,
} from '@refectorio/contracts';
import { AnimatePresence, animate, m, useIsPresent, useMotionValue } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { whenIdle } from '../../../lib/idle';
import { DURATION, EASE_OUT_SOFT, TINDER } from '../../../motion/tokens';
import { focusInStep } from '../components/choice';
import { PillButton } from '../components/PillButton';
import { PrivacyLabel } from '../components/PrivacyLabel';
import { StepFrame } from '../components/StepFrame';
import { fill, useQuiz } from '../quizContext';
import { DishCard, type CardEnter, type CardExit } from './DishCard';
import { GameControls, type Swell } from './GameControls';
import { PhotoCredit } from './PhotoCredit';
import { HOTLINKED, preloadPhoto, type PhotoSource } from './photos';
import { TasteDebug } from './TasteDebug';
import { sessionFor } from './tasteSession';

type HintName = keyof typeof quiz.taste.hintNames;
/** Hints that read as «вам нравятся …» (the «Запомнили» moment). */
const LIKE_HINTS: readonly (TasteHint & HintName)[] = [
  'likesSoups',
  'likesFish',
  'likesMeat',
  'likesVegetables',
  'likesSpicy',
  'sweetTooth',
  'likesBaking',
  'likesAsian',
  'likesPasta',
];
const MOMENT_ITEMS = 2;

/** «супы и рыба», «супы, рыба и выпечка». */
const joinRu = (items: readonly string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} ${quiz.taste.and} ${items.at(-1) ?? ''}`;

/** Letters by their place on the keyboard (works in the Russian layout too); arrows by key. */
function answerOfKey(event: KeyboardEvent): TasteAnswer | null {
  if (event.code === 'KeyA' || event.key === 'ArrowLeft') return 'dislike';
  if (event.code === 'KeyS' || event.key === 'ArrowDown') return 'skip';
  if (event.code === 'KeyD' || event.key === 'ArrowRight') return 'like';
  return null;
}

type Track = {
  readonly decisions: readonly TasteDecision[];
  readonly exit: CardExit;
  readonly enter: CardEnter;
};

/**
 * «Выберите блюдо» (ТЗ §9.1): one card at a time, 10 decisive answers (skips don't count), the Bayesian selection of
 * taste-core picks each next dish. Swipe, the three buttons or A/S/D (←/↓/→). Every answer is an entry in the browser
 * history: «Вернуться» brings the last card back from where it left.
 */
export function TasteStep() {
  const { state, dispatch, tasteAnswer, next, calm, params, announce } = useQuiz();
  const present = useIsPresent();
  const { tasteSeed: seed, tasteDecisions: decisions, tasteExhausted } = state.answers;
  const session = useMemo(() => sessionFor(seed, decisions), [seed, decisions]);
  const current = session.current();
  const complete = session.complete();
  const exhausted = session.exhausted() && !tasteExhausted;
  const decisive = session.decisiveCount();
  const skipHint = !complete && session.skipStreak() >= TINDER.skipHintAfter;

  // How the cards change, decided when the decisions change (React's «information from previous renders»).
  const [fling, setFling] = useState({ vx: 0, vy: 0 });
  const [track, setTrack] = useState<Track>(() => ({
    decisions,
    exit: { kind: 'answer', answer: 'skip', vx: 0, vy: 0 },
    enter: 'still',
  }));
  let { exit, enter } = track;
  if (track.decisions !== decisions) {
    const undone = decisions.length < track.decisions.length ? track.decisions.at(-1) : undefined;
    exit = undone
      ? { kind: 'undo' }
      : { kind: 'answer', answer: decisions.at(-1)?.answer ?? 'skip', ...fling };
    enter = undone ? { returnFrom: undone.answer } : 'rise';
    setTrack({ decisions, exit, enter });
  }

  const like = useMotionValue(0);
  const dislike = useMotionValue(0);
  const skip = useMotionValue(0);
  const swell = useMemo<Swell>(() => ({ like, dislike, skip }), [like, dislike, skip]);
  const onMove = useCallback(
    (towards: { like: number; dislike: number; skip: number }) => {
      like.set(towards.like);
      dislike.set(towards.dislike);
      skip.set(towards.skip);
    },
    [like, dislike, skip],
  );

  const [credit, setCredit] = useState<PhotoSource | null>(null);
  const lastAnswerAt = useRef(Number.NEGATIVE_INFINITY);
  const blocked = state.notices.length > 0;

  const commit = useCallback(
    (answer: TasteAnswer, velocity = { vx: 0, vy: 0 }): boolean => {
      if (!current || !present || complete || blocked) return false;
      const now = performance.now();
      if (now - lastAnswerAt.current < TINDER.answerGapMs) return false;
      lastAnswerAt.current = now;
      setFling(velocity);
      tasteAnswer({ dishId: current.id, answer });
      const left = Math.max(0, DECISIVE_ANSWERS_REQUIRED - decisive - (answer === 'skip' ? 0 : 1));
      const said =
        answer === 'skip'
          ? fill(quiz.taste.live.skip, { dish: current.nameRu })
          : fill(quiz.taste.live[answer], { dish: current.nameRu, n: left });
      const after = session.peek(answer);
      announce(after ? `${said}. ${fill(quiz.taste.live.card, { dish: after.nameRu })}` : said);
      for (const value of [like, dislike, skip])
        void animate(value, 0, { duration: DURATION.micro });
      return true;
    },
    [
      current,
      present,
      complete,
      blocked,
      tasteAnswer,
      decisive,
      session,
      announce,
      like,
      dislike,
      skip,
    ],
  );

  // Keys A/S/D and arrows (never inside a text field or under a dialog).
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);
  useEffect(() => {
    if (!present) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (
        (event.target as Element | null)?.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      if (document.querySelector('[aria-modal="true"]') || !focusInStep()) return;
      const answer = answerOfKey(event);
      if (!answer) return;
      event.preventDefault();
      commitRef.current(answer);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [present]);

  // «Вернуться» brought a card back: say which.
  const undone = typeof enter === 'object' ? (current?.nameRu ?? null) : null;
  useEffect(() => {
    if (undone) announce(fill(quiz.taste.live.undo, { dish: undone }));
  }, [undone, announce]);

  // Lookahead: the card after each possible answer is fetched and decoded while this one is shown — one per idle
  // period (all three at once made one long task while the next card flew in: performance audit, F4).
  useEffect(() => {
    if (!current) return undefined;
    let cancel: () => void = () => undefined;
    let index = 0;
    const lookAhead = () => {
      const answer = TASTE_ANSWERS[index];
      index += 1;
      if (!answer) return;
      const upcoming = session.peek(answer);
      if (upcoming) preloadPhoto(upcoming.id);
      cancel = whenIdle(lookAhead, TINDER.lookaheadIdleMs);
    };
    cancel = whenIdle(lookAhead, TINDER.lookaheadIdleMs);
    return () => {
      cancel();
    };
  }, [session, current]);

  // The tenth decisive answer: «Запомнили…» (when the posterior is confident), then the quiz moves on by itself.
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  }, [next]);
  const [moment, setMoment] = useState<string | null>(null);
  useEffect(() => {
    if (!complete || !present || params.tasteDebug) return undefined;
    announce(quiz.taste.live.done);
    const names = session
      .profile()
      .hints.map((h) => h.hint)
      .filter((hint): hint is TasteHint & HintName =>
        (LIKE_HINTS as readonly string[]).includes(hint),
      )
      .slice(0, MOMENT_ITEMS)
      .map((hint) => quiz.taste.hintNames[hint]);
    const text = names.length > 0 ? fill(quiz.taste.remembered, { list: joinRu(names) }) : null;
    const flyMs = calm ? 0 : TINDER.flyDurationMs;
    const show = window.setTimeout(() => {
      setMoment(text);
    }, flyMs * TINDER.momentAtShare);
    const leave = window.setTimeout(
      () => {
        nextRef.current();
      },
      flyMs + (text ? TINDER.rememberedMs : 0),
    );
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(leave);
    };
  }, [complete, present, params.tasteDebug, session, calm, announce]);
  const momentShown = complete ? moment : null;

  if (complete && params.tasteDebug) {
    return (
      <StepFrame icon={null} title={quiz.taste.title} privacy={false} className="quiz-frame--taste">
        <TasteDebug seed={seed} decisions={decisions} onContinue={next} />
      </StepFrame>
    );
  }

  return (
    <StepFrame icon={null} title={quiz.taste.title} privacy={false} className="quiz-frame--taste">
      <div className="quiz-privacy quiz-privacy--top">
        <PrivacyLabel />
      </div>
      <div className="quiz-card-stage">
        <AnimatePresence custom={exit} initial={false}>
          {current ? (
            <DishCard
              key={current.id}
              dish={current}
              enter={enter}
              interactive={!complete && !blocked}
              calm={calm}
              onSwipe={commit}
              onMove={onMove}
              onSource={HOTLINKED ? setCredit : undefined}
            />
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {momentShown ? (
            <m.p
              key="moment"
              className="quiz-game-moment"
              initial={{ opacity: 0, transform: 'translateY(8px)' }}
              animate={{
                opacity: 1,
                transform: 'translateY(0px)',
                transition: { duration: DURATION.fade, ease: EASE_OUT_SOFT },
              }}
              exit={{ opacity: 0, transition: { duration: DURATION.micro } }}
            >
              {momentShown}
            </m.p>
          ) : null}
        </AnimatePresence>
        {exhausted ? (
          <div className="quiz-game-exhausted">
            <p>{quiz.taste.exhausted}</p>
            <PillButton
              tone="accent"
              onClick={() => {
                dispatch({ type: 'tasteExhausted' });
                next();
              }}
            >
              {quiz.taste.exhaustedContinue}
            </PillButton>
          </div>
        ) : null}
      </div>
      <GameControls swell={swell} disabled={!current || complete || blocked} onAnswer={commit} />
      {HOTLINKED ? <PhotoCredit source={current ? credit : null} /> : null}
      <AnimatePresence>
        {skipHint ? (
          <m.p
            key="skip-hint"
            className="quiz-game-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DURATION.fade } }}
            exit={{ opacity: 0, transition: { duration: DURATION.micro } }}
          >
            {quiz.taste.skipHint}
          </m.p>
        ) : null}
      </AnimatePresence>
    </StepFrame>
  );
}
