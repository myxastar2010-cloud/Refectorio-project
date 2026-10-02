import { IconApple } from '@tabler/icons-react';
import { LazyMotion, MotionConfig, domMax, m } from 'motion/react';
import { site } from '../content/site.ru';

/** Temporary "coming soon" page (stage 0): checks the font, tokens and deployment. */
export function App() {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <main className="grid min-h-svh place-items-center bg-bg px-6 text-center">
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-6"
          >
            <IconApple aria-hidden className="size-16 text-accent" stroke={2} />
            <h1 className="text-5xl font-black tracking-tight sm:text-7xl">
              {site.comingSoon.heading}
            </h1>
            <p className="max-w-xl text-xl font-semibold text-ink-muted">{site.comingSoon.lead}</p>
            <p className="text-base font-bold text-ink-muted">{site.comingSoon.team}</p>
          </m.div>
        </main>
      </MotionConfig>
    </LazyMotion>
  );
}
