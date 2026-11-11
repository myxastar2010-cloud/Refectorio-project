/**
 * What the chat's digest reports about the page (ТЗ 07 §4.3): the selected day, the open dish, a «Заменить с ИИ» slot.
 * A tiny module of its own, so the menu page can set it without loading the chat chunk.
 */
export const chatUi: {
  /** The menu page's today (the demo menu has its own). */
  today?: string;
  selectedDate?: string;
  openItemId?: string;
  screen?: 'menu' | 'chat';
  replaceSlot?: { date: string; mealId: string; itemId: string } | undefined;
} = {};
