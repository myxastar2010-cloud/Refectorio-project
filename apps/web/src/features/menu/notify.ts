import type { ToastAction } from '../../components/Toast';

/** The site's toast: a line, or a line with «Отменить». */
export type Notify = (text: string, action?: ToastAction) => void;
