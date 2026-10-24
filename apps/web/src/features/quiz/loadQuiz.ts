/**
 * The quiz chunk, its photo data and the dish numbers are fetched in parallel. Importing the data here too makes each a
 * chunk of its own (ТЗ budgets: quiz ≤ 90 KB gz, photo data ≤ 25 KB gz, dish numbers part of «dish-core»). Lives in
 * the landing bundle: prefetch on hover, focus and idle.
 */
export const loadQuiz = () =>
  Promise.all([
    import('./QuizScene'),
    import('@refectorio/taste-core/data/photo-runtime.json'),
    import('@refectorio/taste-core/data/dish-numbers.json'),
  ]).then(([scene]) => scene);
