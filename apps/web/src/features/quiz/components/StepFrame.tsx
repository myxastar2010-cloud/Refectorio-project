import clsx from 'clsx';
import { m, useIsPresent, usePresenceData } from 'motion/react';
import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { focusQuietly } from '../../../lib/quietFocus';
import type { IconKey } from '../flow/steps';
import { useQuiz } from '../quizContext';
import { quizIcon } from '../quizIcons';
import { PrivacyLabel } from './PrivacyLabel';
import { useLayoutFollow } from './useLayoutFollow';
import { blockVariants, StepMotionContext, type PresenceInfo } from './stepMotion';

type BlockProps = {
  readonly order: number;
  readonly className?: string;
  readonly children: ReactNode;
};

/** One animated block of a step (icon, title, answers, privacy label…). */
export function Block({ order, className, children }: BlockProps) {
  const { calm } = useQuiz();
  const motion = useContext(StepMotionContext);
  return (
    <m.div className={clsx('quiz-block', className)} variants={blockVariants(calm, motion, order)}>
      {children}
    </m.div>
  );
}

function QuestionIcon({ icon }: { readonly icon: IconKey }) {
  const { calm } = useQuiz();
  const motion = useContext(StepMotionContext);
  const presence = usePresenceData() as PresenceInfo | undefined;
  const present = useIsPresent();
  // Entering after a screen with the same icon, or leaving towards one: stay put (the other icon is drawn on the same
  // spot). How it entered says nothing about how it leaves — an icon that had entered still used to vanish at once.
  const still = present ? motion.iconStill : presence?.icon === icon;
  const source = quizIcon(icon);
  return (
    <m.div
      className="quiz-icon"
      data-icon={icon}
      variants={blockVariants(calm, motion, 0, still)}
      aria-hidden
    >
      <picture>
        <source type="image/avif" srcSet={source.avif} />
        <img
          src={source.webp}
          alt=""
          width={source.width}
          height={source.height}
          decoding="async"
        />
      </picture>
    </m.div>
  );
}

/**
 * A title with the mockups' own line breaks («|» in quiz.ru.ts): each part is a line from 768 px; phones wrap the
 * words freely. Screen readers read the plain sentence.
 */
function TitleText({ text }: { readonly text: string }) {
  const parts = text.split('|');
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    <span key={index} className="quiz-title-line">
      {index > 0 ? ' ' : null}
      {part}
    </span>
  ));
}

/** The privacy label glides to its new place when «Далее» rises in above it. */
function Following({ children }: { readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { calm } = useQuiz();
  const y = useLayoutFollow(ref, calm);
  return (
    <m.div ref={ref} style={{ y }}>
      {children}
    </m.div>
  );
}

type FrameProps = {
  readonly icon: IconKey | null;
  readonly title: string;
  /** Long lists (food preferences, diet type, activity, lifestyle): less air under the title. */
  readonly dense?: boolean;
  readonly children: ReactNode;
  /** «Далее» / «Готово» under the answers. */
  readonly footer?: ReactNode;
  readonly privacy?: boolean;
  readonly className?: string;
};

/**
 * The common layout of a question (ТЗ §5): icon, title (Open Runde Bold + outline, like the landing H1), answers,
 * privacy label. The title receives focus quietly when the step appears (ТЗ §7.8).
 */
export function StepFrame({
  icon,
  title,
  dense,
  children,
  footer,
  privacy = true,
  className,
}: FrameProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { calm } = useQuiz();
  const motion = useContext(StepMotionContext);
  // The leaving step gives its id to the new one (the quiz section is labelled by the current title).
  const present = useIsPresent();
  useEffect(() => {
    focusQuietly(titleRef.current);
  }, []);
  return (
    <div className={clsx('quiz-frame', dense && 'quiz-frame--dense', className)}>
      {icon ? <QuestionIcon icon={icon} /> : null}
      <m.h2
        ref={titleRef}
        id={present ? 'quiz-step-title' : undefined}
        className="quiz-title"
        tabIndex={-1}
        variants={blockVariants(calm, motion, 1)}
      >
        <TitleText text={title} />
      </m.h2>
      <Block order={2} className="quiz-answers">
        {children}
      </Block>
      {footer ? (
        <Block order={3} className="quiz-footer">
          {footer}
        </Block>
      ) : null}
      {privacy ? (
        <Block order={3} className="quiz-privacy">
          <Following>
            <PrivacyLabel />
          </Following>
        </Block>
      ) : null}
    </div>
  );
}
