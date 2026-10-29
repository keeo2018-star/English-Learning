import Link from "next/link";
import { ArrowIcon } from "./primitives";
const entries = [
  { label: "Home", href: "/", icon: "⌂" },
  { label: "Dictionary", href: "/#dictionary", icon: "↗" },
  { label: "Library", href: "/library", icon: "▤" },
  { label: "Review", href: "/review", icon: "↻" },
  { label: "Profile", href: "/auth", icon: "○" },
];
export function Navigation() {
  return (
    <nav className="wb-navigation" aria-label="Main navigation">
      {entries.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.label === "Home" ? "page" : undefined}
          className={`wb-nav-item ${item.label === "Dictionary" ? "wb-nav-dictionary" : ""}`}
        >
          <span aria-hidden="true">
            {item.label === "Dictionary" ? <ArrowIcon /> : item.icon}
          </span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
