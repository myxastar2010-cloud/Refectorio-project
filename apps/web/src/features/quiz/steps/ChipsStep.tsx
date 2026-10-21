import { AGE_LIMITS, cleanItems, INPUT_LIMITS } from '@refectorio/nutrition-core';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { quiz } from '../../../content/quiz.ru';
import {
  ALLERGEN_CHIP_IDS,
  type AllergenChipId,
  type HealthChipId,
} from '../../../content/quizSchema';
import { DURATION } from '../../../motion/tokens';
import { AddPanel } from '../components/AddPanel';
import { AddChip, Chip, CustomChip } from '../components/Chip';
import { ContinueButton } from '../components/PillButton';
import { PrivacyLabel } from '../components/PrivacyLabel';
import { Segmented } from '../components/Segmented';
import { StepFrame } from '../components/StepFrame';
import { useEnterToContinue } from '../components/useEnterToContinue';
import { useLayoutFollow } from '../components/useLayoutFollow';
import { matchAllergenChips } from '../flow/allergenSynonyms';
import { matchHealthChips } from '../flow/healthSynonyms';
import {
  activeHealthChips,
  eligibleHealthChips,
  SHOWN_HEALTH_CHIPS,
  visibleHealthChips,
} from '../flow/safety';
import { stepDef } from '../flow/steps';
import type { InsulinAnswer, LactationPeriod, Trimester } from '../flow/types';
import { fill, useQuiz } from '../quizContext';

type Step = 'healthConditions' | 'allergens';

/** Allergen chips shown from the start; the others appear once the «+» text names them (stage-2-mappings §4.2). */
const ALLERGEN_BASE: readonly AllergenChipId[] = [
  'lactose',
  'gluten',
  'peanut',
  'fish',
  'mollusc',
  'soy',
  'treeNut',
  'milk',
  'egg',
  'crustacean',
  'sesame',
];
const isExtra = (id: AllergenChipId) => !ALLERGEN_BASE.includes(id);

/** Health chips with a short note once selected (what the menu will take into account). */
const NOTED = ['hypertension', 'hypothyroidism', 'insulinResistance', 'warfarin', 'maoi'] as const;

/**
 * The designs have four and seven chips; with all the conditions and allergens of §10 the cloud gets a smaller chip,
 * so it keeps to one screen (a recorded deviation, docs/design-system.md).
 */
const COMPACT_FROM = 9;

const sameText = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('ru') === b.trim().toLocaleLowerCase('ru');
const chipKey = (id: string) => `chip:${id}`;
const customKey = (item: string) => `custom:${item.trim().toLocaleLowerCase('ru')}`;

type Added = { key: string | null; matched: string[]; checked: string[] };

