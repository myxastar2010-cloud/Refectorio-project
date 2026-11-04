import { IconMugFilled, IconBoltFilled, IconRefresh } from '@tabler/icons-react';
import { useState, type CSSProperties } from 'react';
import { discover } from '../../content/discover.ru';

type Kind = 'kaif' | 'rush';

type Props = {
  readonly hasMenu: boolean;
  readonly onCreateMenu: () => void;
};

const KIND_ICON = { kaif: IconMugFilled, rush: IconBoltFilled } as const;
const fill = (template: string, values: Readonly<Record<string, string | number>>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

/** Who ПроЛанч is for: the two portraits and a five-question mini test that says which one you are. */
export function Segments({ hasMenu, onCreateMenu }: Props) {
  const { segments, quiz } = discover;
  const [answers, setAnswers] = useState<readonly Kind[]>([]);
  const step = answers.length;
  const finished = step >= quiz.questions.length;
  const kaif = answers.filter((answer) => answer === 'kaif').length;
  const kaifShare = finished ? Math.round((kaif / answers.length) * 100) : 0;
  const winner: Kind = kaif * 2 > answers.length ? 'kaif' : 'rush';
  const kaifName = segments.kinds.find((kind) => kind.id === 'kaif')?.name ?? '';
  const rushName = segments.kinds.find((kind) => kind.id === 'rush')?.name ?? '';
  const question = quiz.questions[step];
  const result = quiz.results[winner];

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
          const active = finished && winner === kind.id;
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

      <div className="dsc-quiz" data-reveal aria-live="polite">
        <div className="dsc-quiz-head">
          <h3>{quiz.title}</h3>
          <p>{quiz.lead}</p>
        </div>

        {!finished && question ? (
          <div className="dsc-quiz-body" key={step}>
            <div
              className="dsc-dots"
              role="img"
              aria-label={fill(quiz.step, { n: step + 1, total: quiz.questions.length })}
            >
              {quiz.questions.map((_, index) => (
                <span
                  key={index}
                  data-state={index < step ? 'done' : index === step ? 'now' : undefined}
                />
              ))}
            </div>
            <p className="dsc-question">{question.text}</p>
            <div className="dsc-answers">
              {(['kaif', 'rush'] as const).map((kind) => {
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
        ) : (
          <div className="dsc-result" data-kind={winner}>
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
                </button>
                <button
                  type="button"
                  className="dsc-btn dsc-btn--ghost"
                  onClick={() => {
                    setAnswers([]);
                  }}
                >
                  <IconRefresh aria-hidden />
                  {quiz.restart}
                </button>
              </div>
            </div>
            <div
              className="dsc-split"
              aria-label={`${kaifName} ${kaifShare}%, ${rushName} ${100 - kaifShare}%`}
              role="img"
            >
              <div className="dsc-split-bar">
                <span style={{ width: `${kaifShare}%` }} data-kind="kaif" />
                <span style={{ width: `${100 - kaifShare}%` }} data-kind="rush" />
              </div>
              <div className="dsc-split-legend">
                <span>
                  {kaifName} · {kaifShare}%
                </span>
                <span>
                  {rushName} · {100 - kaifShare}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
