import {
  Baby,
  Backpack,
  Car,
  CookingPot,
  Droplets,
  Dumbbell,
  House,
  Lamp,
  Laptop,
  Luggage,
  MonitorSmartphone,
  Puzzle,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sofa,
  Sparkles,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { IconKey } from "@/types";

const ICONS: Record<IconKey, LucideIcon> = {
  "monitor-smartphone": MonitorSmartphone,
  smartphone: Smartphone,
  laptop: Laptop,
  shirt: Shirt,
  "shopping-bag": ShoppingBag,
  house: House,
  "cooking-pot": CookingPot,
  wind: Wind,
  sofa: Sofa,
  lamp: Lamp,
  sparkles: Sparkles,
  droplets: Droplets,
  baby: Baby,
  puzzle: Puzzle,
  car: Car,
  dumbbell: Dumbbell,
  luggage: Luggage,
  backpack: Backpack,
};

export function CategoryIcon({
  icon,
  className,
  strokeWidth = 1.75,
}: {
  icon: IconKey;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = ICONS[icon];
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}
