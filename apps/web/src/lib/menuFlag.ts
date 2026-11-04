/**
 * «A menu is stored in this browser» — one synchronous flag next to the IndexedDB data (the menu store sets and clears
 * it), so the landing can say «Открыть моё меню» without loading the menu's code (ТЗ фаза 4 §13).
 */
const KEY = 'refectorio.hasMenu';

export function hasStoredMenu(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setStoredMenu(stored: boolean): void {
  try {
    if (stored) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage refused: the landing keeps «Создать меню», the menu itself still works.
  }
}
