import { Component, useEffect, useState, type ReactNode } from 'react';
import { site } from '../content/site.ru';

/** The quiz chunk is late: a quiet line only if it takes longer than this (no flash on a fast connection). */
const LOADING_AFTER_MS = 400;

type Props = { readonly onError: () => void; readonly children: ReactNode };
type State = { readonly failed: boolean };

/**
 * The quiz chunk did not arrive (offline, a deploy replaced the files): the landing comes back with a kind note
 * instead of an empty screen (ТЗ §7.1).
 */
export class QuizBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onError();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** «Загружаем тест…» while the chunk is on its way. */
export function QuizLoading() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShown(true);
    }, LOADING_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <p className="quiz-loading" role="status">
      {shown ? site.quizShell.loading : ''}
    </p>
  );
}
