/**
 * The quiz chunk and its photo data are fetched in parallel. Importing the data here too makes it a chunk of its own
 * (ТЗ budgets: quiz ≤ 90 KB gz, photo data ≤ 25 KB gz). Lives in the landing bundle: prefetch on hover, focus and idle.
 */
export const loadQuiz = () =>
  Promise.all([
    import('./QuizScene'),
    import('@refectorio/taste-core/data/photo-runtime.json'),
  ]).then(([scene]) => scene);
