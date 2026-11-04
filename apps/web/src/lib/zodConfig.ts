import { z } from 'zod';

/**
 * The site's CSP has no 'unsafe-eval'. zod would probe `new Function` once to decide on its fast parsers; the probe is
 * caught, but the browser still reports a CSP violation. Imported first by every chunk that parses (the quiz, the menu), before any schema does.
 */
z.config({ jitless: true });
