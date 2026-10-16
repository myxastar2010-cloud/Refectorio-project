import { z } from 'zod';

/**
 * The site's CSP has no 'unsafe-eval'. zod would probe `new Function` once to decide on its fast parsers; the probe is
 * caught, but the browser still reports a CSP violation. Imported first by QuizScene, before any schema parses.
 */
z.config({ jitless: true });
