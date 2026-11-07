"use client";
import { prepareReviewPronunciation } from "@/lib/pronunciation";
import { SelectableLink } from "./selection";
const entries = [
  { label: "Home", href: "/", icon: "⌂" },
  { label: "Add", href: "/add", icon: "+" },
  { label: "Discover", href: "/discover", icon: "✧" },
  { label: "Review", href: "/review", icon: "↻" },
  { label: "Profile", href: "/auth", icon: "○" },
];
export type NavigationSection =
  "Home" | "Add" | "Discover" | "Review" | "Profile";
export function Navigation({
  active = "Home",
}: {
  active?: NavigationSection | null;
}) {
  return (
    <nav className="wb-navigation" aria-label="Main navigation">
      {entries.map((item) => (
        <SelectableLink
          key={item.label}
          href={item.href}
          selected={item.label === active}
          className="wb-nav-item"
          onClick={item.label === "Review" ? () => { prepareReviewPronunciation(); } : undefined}
        >
          <span aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </SelectableLink>
      ))}
    </nav>
  );
}
