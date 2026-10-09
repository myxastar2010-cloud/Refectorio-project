/**
 * @refectorio/contracts — versioned data contracts between the stages (zod 4). Stage 2 (quiz) writes them,
 * stage 3 (menu) reads them; a new incompatible shape gets a new version, the old one stays readable.
 */
export * from './taste';
export * from './quiz';
