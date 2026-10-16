import type { TasteDecision } from '@refectorio/contracts';
import { useMemo } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { PillButton } from '../components/PillButton';
import { formatNumber } from '../quizContext';
import { preparedCatalog, tasteProfileOf } from './tasteSession';

const TOP = 12;

/**
 * `?taste=debug` (ТЗ §9.5, a human check): after the game — what the algorithm understood: the 12 unseen dishes it
 * expects you to like and to dislike, its confident hints and the strongest taste weights.
 */
export function TasteDebug({
  seed,
  decisions,
  onContinue,
}: {
  readonly seed: number;
  readonly decisions: readonly TasteDecision[];
  readonly onContinue: () => void;
}) {
  const view = useMemo(() => {
    const profile = tasteProfileOf(seed, decisions);
    const names = new Map(preparedCatalog().dishes.map((dish) => [dish.id, dish.nameRu]));
    const seen = new Set(decisions.map((d) => d.dishId));
    const unseen = profile.predictions
      .filter((p) => !seen.has(p.dishId))
      .sort((a, b) => b.pLike - a.pLike);
    const row = (p: { dishId: string; pLike: number }) => ({
      id: p.dishId,
      name: names.get(p.dishId) ?? p.dishId,
      percent: Math.round(p.pLike * 100),
    });
    return {
      liked: unseen.slice(0, TOP).map(row),
      disliked: unseen.slice(-TOP).reverse().map(row),
      hints: profile.hints,
      weights: [...profile.features]
        .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean))
        .slice(0, TOP),
    };
  }, [seed, decisions]);

  return (
    <div className="quiz-taste-debug">
      <h3 className="quiz-taste-debug-title">{quiz.taste.debugTitle}</h3>
      <div className="quiz-taste-debug-columns">
        <section>
          <h4>{quiz.taste.debugLiked}</h4>
          <ol>
            {view.liked.map((dish) => (
              <li key={dish.id}>
                {dish.name} — {dish.percent} %
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h4>{quiz.taste.debugDisliked}</h4>
          <ol>
            {view.disliked.map((dish) => (
              <li key={dish.id}>
                {dish.name} — {dish.percent} %
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="quiz-taste-debug-code">
        {view.hints.map((h) => `${h.hint} ${Math.round(h.confidence * 100)} %`).join(' · ') || '—'}
      </p>
      <p className="quiz-taste-debug-code">
        {view.weights
          .map((w) => `${w.id} ${formatNumber(w.mean)} ± ${formatNumber(Math.sqrt(w.variance))}`)
          .join(' · ')}
      </p>
      <PillButton tone="accent" onClick={onContinue}>
        {quiz.common.next}
      </PillButton>
    </div>
  );
}
