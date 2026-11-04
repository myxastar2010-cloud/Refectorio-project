import { IconLockFilled, IconRefresh } from '@tabler/icons-react';
import { useRef, useState, type CSSProperties } from 'react';
import { discover } from '../../content/discover.ru';
import { Kiki, type KikiLevel, type KikiMood } from './Kiki';
import { NamedIcon } from './icons';

const { kiki } = discover;
const START = { health: 58, xp: 80 };
const MAX_HEALTH = 100;
const WEEKS = 8;
const DAYS_IN_WEEK = 7;
/** Badges earned in the example. */
const EARNED_BADGES = 3;
const POINTS = 420;

const moodOf = (health: number): KikiMood =>
  health >= 80 ? 'glow' : health >= 55 ? 'good' : health >= 30 ? 'tired' : 'sad';

const levelOf = (xp: number): KikiLevel => {
  let found = 1;
  kiki.levels.items.forEach((item, index) => {
    if (xp >= item.xp) found = index + 1;
  });
  return found as KikiLevel;
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Kiki: what she is for, the tamagotchi to try, habits, levels, bonuses and badges. */
export function KikiSection() {
  return (
    <section className="dsc-section dsc-kiki" id="dsc-kiki" aria-labelledby="dsc-kiki-title">
      <header className="dsc-head dsc-head--kiki" data-reveal>
        <div className="dsc-kiki-hero">
          <Kiki mood="glow" level={2} label={kiki.title} />
        </div>
        <p className="dsc-eyebrow">{kiki.eyebrow}</p>
        <h2 id="dsc-kiki-title" className="dsc-title">
          {kiki.title}
        </h2>
        <p className="dsc-lead">{kiki.lead}</p>
      </header>

      <ul className="dsc-perks">
        {kiki.perks.map((perk, index) => (
          <li
            key={perk.title}
            className="dsc-perk"
            data-reveal
            style={{ '--d': `${index * 70}ms` } as CSSProperties}
          >
            <span className="dsc-feature-icon">
              <NamedIcon name={perk.icon} />
            </span>
            <h3>{perk.title}</h3>
            <p>{perk.text}</p>
          </li>
        ))}
      </ul>

      <Stage />
      <Habits />
      <Levels />
      <Rewards />
    </section>
  );
}

/** The tamagotchi: what Kiki eats changes how she feels and looks. */
function Stage() {
  const { stage } = kiki;
  const [health, setHealth] = useState(START.health);
  const [xp, setXp] = useState(START.xp);
  const [say, setSay] = useState<{ text: string; key: number }>({ text: stage.greeting, key: 0 });
  const [bounce, setBounce] = useState(0);
  const [levelUp, setLevelUp] = useState(false);
  const counter = useRef(0);
  const xpRef = useRef(START.xp);
  const mood = moodOf(health);
  const level = levelOf(xp);
  const levelInfo = kiki.levels.items[level - 1];
  const next = kiki.levels.items[level];
  const ratio = next ? (xp - (levelInfo?.xp ?? 0)) / (next.xp - (levelInfo?.xp ?? 0)) : 1;

  const eat = (id: string) => {
    const food = stage.foods.find((item) => item.id === id);
    if (!food) return;
    const nextXp = xpRef.current + food.xp;
    const gained = levelOf(nextXp) > levelOf(xpRef.current);
    xpRef.current = nextXp;
    counter.current += 1;
    setHealth((previous) => clamp(previous + food.effect, 0, MAX_HEALTH));
    setXp(nextXp);
    setBounce(counter.current);
    setLevelUp(gained);
    setSay({
      text: gained
        ? `${kiki.levels.items[levelOf(nextXp) - 1]?.name ?? ''}! ${food.say}`
        : food.say,
      key: counter.current,
    });
  };

  const reset = () => {
    counter.current += 1;
    setHealth(START.health);
    xpRef.current = START.xp;
    setXp(START.xp);
    setLevelUp(false);
    setBounce(0);
    setSay({ text: stage.greeting, key: counter.current });
  };

  return (
    <div className="dsc-stage" data-reveal data-mood={mood}>
      <div className="dsc-stage-pet">
        <div className="dsc-bubble" key={say.key} aria-live="polite">
          {say.text}
        </div>
        <div
          className="dsc-pet"
          key={`b-${bounce}`}
          data-bounce={bounce > 0 || undefined}
          data-up={levelUp || undefined}
        >
          <Kiki
            mood={mood}
            level={level}
            label={`${kiki.title}: ${stage.moods[mood]}, ${stage.level} ${level}`}
          />
          {levelUp && (
            <span className="dsc-confetti" aria-hidden>
              {Array.from({ length: 10 }, (_, index) => (
                <i key={index} style={{ '--i': index } as CSSProperties} />
              ))}
            </span>
          )}
        </div>
      </div>

      <div className="dsc-stage-panel">
        <h3>{stage.title}</h3>
        <p>{stage.lead}</p>

        <div className="dsc-meters">
          <div className="dsc-meter" data-kind="health">
            <div className="dsc-meter-top">
              <span>{stage.health}</span>
              <b>{stage.moods[mood]}</b>
            </div>
            <div
              className="dsc-meter-bar"
              role="progressbar"
              aria-label={stage.health}
              aria-valuemin={0}
              aria-valuemax={MAX_HEALTH}
              aria-valuenow={health}
            >
              <span style={{ width: `${health}%` }} />
            </div>
          </div>
          <div className="dsc-meter" data-kind="xp">
            <div className="dsc-meter-top">
              <span>
                {stage.level} {level} · {levelInfo?.name}
              </span>
              <b>
                {stage.xp} {xp}
              </b>
            </div>
            <div
              className="dsc-meter-bar"
              role="progressbar"
              aria-label={stage.xp}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ratio * 100)}
            >
              <span style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
        </div>

        <p className="dsc-feed-label">{stage.feedLabel}</p>
        <div className="dsc-feed">
          {stage.foods.map((food) => (
            <button
              key={food.id}
              type="button"
              className="dsc-food"
              data-good={food.effect > 0 || undefined}
              onClick={() => {
                eat(food.id);
              }}
            >
              <span>{food.label}</span>
              <small>{food.effect > 0 ? `+${food.effect}` : food.effect}</small>
            </button>
          ))}
        </div>
        <button type="button" className="dsc-btn dsc-btn--ghost dsc-reset" onClick={reset}>
          <IconRefresh aria-hidden />
          {stage.reset}
        </button>
      </div>
    </div>
  );
}

