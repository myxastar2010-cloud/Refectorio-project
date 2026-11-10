import { m } from 'motion/react';
import { menu } from '../../../content/menu.ru';
import { quiz } from '../../../content/quiz.ru';
import { Sheet } from '../components/Sheet';

type Props = {
  readonly anchor: HTMLElement | null;
  readonly onClose: () => void;
};

/**
 * «Как мы используем данные» from the avatar menu and Kiki's button (ТЗ 07 §13): the same honest list as the quiz's
 * privacy sheet — what stays in this browser, what goes through our server to the AI service, what is never sent.
 */
export function PrivacySheet({ anchor, onClose }: Props) {
  return (
    <Sheet anchor={anchor} name="privacy" className="restore-sheet" onClose={onClose}>
      {(reveal) => (
        <div className="goal">
          <m.h2 id="privacy-title" className="goal-title" {...reveal(0)}>
            {quiz.privacy.title}
          </m.h2>
          <m.ul className="privacy-facts" {...reveal(1)}>
            {quiz.privacy.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </m.ul>
          <m.div className="goal-actions" {...reveal(2)}>
            <button type="button" className="goal-apply" data-autofocus onClick={onClose}>
              {menu.notices.ok}
            </button>
          </m.div>
        </div>
      )}
    </Sheet>
  );
}
