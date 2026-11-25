import { KeyboardViewport } from './keyboard-viewport';
import Link from "next/link";
import type { ReactNode } from "react";
import { Navigation, type NavigationSection } from "./navigation";
export function AppShell({
  children,
  active = "Home",
  compact = false,
  legalFooter = false,
  showBranding = active === "Home",
}: {
  children: ReactNode;
  active?: NavigationSection | null;
  account?: ReactNode;
  compact?: boolean;
  legalFooter?: boolean;
  hideAddAction?: boolean;
  showBranding?:boolean;
}) {
  return (
    <div className={`wb-app ${!showBranding?"wb-app-unbranded":""} ${compact ? "wb-app-compact" : ""}`}>
      <a className="wb-skip" href="#app-content">
        Skip to content
      </a>
      <div className="wb-app-frame">
        {showBranding&&<header className="wb-masthead">
          <Link href="/" className="wb-wordmark" aria-label="Noted home">
            Noted
          </Link>
        </header>}
        <main
          id="app-content" tabIndex={-1}
          className={compact ? "wb-auth-content" : "wb-page-content"}
        >
          {children}
        </main>
        {legalFooter&&<footer className="wb-app-footer">
          <Link href="/privacy">Privacy & terms</Link>
        </footer>}
      </div>
      <KeyboardViewport />
      <div className="wb-app-navigation"><div id="wb-toast-anchor" role="status" aria-live="polite" aria-atomic="true" /><Navigation active={active} /></div>
    </div>
  );
}