/** Habit tracking: fewer sodas and fast food — a brighter Kiki. */
function Habits() {
  const { habits } = kiki;
  const [habitIndex, setHabitIndex] = useState(0);
  const [weeks, setWeeks] = useState(3);
  const habit = habits.habits[habitIndex] ?? habits.habits[0];
  if (!habit) return null;
  const count = Math.max(0, Math.round(habit.before * (1 - weeks / WEEKS)));
  const stageIndex = weeks === 0 ? 0 : weeks <= 2 ? 1 : weeks <= 5 ? 2 : 3;
  const moods: readonly KikiMood[] = ['sad', 'tired', 'good', 'glow'];
  const freeDays = weeks * DAYS_IN_WEEK;

  return (
    <div className="dsc-habits" data-reveal>
      <header className="dsc-subhead">
        <h3>{habits.title}</h3>
        <p>{habits.lead}</p>
      </header>

      <div className="dsc-habit-card">
        <div className="dsc-tabs" role="tablist" aria-label={habits.habitLabel}>
          {habits.habits.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === habitIndex}
              className="dsc-tab"
              onClick={() => {
                setHabitIndex(index);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <ol className="dsc-evolution">
          {habits.stages.map((item, index) => (
            <li
              key={item.title}
              data-state={index === stageIndex ? 'now' : index < stageIndex ? 'past' : 'future'}
            >
              <Kiki
                decorative
                mood={moods[index] ?? 'good'}
                level={(index === 3 ? 2 : 1) as KikiLevel}
                label={item.title}
              />
              <b>{item.title}</b>
              <span>{item.text}</span>
            </li>
          ))}
        </ol>

        <div className="dsc-habit-numbers">
          <div>
            <b>{count}</b>
            <span>{habits.perWeek}</span>
          </div>
          <div>
            <b>{freeDays}</b>
            <span>{habits.daysFree}</span>
          </div>
        </div>

        <div className="dsc-strip" aria-hidden>
          {Array.from({ length: WEEKS * DAYS_IN_WEEK }, (_, index) => (
            <i key={index} data-free={index < freeDays || undefined} />
          ))}
        </div>

        <label className="dsc-scrub">
          <span>
            {habits.weeksLabel} · <b>{weeks}</b>
          </span>
          <input
            type="range"
            min={0}
            max={WEEKS}
            step={1}
            value={weeks}
            onChange={(event) => {
              setWeeks(Number(event.target.value));
            }}
            style={{ '--p': `${(weeks / WEEKS) * 100}%` } as CSSProperties}
          />
        </label>
        <p className="dsc-note">{habits.note}</p>
      </div>
    </div>
  );
}

/** Five levels: a new outfit for each. */
function Levels() {
  const { levels } = kiki;
  return (
    <div className="dsc-levels" data-reveal>
      <header className="dsc-subhead">
        <h3>{levels.title}</h3>
        <p>{levels.lead}</p>
      </header>
      <ol className="dsc-level-row">
        {levels.items.map((item, index) => (
          <li key={item.name} style={{ '--i': index } as CSSProperties}>
            <Kiki decorative mood="good" level={(index + 1) as KikiLevel} label={item.name} />
            <small>{index + 1}</small>
            <b>{item.name}</b>
            <span>{item.text}</span>
            <em>{levels.needs.replace('{xp}', String(item.xp))}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Points of the service and badges. */
function Rewards() {
  const { rewards } = kiki;
  return (
    <div className="dsc-rewards" data-reveal>
      <header className="dsc-subhead">
        <h3>{rewards.title}</h3>
        <p>{rewards.lead}</p>
        <p className="dsc-balance">{rewards.balance.replace('{n}', String(POINTS))}</p>
      </header>
      <ul className="dsc-reward-grid">
        {rewards.items.map((item) => (
          <li key={item.title} className="dsc-reward" data-can={POINTS >= item.cost || undefined}>
            <span className="dsc-feature-icon">
              <NamedIcon name={item.icon} />
            </span>
            <h4>{item.title}</h4>
            <p>{item.text}</p>
            <b>
              {item.cost} <small>{rewards.unit}</small>
            </b>
          </li>
        ))}
      </ul>

      <h4 className="dsc-badges-title">{rewards.badgesTitle}</h4>
      <ul className="dsc-badges">
        {rewards.badges.map((badge, index) => {
          const earned = index < EARNED_BADGES;
          return (
            <li key={badge.title} data-earned={earned || undefined}>
              <span className="dsc-badge-icon">
                {earned ? <NamedIcon name={badge.icon} /> : <IconLockFilled aria-hidden />}
              </span>
              <b>{badge.title}</b>
              <small>{badge.text}</small>
            </li>
          );
        })}
      </ul>
      <p className="dsc-note">{rewards.soon}</p>
    </div>
  );
}
