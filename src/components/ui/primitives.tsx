import {Icon} from "./icon";
import Link from "next/link";
import type { ReactNode, CSSProperties } from "react";
export type CardColor =
  "acid" | "green" | "coral" | "pink" | "lavender" | "blue" | "paper";
// Collection identity determines its color; the palette is independent of features.
export function collectionColor(identity: string): CardColor {
  const palette: CardColor[] = [
    "acid",
    "green",
    "coral",
    "pink",
    "lavender",
    "blue",
  ];
  const hash = Array.from(identity).reduce(
    (value, letter) => (value * 31 + letter.charCodeAt(0)) >>> 0,
    0,
  );
  return palette[hash % palette.length];
}
export function Card({
  children,
  color = "paper",
  className = "",
  style,
}: {
  children: ReactNode;
  color?: CardColor;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <article className={`wb-card wb-color-${color} ${className}`} style={style}>
      {children}
    </article>
  );
}
export function Pill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`wb-pill ${className}`}>{children}</span>;
}
export function ArrowIcon({
  direction = "up-right",
}: {
  direction?: "up-right" | "down-left";
}) {
  return <span className="wb-icon" aria-hidden="true" style={direction==="down-left"?{transform:"rotate(180deg)"}:undefined}>
    <Icon name="external" size={24}/>
  </span>;
}
export function ArrowLink({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link href={href} className={`wb-arrow ${className}`} aria-label={label}>
      <ArrowIcon />
    </Link>
  );
}
