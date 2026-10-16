import { QUIZ_RANGES } from '@refectorio/contracts';
import {
  AGE_LIMITS,
  recommendedWeightRangeKg,
  targetWeightBoundsKg,
  targetWeightStartKg,
} from '@refectorio/nutrition-core';
import { IconChevronRight } from '@tabler/icons-react';
import clsx from 'clsx';
import { useRef, useState } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { focusQuietly } from '../../../lib/quietFocus';
import { useWave } from '../../../motion/useWave';
import { WaveLayer } from '../../../motion/WaveHover';
import { ContinueButton } from '../components/PillButton';
import { PickerPanel } from '../components/PickerPanel';
import { useEnterToContinue } from '../components/useEnterToContinue';
import { StepFrame } from '../components/StepFrame';
import { WheelPicker } from '../components/WheelPicker';
import type { WheelRange } from '../components/wheelPhysics';
import { stepDef } from '../flow/steps';
import type { Answers, QuizSex } from '../flow/types';
import { fill, formatNumber, pluralRu, useQuiz } from '../quizContext';

type Step = 'body' | 'goalSetup';
type RowId = 'sex' | 'age' | 'height' | 'current' | 'target';

const LABELS: Record<RowId, string> = {
  sex: quiz.body.sex,
  age: quiz.body.age,
  height: quiz.body.height,
  current: quiz.goalSetup.current,
  target: quiz.goalSetup.target,
};
const PANEL_TITLES: Record<RowId, string> = {
  sex: quiz.body.sexTitle,
  age: quiz.body.ageTitle,
  height: quiz.body.heightTitle,
  current: quiz.goalSetup.currentTitle,
  target: quiz.goalSetup.targetTitle,
};

const years = (n: number) => pluralRu(n, quiz.common.years);
const kg = () => quiz.common.kg;
const cm = () => quiz.common.cm;

/** Where a wheel starts when the row is still empty (ТЗ §8.3) — a starting point, never an answer. */
function startValue(row: RowId, a: Answers): number {
  switch (row) {
    case 'age':
      return a.ageYears ?? 30;
    case 'height':
      return a.heightCm ?? (a.sex === 'male' ? 170 : a.sex === 'female' ? 160 : 165);
    case 'current': {
      const h = (a.heightCm ?? 165) / 100;
      return a.weightKg ?? Math.round(22 * h * h);
    }
    case 'target':
      return (
        a.targetWeightKg ??
        targetWeightStartKg({
          goal: a.goal ?? 'maintain',
          currentKg: a.weightKg ?? 70,
          heightCm: a.heightCm ?? 165,
          ageYears: a.ageYears ?? 30,
        }) ??
        a.weightKg ??
        70
      );
    case 'sex':
      return 0;
  }
}

function valueOf(row: RowId, a: Answers): string | null {
  switch (row) {
    case 'sex':
      return a.sex ? quiz.body.sexValues[a.sex] : null;
    case 'age':
      return a.ageYears === undefined ? null : `${a.ageYears} ${years(a.ageYears)}`;
    case 'height':
      return a.heightCm === undefined ? null : `${a.heightCm} ${quiz.common.cm}`;
    case 'current':
      return a.weightKg === undefined ? null : `${formatNumber(a.weightKg)} ${quiz.common.kg}`;
    case 'target':
      return a.targetWeightKg === undefined
        ? null
        : `${formatNumber(a.targetWeightKg)} ${quiz.common.kg}`;
  }
}

/** A row (ТЗ §8.3): label left, value right («70 кг ›», muted) or the accent «Выбрать ›» while empty. */
function Row({
  row,
  value,
  onOpen,
  buttonRef,
}: {
  readonly row: RowId;
  readonly value: string | null;
  readonly onOpen: (element: HTMLButtonElement) => void;
  readonly buttonRef: (node: HTMLButtonElement | null) => void;
}) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  const face = (
    <>
      <span className="quiz-row-label">{LABELS[row]}</span>
      <span className={clsx('quiz-row-value', value === null && 'is-empty')}>
        {value ?? quiz.common.choose}
        <IconChevronRight aria-hidden className="quiz-row-chevron" stroke={2.25} />
      </span>
    </>
  );
  return (
    <button
      ref={(node) => {
        setHost(node);
        buttonRef(node);
      }}
      type="button"
      className="quiz-row wave-host focus-ring"
      aria-haspopup="dialog"
      onClick={(event) => {
        const element = event.currentTarget;
        act(event, () => {
          onOpen(element);
        });
      }}
      {...handlers}
    >
      <span className="wave-content">{face}</span>
      <WaveLayer clipPath={clipPath} className="wave-layer--ink">
        {face}
      </WaveLayer>
    </button>
  );
}

