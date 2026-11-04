import {
  IconArrowsExchange,
  IconBell,
  IconBook,
  IconCandy,
  IconChartDots,
  IconCircleCheck,
  IconCrown,
  IconDroplet,
  IconFlame,
  IconHeart,
  IconMessageCircle,
  IconPackage,
  IconPlant,
  IconSalad,
  IconShieldCheck,
  IconShirt,
  IconStar,
  IconTag,
  IconTarget,
  type Icon,
} from '@tabler/icons-react';

/** The pictures named in discover.ru.ts. */
export const ICONS: Readonly<Record<string, Icon>> = {
  menu: IconSalad,
  swap: IconArrowsExchange,
  chart: IconChartDots,
  box: IconPackage,
  target: IconTarget,
  shield: IconShieldCheck,
  chat: IconMessageCircle,
  heart: IconHeart,
  bell: IconBell,
  check: IconCircleCheck,
  crown: IconCrown,
  shirt: IconShirt,
  book: IconBook,
  tag: IconTag,
  sprout: IconPlant,
  drop: IconDroplet,
  candy: IconCandy,
  salad: IconSalad,
  flame: IconFlame,
  star: IconStar,
};

export function NamedIcon({
  name,
  className,
}: {
  readonly name: string;
  readonly className?: string;
}) {
  const Component = ICONS[name] ?? IconStar;
  return <Component aria-hidden className={className} stroke={1.8} />;
}
