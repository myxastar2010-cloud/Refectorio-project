/**
 * Eval cases (ТЗ 07 §11): multi-turn dialogues against the fixed fixture plan, with expectations a script can check.
 * YAML files in packages/kiki-core/evals/. Paths in `args` are dotted with indexes: `rules.0.meals`.
 */
import { z } from 'zod';

const argPredicate = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.object({ contains: z.union([z.string(), z.number()]) }),
  z.object({ oneOf: z.array(z.union([z.string(), z.number()])) }),
  z.object({ exists: z.boolean() }),
  z.object({ gte: z.number() }),
  z.object({ lte: z.number() }),
  z.object({ regex: z.string() }),
]);
export type ArgPredicate = z.infer<typeof argPredicate>;

export const expectSchema = z.object({
  /** Every one of these tools must be called in the turn (any order). `[]` — no tool at all. */
  tools: z.array(z.string()).optional(),
  /** At least one of these. */
  toolsAny: z.array(z.string()).optional(),
  /** None of these. */
  toolsNone: z.array(z.string()).optional(),
  /** Per tool: the arguments of at least one call must satisfy every predicate. */
  args: z.record(z.string(), z.record(z.string(), argPredicate)).optional(),
  /** true — the turn must end with ask_choice; false — it must not. */
  askChoice: z.boolean().optional(),
  /** Case-insensitive substrings or /regex/ the answer must (not) contain. */
  mustInclude: z.array(z.string()).optional(),
  mustIncludeAny: z.array(z.string()).optional(),
  mustNotInclude: z.array(z.string()).optional(),
  maxChars: z.number().int().positive().optional(),
});
export type Expect = z.infer<typeof expectSchema>;

export const CASE_TAGS = [
  'anchor',
  'howto',
  'facts',
  'change',
  'goal',
  'ambiguity',
  'offtopic',
  'safety',
  'identity',
  'injection',
  'bakeoff',
  'chip',
] as const;

export const caseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,60}$/),
  tags: z.array(z.enum(CASE_TAGS)).min(1),
  note: z.string().optional(),
  /** Fixture variant: answers overrides by name (see run.ts FIXTURES). */
  fixture: z.enum(['default', 'teen', 'quiet', 'vegan', 'lose']).default('default'),
  turns: z
    .array(
      z.object({
        user: z.string().min(1).max(2000),
        expect: expectSchema.default({}),
      }),
    )
    .min(1)
    .max(6),
});
export type EvalCase = z.infer<typeof caseSchema>;
export const caseFileSchema = z.array(caseSchema);