/** «О вас» and «Настройте свою цель»: rows with pickers (ТЗ §8.3–8.4). */
export function RowsStep({ step }: { readonly step: Step }) {
  const { state, safety, patch, next, dispatch } = useQuiz();
  const a = state.answers;
  const [open, setOpen] = useState<RowId | null>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState(0);
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const rowRefs = useRef<Partial<Record<RowId, HTMLButtonElement | null>>>({});

  const maintain = a.goal === 'maintain';
  const rows: RowId[] =
    step === 'body' ? ['sex', 'age', 'height'] : maintain ? ['current'] : ['current', 'target'];
  const child = a.ageYears !== undefined && a.ageYears < AGE_LIMITS.childUnderYears;
  const toddler = a.ageYears !== undefined && a.ageYears < AGE_LIMITS.toddlerUnderYears;
  const adult = (a.ageYears ?? 0) >= AGE_LIMITS.minorUnderYears;
  const deemphasize = safety.decision.deemphasizeNumbers;

  const targetBounds =
    a.goal && a.weightKg !== undefined && a.heightCm !== undefined && a.ageYears !== undefined
      ? targetWeightBoundsKg({
          goal: a.goal,
          currentKg: a.weightKg,
          heightCm: a.heightCm,
          ageYears: a.ageYears,
        })
      : null;
  const recommended =
    a.heightCm !== undefined && a.ageYears !== undefined && adult && !deemphasize
      ? recommendedWeightRangeKg(a.heightCm, a.ageYears)
      : null;
  // After 65 the range is a guide from studies (Winter 2014), not the WHO «norm»: its own wording.
  const older = (a.ageYears ?? 0) >= AGE_LIMITS.olderAdultFromYears;

  const range = (row: RowId): WheelRange => {
    switch (row) {
      case 'age':
        return { min: QUIZ_RANGES.ageYears.min, max: QUIZ_RANGES.ageYears.max, step: 1 };
      case 'height':
        return { min: QUIZ_RANGES.heightCm.min, max: QUIZ_RANGES.heightCm.max, step: 1 };
      case 'target':
        return targetBounds
          ? { min: targetBounds.minKg, max: targetBounds.maxKg, step: 1 }
          : { min: QUIZ_RANGES.weightKg.min, max: QUIZ_RANGES.weightKg.max, step: 1 };
      default:
        return { min: QUIZ_RANGES.weightKg.min, max: QUIZ_RANGES.weightKg.max, step: 1 };
    }
  };

  const openRow = (row: RowId, element: HTMLButtonElement) => {
    setAnchor(element);
    setLimitNote(null);
    const r = range(row);
    setDraft(Math.min(r.max, Math.max(r.min, startValue(row, a))));
    setOpen(row);
  };

  /** After a commit focus goes to the next empty row (ТЗ §8.3); when all are set — to «Далее». */
  const focusNext = (after: RowId, answers: Answers) => {
    window.requestAnimationFrame(() => {
      const empty = rows.find((row) => row !== after && valueOf(row, answers) === null);
      if (empty) {
        focusQuietly(rowRefs.current[empty] ?? null);
        return;
      }
      const row = rowRefs.current[after] ?? null;
      const proceed = row
        ?.closest('.quiz-frame')
        ?.querySelector<HTMLElement>('.quiz-continue-button');
      focusQuietly(proceed ?? row);
    });
  };

  const commit = (row: RowId, value: number | QuizSex) => {
    let p: Partial<Answers>;
    switch (row) {
      case 'sex':
        p = { sex: value as QuizSex };
        break;
      case 'age':
        p = { ageYears: value as number };
        break;
      case 'height':
        p = { heightCm: value as number };
        break;
      case 'current':
        p = { weightKg: value as number };
        break;
      case 'target':
        p = { targetWeightKg: value as number };
        break;
    }
    patch(p);
    // A target that the new current weight makes impossible (wrong side, beyond the floor) is forgotten.
    if (row === 'current' && a.targetWeightKg !== undefined && a.goal && a.heightCm !== undefined) {
      const bounds = targetWeightBoundsKg({
        goal: a.goal,
        currentKg: value as number,
        heightCm: a.heightCm,
        ageYears: a.ageYears ?? 30,
      });
      if (!bounds || a.targetWeightKg < bounds.minKg || a.targetWeightKg > bounds.maxKg) {
        dispatch({ type: 'clear', keys: ['targetWeightKg'] });
      }
    }
    if (step === 'goalSetup') dispatch({ type: 'rowCommitted' });
    setOpen(null);
    focusNext(row, { ...a, ...p });
  };

  const onLimit = (edge: 'min' | 'max') => {
    if (open !== 'target' || !targetBounds) return;
    if (a.goal === 'lose') {
      setLimitNote(
        edge === 'min'
          ? fill(older ? quiz.goalSetup.limitLoseOlder : quiz.goalSetup.limitLose, {
              min: targetBounds.minKg,
            })
          : quiz.goalSetup.limitDirectionLose,
      );
    } else if (a.goal === 'gain') {
      setLimitNote(
        edge === 'max'
          ? fill(quiz.goalSetup.limitGain, { max: targetBounds.maxKg })
          : quiz.goalSetup.limitDirectionGain,
      );
    }
  };

  const complete = stepDef(step).complete(a) && safety.plausible;
  useEnterToContinue(complete && open === null, next);
  const implausible = !safety.plausible && a.weightKg !== undefined && a.heightCm !== undefined;
  const title =
    step === 'body'
      ? quiz.body.title
      : maintain
        ? quiz.goalSetup.titleMaintain
        : quiz.goalSetup.title;
  const panelHint =
    open === 'target' && recommended
      ? fill(older ? quiz.goalSetup.recommendedOlder : quiz.goalSetup.recommended, {
          min: recommended.minKg,
          max: recommended.maxKg,
        })
      : null;

  return (
    <StepFrame
      icon={stepDef(step).icon}
      title={title}
      className={clsx('quiz-frame--rows', open && 'is-picking')}
      footer={<ContinueButton show={complete} label={quiz.common.next} onClick={next} />}
    >
      <div className={clsx('quiz-rows', step === 'goalSetup' && 'quiz-rows--wide')}>
        {rows.map((row) => (
          <Row
            key={row}
            row={row}
            value={valueOf(row, a)}
            onOpen={(element) => {
              openRow(row, element);
            }}
            buttonRef={(node) => {
              rowRefs.current[row] = node;
            }}
          />
        ))}
      </div>
      {step === 'body' && child ? (
        <div className="quiz-family">
          <p className="quiz-note">{toddler ? quiz.notices.toddler : quiz.notices.childFamily}</p>
          <label className="quiz-check focus-ring-within">
            <input
              type="checkbox"
              checked={a.familyConfirmed}
              onChange={(event) => {
                patch({ familyConfirmed: event.target.checked });
              }}
            />
            <span>{quiz.body.familyConfirm}</span>
          </label>
        </div>
      ) : null}
      {step === 'goalSetup' && recommended && !maintain && !open ? (
        <p className="quiz-note">
          {fill(older ? quiz.goalSetup.recommendedOlder : quiz.goalSetup.recommended, {
            min: recommended.minKg,
            max: recommended.maxKg,
          })}
        </p>
      ) : null}
      {implausible ? (
        <p className="quiz-note quiz-note--warn" role="alert">
          {quiz.body.implausible}
        </p>
      ) : null}

      <PickerPanel
        open={open !== null && open !== 'sex'}
        anchor={anchor}
        title={open ? PANEL_TITLES[open] : ''}
        hint={limitNote ?? panelHint}
        titleId="quiz-picker-title"
        onDone={() => {
          if (open) commit(open, draft);
        }}
        onCancel={() => {
          setOpen(null);
        }}
      >
        {open && open !== 'sex' ? (
          <WheelPicker
            key={open}
            range={range(open)}
            value={draft}
            onChange={setDraft}
            unit={open === 'age' ? years : open === 'height' ? cm : kg}
            label={PANEL_TITLES[open]}
            decimals={open === 'current' || open === 'target' ? 1 : 0}
            onLimit={onLimit}
            onCommit={() => {
              commit(open, draft);
            }}
          />
        ) : null}
      </PickerPanel>

      <PickerPanel
        open={open === 'sex'}
        anchor={anchor}
        title={quiz.body.sexTitle}
        titleId="quiz-sex-title"
        withDone={false}
        onDone={() => {
          setOpen(null);
        }}
        onCancel={() => {
          setOpen(null);
        }}
      >
        <div
          className="quiz-sex"
          role="radiogroup"
          aria-labelledby="quiz-sex-title"
          onKeyDown={(event) => {
            // One tab stop; the arrows move between the two answers (a radio group), Space or Enter chooses.
            const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
            if (!keys.includes(event.key)) return;
            const radios = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
            const at = radios.indexOf(document.activeElement as HTMLElement);
            if (at < 0) return;
            event.preventDefault();
            const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
            radios[(at + step + radios.length) % radios.length]?.focus();
          }}
        >
          {(['male', 'female'] as const).map((sex, index) => (
            <button
              key={sex}
              type="button"
              role="radio"
              aria-checked={a.sex === sex}
              tabIndex={(a.sex ? a.sex === sex : index === 0) ? 0 : -1}
              data-autofocus={(a.sex ? a.sex === sex : index === 0) || undefined}
              className={clsx('quiz-sex-option focus-ring', a.sex === sex && 'is-selected')}
              onClick={() => {
                commit('sex', sex);
              }}
            >
              {quiz.body.sexValues[sex]}
            </button>
          ))}
        </div>
      </PickerPanel>
    </StepFrame>
  );
}
