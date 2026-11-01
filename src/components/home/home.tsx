"use client";
import Link from "next/link";
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
            <span id="home-add-description" className={styles.description}>A word, phrase, expression or sentence.</span>
          </span><ArrowIcon />
        </Link>
        <Link href="/review?mode=random" aria-label="Random Review" aria-describedby="home-review-description" className={`${styles.action} ${styles.review}`}>
          <span className={styles.actionCopy}>
            <span className={styles.label}>Random Review</span>
            <span id="home-review-description" className={styles.description}>A little repetition goes a long way.</span>
          </span><ArrowIcon />
        </Link>
        <Link href="/library" aria-label="Library" className={`${styles.action} ${styles.library}`}>
          <span className={styles.label}>Library</span><ArrowIcon />
        </Link>
      </div>
    </section>
  </AppShell>;
}
