import Link from "next/link";
const entries = [
  { label: "Home", href: "/", icon: "⌂" },
  { label: "Library", href: "/library", icon: "▤" },
  { label: "Review", href: "/review", icon: "↻" },
  { label: "Profile", href: "/auth", icon: "○" },
];
export type NavigationSection =
  "Home" | "Library" | "Review" | "Profile";
export function Navigation({
  active = "Home",
}: {
  active?: NavigationSection | null;
}) {
  return (
    <nav className="wb-navigation" aria-label="Main navigation">
      {entries.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.label === active ? "page" : undefined}
          className="wb-nav-item"
        >
          <span aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
