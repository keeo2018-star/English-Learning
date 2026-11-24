import Link from "next/link";
import type { ReactNode } from "react";
import { Navigation, type NavigationSection } from "./navigation";
export function AppShell({
  children,
  active = "Home",
  compact = false,
}: {
  children: ReactNode;
  active?: NavigationSection | null;
  account?: ReactNode;
  compact?: boolean;
  hideAddAction?: boolean;
}) {
  return (
    <div className={`wb-app ${compact ? "wb-app-compact" : ""}`}>
      <a className="wb-skip" href="#app-content">
        Skip to content
      </a>
      <div className="wb-app-frame">
        <header className="wb-masthead">
          <Link href="/" className="wb-wordmark" aria-label="Noted home">
            Noted
          </Link>
        </header>
        <main
          id="app-content"
          className={compact ? "wb-auth-content" : "wb-page-content"}
        >
          {children}
        </main>
        <footer className="wb-app-footer">
          <Link href="/privacy">Privacy & terms</Link>
        </footer>
      </div>
      <Navigation active={active} />
    </div>
  );
}
