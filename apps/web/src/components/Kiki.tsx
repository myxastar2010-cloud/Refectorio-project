import { useId } from 'react';
import '../styles/kiki.css';

export type KikiMood = 'glow' | 'good' | 'tired' | 'sad';
export type KikiLevel = 1 | 2 | 3 | 4 | 5;

type Props = {
  readonly mood: KikiMood;
  readonly level: KikiLevel;
  readonly label: string;
  readonly className?: string;
  /** Decorative copies (the evolution strip) are hidden from screen readers. */
  readonly decorative?: boolean;
  /** The brand mark: cropped square, no halo, ground, sparks or star — only her, still (see BrandLogo). */
  readonly logo?: boolean;
};

/** The cloud body and its darker lower layer: one silhouette, the second shifted down. */
const CLOUD =
  'M62 148C40 140 40 108 62 100C56 74 86 58 106 70C116 44 158 44 168 70C192 62 214 84 200 106C222 118 216 150 190 154C188 176 156 184 140 170C124 188 92 184 84 166C70 172 56 164 62 148Z';

/** The square around her body, the sprout and the headphones: the brand mark crops to it (no room for the halo). */
const LOGO_VIEW_BOX = '33 11 196 196';

/** Kiki as the team drew her: a soft green cloud with headphones. Her face, colour and outfit follow `mood` and `level`. */
export function Kiki({ mood, level, label, className, decorative, logo }: Props) {
  const glowId = useId();
  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': label } as const);
  return (
    <svg
      viewBox={logo ? LOGO_VIEW_BOX : '0 0 260 240'}
      className={['kiki', logo && 'kiki--logo', className].filter(Boolean).join(' ')}
      data-mood={mood}
      data-level={level}
      {...a11y}
    >
      {!logo && (
        <>
          <defs>
            <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="var(--kiki-glow)" stopOpacity="0.55" />
              <stop offset="1" stopColor="var(--kiki-glow)" stopOpacity="0" />
            </radialGradient>
          </defs>

          <ellipse
            className="kiki-halo"
            cx="130"
            cy="124"
            rx="122"
            ry="108"
            fill={`url(#${glowId})`}
          />
          <ellipse className="kiki-ground" cx="130" cy="214" rx="64" ry="9" />
        </>
      )}

      <g className="kiki-bob">
        {!logo && (
          <>
            <g className="kiki-sparks" fill="none" strokeLinecap="round">
              <path d="M214 38l12-14" />
              <path d="M226 62l18-8" />
              <path d="M228 90l16 4" />
            </g>
            <path
              className="kiki-star4"
              d="M30 176c2 8 5 11 13 13c-8 2-11 5-13 13c-2-8-5-11-13-13c8-2 11-5 13-13z"
            />
          </>
        )}

        <path className="kiki-shade" d={CLOUD} transform="translate(0 9)" />
        <path className="kiki-body" d={CLOUD} />
        <path
          className="kiki-shine"
          d="M92 84C100 74 112 70 122 72"
          fill="none"
          strokeLinecap="round"
        />

        {level >= 3 && (
          <g className="kiki-scarf">
            <path d="M84 160C108 176 152 176 178 158L184 172C156 192 108 192 80 174Z" />
            <path d="M150 176l10 30 18-6-8-28z" />
          </g>
        )}

        <g className="kiki-face">
          {/* Blush */}
          <ellipse className="kiki-blush" cx="96" cy="136" rx="9" ry="5.5" />
          <ellipse className="kiki-blush" cx="164" cy="136" rx="9" ry="5.5" />

          {mood === 'glow' && (
            <g className="kiki-eyes kiki-eyes--happy" fill="none" strokeLinecap="round">
              <path d="M101 118q9-13 18 0" />
              <path d="M141 118q9-13 18 0" />
            </g>
          )}
          {mood === 'good' && (
            <g className="kiki-eyes">
              <ellipse cx="110" cy="116" rx="6" ry="8.5" />
              <ellipse cx="150" cy="116" rx="6" ry="8.5" />
              <circle className="kiki-gleam" cx="112" cy="112.5" r="2" />
              <circle className="kiki-gleam" cx="152" cy="112.5" r="2" />
            </g>
          )}
          {mood === 'tired' && (
            <g className="kiki-eyes kiki-eyes--tired">
              <ellipse cx="110" cy="120" rx="6.5" ry="4" />
              <ellipse cx="150" cy="120" rx="6.5" ry="4" />
              <path
                className="kiki-lid"
                d="M102 117h16M142 117h16"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          )}
          {mood === 'sad' && (
            <g className="kiki-eyes kiki-eyes--sad">
              <ellipse cx="110" cy="119" rx="5.5" ry="7.5" />
              <ellipse cx="150" cy="119" rx="5.5" ry="7.5" />
              <circle className="kiki-gleam" cx="112" cy="116" r="2" />
              <circle className="kiki-gleam" cx="152" cy="116" r="2" />
              <path
                className="kiki-brow"
                d="M100 106l16-5M160 106l-16-5"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          )}

          {mood === 'glow' && (
            <path className="kiki-mouth kiki-mouth--open" d="M117 134q13 20 26 0q-13 5-26 0z" />
          )}
          {mood === 'good' && (
            <path
              className="kiki-mouth"
              d="M119 136q11 11 22 0"
              fill="none"
              strokeLinecap="round"
            />
          )}
          {mood === 'tired' && (
            <path className="kiki-mouth" d="M122 142h16" fill="none" strokeLinecap="round" />
          )}
          {mood === 'sad' && (
            <path
              className="kiki-mouth"
              d="M119 146q11-10 22 0"
              fill="none"
              strokeLinecap="round"
            />
          )}
        </g>

        {mood === 'sad' && <path className="kiki-tear" d="M170 130c4 7 7 11 0 16c-7-5-4-9 0-16z" />}
        {mood === 'tired' && (
          <g className="kiki-zzz" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M188 70h14l-14 14h14" />
            <path d="M208 48h10l-10 10h10" />
          </g>
        )}

        {/* Headphones: the band, the two cups with their white rings */}
        <path
          className="kiki-band"
          d="M63 116C63 40 197 40 197 116"
          fill="none"
          strokeLinecap="round"
        />
        <rect className="kiki-cup" x="42" y="94" width="30" height="50" rx="14" />
        <rect className="kiki-cup" x="188" y="94" width="30" height="50" rx="14" />
        <path
          className="kiki-ring"
          d="M54 106c-5 8-5 20 0 28M206 106c5 8 5 20 0 28"
          fill="none"
          strokeLinecap="round"
        />

        {level >= 2 && level < 5 && (
          <g className="kiki-sprout">
            <path d="M130 56V40" fill="none" strokeLinecap="round" />
            <path d="M130 44c-14-2-20-12-18-20c12 0 20 6 18 20z" />
            <path d="M130 40c12-2 18-10 17-18c-11 0-18 6-17 18z" />
          </g>
        )}
        {level >= 4 && (
          <g className="kiki-pin">
            <path d="M196 158l5 11l12 1l-9 8l3 12l-11-6l-11 6l3-12l-9-8l12-1z" />
          </g>
        )}
        {level >= 5 && (
          <g className="kiki-crown">
            <path d="M104 56l-6-26l20 14l12-20l12 20l20-14l-6 26z" />
            <circle cx="130" cy="30" r="3.5" />
          </g>
        )}
      </g>
    </svg>
  );
}