/** «Какое состояние вашего здоровья?» and «Укажите свою аллергию» (ТЗ §8.5, §10): chips with «+». */
export function ChipsStep({ step }: { readonly step: Step }) {
  const { state, patch, next, calm, announce } = useQuiz();
  const a = state.answers;
  const health = step === 'healthConditions';
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [matchedNote, setMatchedNote] = useState<string | null>(null);
  // An extra allergen chip stays for this visit once shown: unticking it must not make it vanish under the pointer.
  const [shownExtras, setShownExtras] = useState<readonly AllergenChipId[]>(() =>
    a.allergenChips.filter(isExtra),
  );
  // The same for the health conditions without a chip of their own (4.13): a saved one is shown, ticked.
  const [shownHidden, setShownHidden] = useState<readonly HealthChipId[]>(() =>
    a.healthChips.filter((chip) => !SHOWN_HEALTH_CHIPS.includes(chip)),
  );
  const cloudRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const belowRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<'add' | 'last' | null>(null);
  const y = useLayoutFollow(belowRef, calm);

  const eligible = eligibleHealthChips(a);
  const ids: readonly string[] = health
    ? [...visibleHealthChips(a), ...shownHidden.filter((chip) => eligible.includes(chip))]
    : [...ALLERGEN_BASE, ...shownExtras];
  const selected: readonly string[] = health ? a.healthChips : a.allergenChips;
  const custom = health ? a.healthCustom : a.allergenCustom;
  const canAdd = cleanItems(custom).length < INPUT_LIMITS.customItemsMaxItems;
  const labelOf = (id: string) =>
    health ? quiz.health.chips[id as HealthChipId] : quiz.allergy.chips[id as AllergenChipId];
  const complete = stepDef(step).complete(a);

  useEnterToContinue(complete && !adding, next);

  // Focus after the add panel or a removal, once the chips are interactive again.
  useEffect(() => {
    if (adding || !focusAfter.current) return;
    const where = focusAfter.current;
    focusAfter.current = null;
    const last = [...removeRefs.current.values()].at(-1);
    (where === 'add' ? (addRef.current ?? last) : (last ?? addRef.current))?.focus({
      preventScroll: true,
    });
  });

  const toggle = (id: string) => {
    setMatchedNote(null);
    if (health) {
      const chip = id as HealthChipId;
      const on = a.healthChips.includes(chip);
      patch({
        healthChips: on ? a.healthChips.filter((c) => c !== chip) : [...a.healthChips, chip],
      });
    } else {
      const chip = id as AllergenChipId;
      const on = a.allergenChips.includes(chip);
      patch({
        allergenChips: on ? a.allergenChips.filter((c) => c !== chip) : [...a.allergenChips, chip],
      });
    }
  };

  /** Surfaces conditions without a chip of their own (they stay shown for this visit, ticked or not). */
  const surface = (chips: readonly HealthChipId[]) => {
    const fresh = chips.filter(
      (chip) => !SHOWN_HEALTH_CHIPS.includes(chip) && !shownHidden.includes(chip),
    );
    if (fresh.length > 0) setShownHidden([...shownHidden, ...fresh]);
  };

  /**
   * Typed health text (4.13): verbatim as an item, plus the chips its words name — ticked when sure, shown unticked
   * when the text puts them in doubt (a negation, somebody else, a false friend). Only chips this person may have
   * by age and sex («беременна» typed by a man stays text).
   */
  const addHealth = (text: string): Added => {
    const exact = eligible.find((id) => sameText(quiz.health.chips[id], text));
    if (exact) {
      surface([exact]);
      if (!a.healthChips.includes(exact)) patch({ healthChips: [...a.healthChips, exact] });
      return { key: chipKey(exact), matched: [], checked: [] };
    }
    const found = matchHealthChips(text).filter((match) => eligible.includes(match.chip));
    const ticked = found.filter((match) => match.confident).map((match) => match.chip);
    const unsure = found.filter((match) => !match.confident).map((match) => match.chip);
    surface([...ticked, ...unsure]);
    const existing = a.healthCustom.find((item) => sameText(item, text));
    const list = existing || !canAdd ? a.healthCustom : [...a.healthCustom, text];
    patch({ healthChips: [...new Set([...a.healthChips, ...ticked])], healthCustom: list });
    const key = existing
      ? customKey(existing)
      : canAdd
        ? customKey(text)
        : ticked[0]
          ? chipKey(ticked[0])
          : null;
    return {
      key,
      matched: ticked.map((chip) => quiz.health.chips[chip]),
      checked: unsure.map((chip) => quiz.health.chips[chip]),
    };
  };

  /** Typed allergy text: verbatim as an item for stage 3, plus the chips its words name (ТЗ §8.5). */
  const addAllergen = (text: string): Added => {
    const exact = ALLERGEN_CHIP_IDS.find((id) => sameText(quiz.allergy.chips[id], text));
    const found = exact ? [exact] : matchAllergenChips(text);
    const extras = found.filter((id) => isExtra(id) && !shownExtras.includes(id));
    if (extras.length > 0) setShownExtras([...shownExtras, ...extras]);
    const chips = [...new Set([...a.allergenChips, ...found])];
    if (exact) {
      patch({ allergenChips: chips });
      return { key: chipKey(exact), matched: [], checked: [] };
    }
    const existing = a.allergenCustom.find((item) => sameText(item, text));
    const list = existing || !canAdd ? a.allergenCustom : [...a.allergenCustom, text];
    patch({ allergenChips: chips, allergenCustom: list });
    const key = existing
      ? customKey(existing)
      : canAdd
        ? customKey(text)
        : found[0]
          ? chipKey(found[0])
          : null;
    return { key, matched: found.map((id) => quiz.allergy.chips[id]), checked: [] };
  };

  const submit = (text: string): HTMLElement | null => {
    const out: Added = { key: null, matched: [], checked: [] };
    // The new chip must exist before the panel measures where to collapse.
    flushSync(() => {
      Object.assign(out, health ? addHealth(text) : addAllergen(text));
    });
    const notes = [
      out.matched.length > 0
        ? fill(health ? quiz.health.matched : quiz.allergy.matched, {
            chips: out.matched.join(', '),
          })
        : null,
      out.checked.length > 0
        ? fill(quiz.health.matchedCheck, { chips: out.checked.join(', ') })
        : null,
    ].filter((line): line is string => line !== null);
    const note = notes.length > 0 ? notes.join('. ') : null;
    setMatchedNote(note);
    if (out.key) announce(note ?? fill(quiz.common.added, { item: text }));
    return out.key
      ? (cloudRef.current?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(out.key)}"]`) ??
          null)
      : null;
  };

  const remove = (item: string) => {
    const list = custom.filter((c) => c !== item);
    patch(health ? { healthCustom: list } : { allergenCustom: list });
    focusAfter.current = 'last';
  };

  const active = health ? activeHealthChips(a) : [];
  // A required question appears under the chips: screen readers hear it (WCAG 4.1.3; «Готово» waits for it).
  const followUps = [
    active.includes('diabetes') ? quiz.health.insulinQuestion : null,
    active.includes('pregnancy') ? quiz.health.trimesterQuestion : null,
    active.includes('lactation') ? quiz.health.lactationQuestion : null,
  ].filter((label): label is string => label !== null);
  const followUpKey = followUps.join('|');
  const shownFollowUps = useRef<readonly string[]>(followUps);
  useEffect(() => {
    const now = followUpKey ? followUpKey.split('|') : [];
    const added = now.filter((label) => !shownFollowUps.current.includes(label));
    shownFollowUps.current = now;
    if (added.length > 0) announce(added.join('. '));
  }, [followUpKey, announce]);
  const minor = a.ageYears !== undefined && a.ageYears < AGE_LIMITS.minorUnderYears;
  const teen = minor && (a.ageYears ?? 0) >= AGE_LIMITS.childUnderYears;
  const severeShown =
    !health && (a.allergenChips.some((id) => id !== 'lactose') || custom.length > 0);
  const title = health ? quiz.health.conditionsTitle : quiz.allergy.allergensTitle;

  return (
    <StepFrame
      icon={stepDef(step).icon}
      title={title}
      privacy={false}
      className="quiz-frame--chips"
    >
      <div className="quiz-chips-area">
        <m.div
          ref={cloudRef}
          className={clsx('quiz-chips', ids.length >= COMPACT_FROM && 'is-compact')}
          role="group"
          aria-labelledby="quiz-step-title"
          inert={adding}
          aria-hidden={adding || undefined}
          animate={{ opacity: adding && !closing ? 0 : 1 }}
          transition={{ duration: calm ? DURATION.fade : DURATION.micro }}
        >
          {ids.map((id) => (
            <Chip
              key={id}
              dataKey={chipKey(id)}
              label={labelOf(id)}
              selected={selected.includes(id)}
              calm={calm}
              onToggle={() => {
                toggle(id);
              }}
            />
          ))}
          {custom.map((item) => (
            <CustomChip
              key={item}
              dataKey={customKey(item)}
              label={item}
              onRemove={() => {
                remove(item);
              }}
              removeRef={(node) => {
                if (node) removeRefs.current.set(item, node);
                else removeRefs.current.delete(item);
              }}
            />
          ))}
          {canAdd ? (
            <AddChip
              buttonRef={addRef}
              onOpen={(element) => {
                setMatchedNote(null);
                setAnchor(element);
                setClosing(false);
                setAdding(true);
              }}
            />
          ) : null}
        </m.div>
        <AnimatePresence>
          {adding ? (
            <AddPanel
              key="add"
              anchor={anchor}
              calm={calm}
              title={health ? quiz.health.addTitle : quiz.allergy.addTitle}
              placeholder={health ? quiz.health.addPlaceholder : quiz.allergy.addPlaceholder}
              onSubmit={submit}
              onClosing={() => {
                setClosing(true);
              }}
              onClosed={() => {
                focusAfter.current = 'add';
                setAdding(false);
              }}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <m.div ref={belowRef} className="quiz-chips-below" style={{ y }}>
        {matchedNote ? <p className="quiz-note">{matchedNote}</p> : null}
        {health && teen ? <p className="quiz-note">{quiz.notices.teenHealth}</p> : null}
        {active.includes('diabetes') ? (
          <Segmented<InsulinAnswer>
            id="quiz-insulin"
            label={quiz.health.insulinQuestion}
            items={(['yes', 'no', 'unknown'] as const).map((value) => ({
              value,
              label: quiz.health.insulinOptions[value],
            }))}
            selected={a.insulin}
            calm={calm}
            onChoose={(insulin) => {
              patch({ insulin });
            }}
          />
        ) : null}
        {active.includes('pregnancy') ? (
          <Segmented<Trimester>
            id="quiz-trimester"
            label={quiz.health.trimesterQuestion}
            items={(['trimester1', 'trimester2', 'trimester3'] as const).map((value) => ({
              value,
              label: quiz.health.trimesters[value],
            }))}
            selected={a.trimester}
            calm={calm}
            onChoose={(trimester) => {
              patch({ trimester });
            }}
          />
        ) : null}
        {active.includes('lactation') ? (
          <Segmented<LactationPeriod>
            id="quiz-lactation"
            label={quiz.health.lactationQuestion}
            items={(['months0to6', 'months7to12'] as const).map((value) => ({
              value,
              label: quiz.health.lactationPeriods[value],
            }))}
            selected={a.lactationPeriod}
            calm={calm}
            onChoose={(lactationPeriod) => {
              patch({ lactationPeriod });
            }}
          />
        ) : null}
        {health
          ? NOTED.filter((chip) => active.includes(chip)).map((chip) => (
              <p key={chip} className="quiz-note">
                {quiz.health.notes[chip]}
              </p>
            ))
          : null}
        {severeShown ? (
          <div className="quiz-severe">
            <label className="quiz-check focus-ring-within">
              <input
                type="checkbox"
                checked={a.severeTraces}
                onChange={(event) => {
                  patch({ severeTraces: event.target.checked });
                }}
              />
              <span>{quiz.allergy.severe}</span>
            </label>
            {a.severeTraces ? <p className="quiz-note">{quiz.notices.severeTraces}</p> : null}
          </div>
        ) : null}
        <ContinueButton show={complete && !adding} label={quiz.common.done} onClick={next} />
        <div className="quiz-privacy">
          <PrivacyLabel />
        </div>
      </m.div>
    </StepFrame>
  );
}
