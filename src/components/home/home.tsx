"use client";
import Link from "next/link";
import { prepareReviewPronunciation } from "@/lib/pronunciation";
import { AppShell } from "@/components/ui/app-shell";
import { ArrowIcon } from "@/components/ui/primitives";
import styles from "./home.module.css";

export default function Home() {
  return <AppShell hideAddAction>
    <section className={`${styles.home} wb-ui-text`} aria-labelledby="home-title">
      <div className={styles.welcome}>
        <p className={styles.eyebrow}><span aria-hidden="true" />YOUR DAILY WORD SPACE</p>
        <h1 id="home-title">Make room for<br /><span className={styles.highlight}>new words.</span></h1>
        <p className={styles.intro}>Keep a little. Come back for more.</p>
      </div>
      <div className={styles.actions}>
        <Link href="/add" aria-label="Add" aria-describedby="home-add-description" className={`${styles.action} ${styles.add}`}>
          <span className={styles.actionCopy}>
            <span className={styles.label}>Add</span>
            <span id="home-add-description" className={styles.description}>Save your own words.</span>
          </span><ArrowIcon />
        </Link>
        <Link href="/discover" aria-label="Discover" aria-describedby="home-discover-description" className={`${styles.action} ${styles.discover}`}>
          <span className={styles.actionCopy}><span className={styles.label}>Discover</span><span id="home-discover-description" className={styles.description}>Find words worth learning.</span></span><ArrowIcon />
        </Link>
        <Link href="/review?mode=random" onClick={() => prepareReviewPronunciation()} aria-label="Random Review" aria-describedby="home-review-description" className={`${styles.action} ${styles.review}`}>
          <span className={styles.actionCopy}>
            <span className={styles.label}>Random Review</span>
            <span id="home-review-description" className={styles.description}>Make it stick.</span>
          </span><ArrowIcon />
        </Link>
      </div>
        <Link href="/library" aria-label="Library" className={styles.library}>
          <span className={styles.label}>Library</span><ArrowIcon />
        </Link>
    </section>
  </AppShell>;
}
