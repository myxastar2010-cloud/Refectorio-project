import type { Role } from '@refectorio/food-data';
import {
  IconApple,
  IconBowl,
  IconBread,
  IconCookie,
  IconCup,
  IconIceCream,
  IconMilk,
  IconSalad,
  IconSoup,
  IconToolsKitchen2,
  type Icon,
} from '@tabler/icons-react';

/** The placeholder's icon by role (D-080): never a broken image. */
export const ROLE_ICONS: Readonly<Record<Role, Icon>> = {
  main: IconToolsKitchen2,
  soup: IconSoup,
  salad: IconSalad,
  side: IconBowl,
  bread: IconBread,
  drink: IconCup,
  fruit: IconApple,
  dairy: IconMilk,
  snack: IconCookie,
  dessert: IconIceCream,
};
