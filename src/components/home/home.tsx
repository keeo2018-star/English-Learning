"use client";
import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { ArrowIcon } from "@/components/ui/primitives";
import styles from "./home.module.css";

export default function Home() {
  return <AppShell hideAddAction>
    <section className={`${styles.home} wb-ui-text`} aria-labelledby="home-title">
      <p className={styles.eyebrow}>A PERSONAL LEARNING NOTEBOOK</p>
      <h1 id="home-title">Notice it.<br />Keep it.</h1>
      <p className={styles.intro}>Your words, at your own pace.</p>
      <div className={styles.actions}>
        <Link href="/add" className={`${styles.action} ${styles.add}`}>
          <span className={styles.number} aria-hidden="true">01</span>
          <span className={styles.label}>Add</span><ArrowIcon />
        </Link>
        <Link href="/review?mode=random" className={styles.action}>
          <span className={styles.number} aria-hidden="true">02</span>
          <span className={styles.label}>Random Review</span><ArrowIcon />
        </Link>
      </div>
      <Link href="/library" className={styles.library}>Open your library <ArrowIcon /></Link>
    </section>
  </AppShell>;
}
