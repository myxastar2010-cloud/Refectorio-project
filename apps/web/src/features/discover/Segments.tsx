import {
  IconArrowRight,
  IconCompassFilled,
  IconClockFilled,
  IconPlayerPlayFilled,
  IconRefresh,
} from '@tabler/icons-react';
import { useState, type CSSProperties } from 'react';
import { discover } from '../../content/discover.ru';

type Kind = 'explorer' | 'timesaver';

type Props = {
  readonly hasMenu: boolean;
  readonly onCreateMenu: () => void;
};

const KIND_ICON = { explorer: IconCompassFilled, timesaver: IconClockFilled } as const;
const KINDS = ['explorer', 'timesaver'] as const;
const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const fill = (template: string, values: Readonly<Record<string, string | number>>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

/**
 * Who ПроЛанч is for: the two portraits (искатель впечатлений, ценитель времени) and, under them, the big plaque of the
 * 30-second test that says which one you are. The plaque has three states: the invitation, the five questions, the result.
 */
export function Segments({ hasMenu, onCreateMenu }: Props) {
  const { segments, quiz } = discover;
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<readonly Kind[]>([]);
  const step = answers.length;
  const total = quiz.questions.length;
  const finished = step >= total;
  const explorers = answers.filter((answer) => answer === 'explorer').length;
  const explorerShare = finished ? Math.round((explorers / answers.length) * 100) : 0;
  const winner: Kind = explorers * 2 > answers.length ? 'explorer' : 'timesaver';
  const nameOf = (id: Kind) => segments.kinds.find((kind) => kind.id === id)?.name ?? '';
  const question = quiz.questions[step];
  const result = quiz.results[winner];
  const state = !started ? 'idle' : finished ? 'done' : 'asking';
  // The ring is the clock of the test: full at the invitation, filling with the answers, full again at the end.
  const progress = state === 'asking' ? step / total : 1;

  const restart = () => {
    setAnswers([]);
    setStarted(true);
  };

  return (
    <section className="dsc-section" id="dsc-segments" aria-labelledby="dsc-segments-title">
      <header className="dsc-head" data-reveal>
        <p className="dsc-eyebrow">{segments.eyebrow}</p>
        <h2 id="dsc-segments-title" className="dsc-title">
          {segments.title}
        </h2>
        <p className="dsc-lead">{segments.lead}</p>
      </header>

      <ul className="dsc-kinds">
        {segments.kinds.map((kind, index) => {
          const Glyph = KIND_ICON[kind.id];
          const active = finished && started && winner === kind.id;
          return (
            <li
              key={kind.id}
              className="dsc-kind"
              data-kind={kind.id}
              data-active={active || undefined}
              data-reveal
              style={{ '--d': `${index * 90}ms` } as CSSProperties}
            >
              <span className="dsc-kind-icon">
                <Glyph aria-hidden />
              </span>
              <h3>{kind.name}</h3>
              <p className="dsc-kind-tag">{kind.tagline}</p>
              <ul className="dsc-ticks">
                {kind.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              {active && <span className="dsc-kind-badge">{quiz.resultLabel}</span>}
            </li>
          );
        })}
      </ul>

      <div
        className="dsc-plaque dsc-quiz"
        data-reveal
        data-state={state}
        data-kind={state === 'done' ? winner : undefined}
      >
        <div className="dsc-clock" aria-hidden>
          <svg viewBox="0 0 120 120" className="dsc-clock-ring">
            <circle className="dsc-clock-track" cx="60" cy="60" r={RING_RADIUS} />
            <circle
              className="dsc-clock-value"
              cx="60"
              cy="60"
              r={RING_RADIUS}
              style={{
                strokeDasharray: RING_LENGTH,
                strokeDashoffset: RING_LENGTH * (1 - progress),
              }}
            />
          </svg>
          <div className="dsc-clock-label">
            <b>{quiz.seconds}</b>
            <span>{quiz.secondsUnit}</span>
          </div>
        </div>

        <div className="dsc-plaque-main" aria-live="polite">
          {state === 'idle' && (
            <div className="dsc-plaque-pane">
              <p className="dsc-eyebrow">{quiz.eyebrow}</p>
              <h3 className="dsc-plaque-title">{quiz.title}</h3>
              <p className="dsc-plaque-lead">{quiz.lead}</p>
              <ul className="dsc-chips">
                {quiz.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
              <div className="dsc-actions">
                <button
                  type="button"
                  className="dsc-btn dsc-btn--big"
                  onClick={() => {
                    setStarted(true);
                  }}
                >
                  <IconPlayerPlayFilled aria-hidden />
                  {quiz.start}
                </button>
              </div>
            </div>
          )}

          {state === 'asking' && question && (
            <div className="dsc-plaque-pane dsc-quiz-body" key={step}>
              <p className="dsc-eyebrow">{fill(quiz.step, { n: step + 1, total })}</p>
              <div className="dsc-dots" aria-hidden>
                {quiz.questions.map((_, index) => (
                  <span
                    key={index}
                    data-state={index < step ? 'done' : index === step ? 'now' : undefined}
                  />
                ))}
              </div>
              <p className="dsc-question">{question.text}</p>
              <div className="dsc-answers">
                {KINDS.map((kind) => {
                  const Glyph = KIND_ICON[kind];
                  return (
                    <button
                      key={kind}
                      type="button"
                      className="dsc-answer"
                      data-kind={kind}
                      onClick={() => {
                        setAnswers((previous) => [...previous, kind]);
                      }}
                    >
                      <Glyph aria-hidden />
                      <span>{question[kind]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {state === 'done' && (
            <div className="dsc-plaque-pane dsc-result" data-kind={winner}>
              <div className="dsc-result-main">
                <p className="dsc-eyebrow">{quiz.resultLabel}</p>
                <h4>{result.name}</h4>
                <p>{result.text}</p>
                <ul className="dsc-chips">
                  {result.chips.map((chip) => (
                    <li key={chip}>{chip}</li>
                  ))}
                </ul>
                <div className="dsc-actions">
                  <button type="button" className="dsc-btn" onClick={onCreateMenu}>
                    {hasMenu ? quiz.ctaOpen : quiz.cta}
                    <IconArrowRight aria-hidden />
                  </button>
                  <button type="button" className="dsc-btn dsc-btn--ghost" onClick={restart}>
                    <IconRefresh aria-hidden />
                    {quiz.restart}
                  </button>
                </div>
              </div>
              <div
                className="dsc-split"
                aria-label={`${nameOf('explorer')} ${explorerShare}%, ${nameOf('timesaver')} ${100 - explorerShare}%`}
                role="img"
              >
                <div className="dsc-split-bar">
                  <span style={{ width: `${explorerShare}%` }} data-kind="explorer" />
                  <span style={{ width: `${100 - explorerShare}%` }} data-kind="timesaver" />
                </div>
                <div className="dsc-split-legend">
                  <span>
                    {nameOf('explorer')} · {explorerShare}%
                  </span>
                  <span>
                    {nameOf('timesaver')} · {100 - explorerShare}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
