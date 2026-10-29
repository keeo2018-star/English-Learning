import Link from "next/link";
import type { ReactNode } from "react";
import { Navigation, type NavigationSection } from "./navigation";
import { ArrowIcon } from "./primitives";
export function AppShell({
  children,
  active = "Home",
  account,
  compact = false,
  hideAddAction = false,
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
          <Link href="/" className="wb-wordmark" aria-label="Wordbook home">
            wordbook.
          </Link>
          <span className="wb-edition">
            YOUR WORDS.
            <br />
            YOUR OWN WAY.
          </span>
          <div className="wb-masthead-actions">
            {account}
            {!hideAddAction && (
              <Link
                href="/add"
                className="wb-control wb-control-outline"
                aria-label="Add a word"
              >
                <span className="wb-add-long">Add a word</span>
                <span className="wb-add-short" aria-hidden="true">
                  Add
                </span>
                <ArrowIcon />
              </Link>
            )}
          </div>
        </header>
        <main
          id="app-content"
          className={compact ? "wb-auth-content" : "wb-page-content"}
        >
          {children}
        </main>
        <footer className="wb-app-footer">
          <span>WORDBOOK /</span>
          <span>A LITTLE EVERY DAY. A LOT OVER TIME.</span>
        </footer>
      </div>
      <Navigation active={active} />
    </div>
  );
}
