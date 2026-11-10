/**
 * @refectorio/kiki-core — Kiki, the AI dietitian of ПроЛанч (ТЗ этапа 4, 07; ADR 0013): the chat protocol, tools,
 * system prompt, knowledge search, answer checks and the agent step — shared by `apps/api` (server) and the site.
 * No network and no clock of its own: the model and time are injected. Browser-side tool executors and the context
 * digest live in `@refectorio/kiki-core/client` (they need the menu engine).
 */
export * from './messages';
export * from './protocol';
export * from './tools';
export * from './numbers';
export * from './validate';
export * from './knowledge';
export * from './prompt';
export * from './agent';
