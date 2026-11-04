import { IconDropletFilled, IconFlameFilled } from '@tabler/icons-react';
import { useId, useState, type CSSProperties } from 'react';
import { discover } from '../../content/discover.ru';

const W = 560;
const H = 230;
const PAD = { left: 18, right: 18, top: 24, bottom: 34 };
const WEEKS = 8;
const KCAL = { eaten: 1480, goal: 1900 };
const RING_R = 52;
const RING_LENGTH = 2 * Math.PI * RING_R;
/** 1 — all eaten as planned, 0.5 — partly, 0 — not yet (today is the last one). */
const WEEK_DAYS = [1, 1, 1, 0.5, 1, 1, 0] as const;
const GLASSES = { drunk: 6, total: 8 };
const STREAK_DAYS = 12;

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** Points of the weight line: a smooth path through them and the area under it. */
function chartGeometry(values: readonly number[]) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, 0.8);
  const middle = (high + low) / 2;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const points = values.map((value, index) => ({
    x: PAD.left + (innerW * index) / (values.length - 1),
    y: PAD.top + innerH / 2 - ((value - middle) / span) * innerH * 0.82,
  }));
  const first = points[0];
  const last = points[points.length - 1];
  let line = `M${first?.x ?? 0} ${first?.y ?? 0}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) continue;
    const midX = (previous.x + current.x) / 2;
    line += ` C${midX} ${previous.y} ${midX} ${current.y} ${current.x} ${current.y}`;
  }
  const area = `${line} L${last?.x ?? 0} ${H - PAD.bottom} L${first?.x ?? 0} ${H - PAD.bottom} Z`;
  return { points, line, area };
}

/** Progress and goals: a live example of the screen the person gets — goal, weight line, calories, week, water. */
export function Progress() {
  const { progress } = discover;
  const gradientId = useId();
  const [goalIndex, setGoalIndex] = useState(0);
  const [week, setWeek] = useState(WEEKS / 2);
  const goal = progress.goals[goalIndex] ?? progress.goals[0];
  if (!goal) return null;

  const { points, line, area } = chartGeometry(goal.path);
  const point = points[week];
  const weight = goal.path[week] ?? goal.from;
  const share = Math.round((week / WEEKS) * 100);
  const kcalShare = KCAL.eaten / KCAL.goal;
  const weekLabel = progress.week.replace('{n}', String(week));

  return (
    <section className="dsc-section" id="dsc-progress" aria-labelledby="dsc-progress-title">
      <header className="dsc-head" data-reveal>
        <p className="dsc-eyebrow">{progress.eyebrow}</p>
        <h2 id="dsc-progress-title" className="dsc-title">
          {progress.title}
        </h2>
        <p className="dsc-lead">{progress.lead}</p>
      </header>

      <div className="dsc-board" data-reveal>
        <p className="dsc-demo-note">{progress.demo}</p>
        <div className="dsc-board-grid">
          <div className="dsc-card dsc-chart-card">
            <div className="dsc-tabs" role="tablist" aria-label={progress.goalsLabel}>
              {progress.goals.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={index === goalIndex}
                  className="dsc-tab"
                  onClick={() => {
                    setGoalIndex(index);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="dsc-stats">
              <div>
                <span>{progress.now}</span>
                <b>
                  {number.format(weight)} <small>{goal.unit}</small>
                </b>
              </div>
              <div>
                <span>{progress.target}</span>
                <b>
                  {number.format(goal.to)} <small>{goal.unit}</small>
                </b>
              </div>
              <div>
                <span>{share}%</span>
                <b className="dsc-stat-text">{progress.done}</b>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="dsc-chart"
              role="img"
              aria-label={`${goal.label}: ${number.format(goal.from)} → ${number.format(weight)} ${goal.unit}, ${weekLabel}`}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.38" />
                  <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((fraction) => (
                <line
                  key={fraction}
                  className="dsc-grid-line"
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={PAD.top + (H - PAD.top - PAD.bottom) * fraction}
                  y2={PAD.top + (H - PAD.top - PAD.bottom) * fraction}
                />
              ))}
              <path
                key={`a-${goal.id}`}
                className="dsc-area"
                d={area}
                fill={`url(#${gradientId})`}
              />
              <path key={`l-${goal.id}`} className="dsc-line" d={line} pathLength={1} />
              {points.map((item, index) => (
                <circle
                  key={index}
                  className="dsc-dot"
                  data-passed={index <= week || undefined}
                  cx={item.x}
                  cy={item.y}
                  r={index === week ? 0 : 3.5}
                />
              ))}
              {point && (
                <>
                  <line
                    className="dsc-guide"
                    x1="0"
                    x2="0"
                    y1={PAD.top - 8}
                    y2={H - PAD.bottom}
                    style={{ transform: `translate(${point.x}px, 0px)` }}
                  />
                  <g
                    className="dsc-marker"
                    style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
                  >
                    <circle r="10" />
                    <circle r="4.5" className="dsc-marker-core" />
                  </g>
                </>
              )}
              {points.map((item, index) => (
                <text key={index} className="dsc-axis" x={item.x} y={H - 10} textAnchor="middle">
                  {index}
                </text>
              ))}
            </svg>

            <label className="dsc-scrub">
              <span>
                {progress.scrub} · <b>{weekLabel}</b>
              </span>
              <input
                type="range"
                min={0}
                max={WEEKS}
                step={1}
                value={week}
                onChange={(event) => {
                  setWeek(Number(event.target.value));
                }}
                style={{ '--p': `${(week / WEEKS) * 100}%` } as CSSProperties}
              />
            </label>
            <p className="dsc-pace">{goal.weekly}</p>
          </div>

          <div className="dsc-side">
            <div className="dsc-card dsc-ring-card">
              <svg
                viewBox="0 0 140 140"
                className="dsc-ring"
                role="img"
                aria-label={`${progress.kcal}: ${KCAL.eaten} / ${KCAL.goal}`}
              >
                <circle className="dsc-ring-track" cx="70" cy="70" r={RING_R} />
                <circle
                  className="dsc-ring-value"
                  cx="70"
                  cy="70"
                  r={RING_R}
                  strokeDasharray={RING_LENGTH}
                  strokeDashoffset={RING_LENGTH * (1 - kcalShare)}
                />
              </svg>
              <div className="dsc-ring-text">
                <b>{KCAL.eaten.toLocaleString('ru-RU')}</b>
                <span>{progress.kcal}</span>
                <small>{progress.kcalNote}</small>
              </div>
            </div>

            <div className="dsc-card dsc-week-card">
              <div className="dsc-week-head">
                <b>{progress.weekTitle}</b>
                <span>{progress.weekNote}</span>
              </div>
              <ol className="dsc-week">
                {progress.days.map((day, index) => {
                  const state = WEEK_DAYS[index] ?? 0;
                  const height = state === 1 ? '100%' : state === 0.5 ? '58%' : '22%';
                  return (
                    <li
                      key={day}
                      data-state={state === 1 ? 'done' : state === 0.5 ? 'part' : 'todo'}
                    >
                      <span className="dsc-week-bar" style={{ '--h': height } as CSSProperties} />
                      <span className="dsc-week-day">{day}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="dsc-duo">
              <div className="dsc-card dsc-mini">
                <IconFlameFilled aria-hidden className="dsc-mini-fire" />
                <b>{STREAK_DAYS}</b>
                <span>{progress.streak}</span>
              </div>
              <div className="dsc-card dsc-mini">
                <IconDropletFilled aria-hidden className="dsc-mini-water" />
                <b>
                  {GLASSES.drunk}/{GLASSES.total}
                </b>
                <span>{progress.water}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
