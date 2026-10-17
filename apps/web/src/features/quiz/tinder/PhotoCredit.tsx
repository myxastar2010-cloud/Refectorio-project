import { quiz } from '../../../content/quiz.ru';
import { fill } from '../quizContext';
import type { PhotoSource } from './photos';

const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=refectorio&utm_medium=referral';

/**
 * «Фото: автор · Unsplash» under the card — only in the hotlink mode (PHOTO_HOSTING=unsplash), where the Unsplash API
 * guidelines ask for it. The default build serves our own copies without a credit in the game (D-048); the authors are
 * listed in docs/photo-credits.md («О проекте» → «Подробнее»).
 */
export function PhotoCredit({ source }: { readonly source: PhotoSource | null }) {
  const credit = source?.credit;
  if (!credit) return <p className="quiz-game-credit" aria-hidden />;
  const provider = quiz.taste.providers.unsplash;
  const parts = quiz.taste.credit.split(/(\{author\}|\{provider\})/);
  return (
    <p className="quiz-game-credit">
      {parts.map((part, index) => {
        if (part === '{author}') {
          return (
            <a
              key={index}
              href={credit.authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={fill(quiz.taste.creditLabel, { author: credit.author, provider })}
            >
              {credit.author}
            </a>
          );
        }
        if (part === '{provider}') {
          return (
            <a
              key={index}
              href={UNSPLASH_HOME}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={fill(quiz.taste.providerLabel, { provider })}
            >
              {provider}
            </a>
          );
        }
        return part;
      })}
    </p>
  );
}
