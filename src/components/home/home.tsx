"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Navigation } from "@/components/ui/navigation";
import {
  Card,
  Pill,
  Progress,
  ArrowLink,
  ArrowIcon,
  collectionColor,
} from "@/components/ui/primitives";
import { useHomeLibrary } from "./use-home-library";
import { supabase } from "@/lib/supabase";
import styles from "./home.module.css";

export default function Home() {
  const { words, loading, error, signedIn, retry } = useHomeLibrary();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const initial = setTimeout(update, 0);
    const timer = setInterval(update, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  const started = words.filter((word) => word.interval_days > 0).length;
  const due = words.filter(
    (word) => new Date(word.due_at).getTime() <= now,
  ).length;
  const progress = words.length ? (started / words.length) * 100 : 0;
  const collections = [
    {
      id: "your-wordbook",
      title: "Your wordbook.",
      subtitle: "Every word you’ve made room for.",
      href: "/library",
      count: words.length,
      pill: "All saved words",
      progress,
      progressLabel: "Words on a longer review schedule",
    },
    {
      id: "fresh-finds",
      title: "Fresh finds.",
      subtitle: "New words. A fresh perspective.",
      href: "/library?view=new",
      count: words.filter((word) => word.interval_days === 0).length,
      pill: "Not yet recalled",
      progress: 0,
      progressLabel: "First recall pending",
    },
    {
      id: "in-the-making",
      title: "In the making.",
      subtitle: "A little repetition goes a long way.",
      href: "/library?view=learning",
      count: started,
      pill: "Review in progress",
      progress,
      progressLabel: "Words on a longer review schedule",
    },
  ];
  return (
    <div className={styles.home}>
      <a className={styles.skip} href="#main-content">
        Skip to content
      </a>
      <div className={styles.frame}>
        <header className={styles.masthead}>
          <Link href="/" className={styles.wordmark} aria-label="Wordbook home">
            wordbook<span aria-hidden="true">.</span>
          </Link>
          <span className={styles.edition}>
            A WORK IN PROGRESS.
            <br />
            JUST LIKE YOU.
          </span>
          <Link href="/auth" className={styles.account}>
            {signedIn ? "My account" : "Sign in"}
            <ArrowIcon />
          </Link>
        </header>
        <main id="main-content">
          <section className={styles.hero} aria-labelledby="home-title">
            <div className={styles.heroCopy}>
              <div className={styles.kicker}>
                <span className={styles.dot} />
                <span>YOUR DAILY WORD SPACE</span>
              </div>
              <h1 id="home-title">
                Make room
                <br />
                for <span className={styles.highlight}>new words.</span>
              </h1>
              <p>
                A word you notice. A thought you can finally put into words.
                Keep a little. Come back for more.
              </p>
            </div>
            <div className={styles.heroNote}>
              <span className={styles.noteNumber}>Aa</span>
              <Pill>LESS SCROLL. MORE RECALL.</Pill>
              <span>
                Good words.
                <br />
                Great company.
              </span>
              <span className={styles.noteArrow} aria-hidden="true">
                <ArrowIcon direction="down-left" />
              </span>
            </div>
          </section>
          <section
            id="dictionary"
            className={styles.dictionary}
            aria-labelledby="dictionary-title"
          >
            <div>
              <h2 id="dictionary-title">
                Find your next
                <br />
                “that’s the word.”
              </h2>
              <p>Search the vocabulary you’ve collected.</p>
            </div>
            <form
              action="/library"
              method="get"
              role="search"
              className={styles.search}
            >
              <label className={styles.srOnly} htmlFor="home-search">
                Search your saved words
              </label>
              <span className={styles.searchIcon} aria-hidden="true">
                ⌕
              </span>
              <input
                id="home-search"
                type="search"
                name="q"
                placeholder="A word, a meaning, a little curiosity…"
                maxLength={200}
              />
              <button type="submit" aria-label="Search your library">
                <ArrowIcon />
              </button>
            </form>
          </section>
          <section className={styles.learning} aria-labelledby="continue-title">
            <div className={styles.sectionHeading}>
              <h2 id="continue-title">
                Pick up where
                <br className={styles.mobileBreak} /> you left off.
              </h2>
              <Pill>CONTINUE LEARNING</Pill>
            </div>
            {loading ? (
              <div className={styles.state} role="status">
                Opening your wordbook…
              </div>
            ) : error ? (
              <div className={styles.state} role="status">
                <p>
                  Your wordbook couldn’t be loaded. Your saved words are still
                  yours.
                </p>
                <button onClick={retry}>
                  Try again <ArrowIcon />
                </button>
              </div>
            ) : (
              <div className={styles.continueGrid}>
                <Card color="acid" className={styles.continueCard}>
                  <div className={styles.cardTop}>
                    <Pill>
                      {supabase && !signedIn
                        ? "YOUR NEXT CHAPTER"
                        : due
                          ? "READY WHEN YOU ARE"
                          : "KEEP THE MOMENTUM"}
                    </Pill>
                    <span aria-hidden="true">✳</span>
                  </div>
                  <div className={styles.continueBody}>
                    <div>
                      <h3
                        className={
                          !due && words.length > 0 && (!supabase || signedIn)
                            ? styles.completed
                            : undefined
                        }
                      >
                        {supabase && !signedIn ? (
                          "Your words. Everywhere."
                        ) : due ? (
                          <>
                            Your words
                            <br />
                            are calling.
                          </>
                        ) : words.length ? (
                          <>
                            All caught up.
                            <br />
                            Nice work.
                          </>
                        ) : (
                          <>
                            A blank page.
                            <br />
                            Big potential.
                          </>
                        )}
                      </h3>
                      <p>
                        {supabase && !signedIn
                          ? "Sign in to bring your vocabulary with you."
                          : due
                            ? `${due} ${due === 1 ? "word is" : "words are"} ready for another look.`
                            : words.length
                              ? "Come back when your next review is due."
                              : "Save your first word. The rest starts there."}
                      </p>
                    </div>
                    <ArrowLink
                      href={
                        supabase && !signedIn
                          ? "/auth"
                          : due
                            ? "/review"
                            : "/add"
                      }
                      label={
                        supabase && !signedIn
                          ? "Sign in to your wordbook"
                          : due
                            ? "Review your due words"
                            : "Add a learning item"
                      }
                    />
                  </div>
                </Card>
                <Card color="paper" className={styles.progressCard}>
                  <div className={styles.cardTop}>
                    <Pill>THE BIGGER PICTURE</Pill>
                    <span>01 / ∞</span>
                  </div>
                  <div className={styles.progressNumber}>
                    {started}
                    <span> / {words.length}</span>
                  </div>
                  <p>
                    words on a longer review schedule.
                    <br />
                    Small steps count.
                  </p>
                  <Progress
                    value={progress}
                    label="Words on a longer review schedule"
                  />
                  <div className={styles.progressMeta}>
                    <span>{Math.round(progress)}% in practice</span>
                    <Link href="/review">
                      Keep going <ArrowIcon />
                    </Link>
                  </div>
                </Card>
              </div>
            )}
          </section>
          <section
            className={styles.collections}
            aria-labelledby="collections-title"
          >
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.kicker}>
                  COLLECT A LITTLE. KEEP A LOT.
                </span>
                <h2 id="collections-title">
                  A collection
                  <br />
                  of possibilities.
                </h2>
              </div>
              <Link href="/library" className={styles.outlineLink}>
                Your library <ArrowIcon />
              </Link>
            </div>
            <p className={styles.collectionIntro}>
              One wordbook. A few ways to find your way back in.
            </p>
            <div className={styles.cardStack}>
              {collections.map((collection, index) => (
                <Card
                  key={collection.id}
                  color={collectionColor(`${collection.id}/${index}`)}
                  className={`${styles.collectionCard} ${styles["collection" + index]}`}
                >
                  <div className={styles.cardTop}>
                    <Pill
                      className={
                        collection.id === "fresh-finds"
                          ? "wb-status-unlearned"
                          : undefined
                      }
                    >
                      {collection.pill}
                    </Pill>
                    <span className={styles.cardIndex}>0{index + 1}</span>
                  </div>
                  <h3>{collection.title}</h3>
                  <p>{collection.subtitle}</p>
                  <div className={styles.collectionFooter}>
                    <Pill>
                      {loading
                        ? "Loading…"
                        : error
                          ? "Unavailable"
                          : supabase && !signedIn
                            ? "Sign in to collect"
                            : `${collection.count} ${collection.count === 1 ? "word" : "words"}`}
                    </Pill>
                    <ArrowLink
                      href={supabase && !signedIn ? "/auth" : collection.href}
                      label={`Open ${collection.title.replace(".", "")}`}
                    />
                  </div>
                </Card>
              ))}
            </div>
            {!loading && !error && !words.length && (
              <p className={styles.emptyNote}>
                {supabase && !signedIn ? (
                  "Your collection starts with you. Sign in to see your saved words."
                ) : (
                  <>
                    Nothing collected yet.{" "}
                    <Link href="/add">
                      Make your first find <ArrowIcon />
                    </Link>
                  </>
                )}
              </p>
            )}
          </section>
          <section className={styles.endnote}>
            <span className={styles.endmark} aria-hidden="true">
              a—z
            </span>
            <p>
              Not another lesson.
              <br />
              Your own way with words.
            </p>
            <Link href="/add" className={styles.outlineLink}>
              Add a word <span aria-hidden="true">＋</span>
            </Link>
          </section>
        </main>
        <footer className={styles.footer}>
          <span>WORDBOOK /</span>
          <span>A LITTLE EVERY DAY. A LOT OVER TIME.</span>
          <span>
            {!supabase
              ? "LOCAL DEMO · SAVED IN THIS BROWSER"
              : "YOUR PERSONAL WORD SPACE"}
          </span>
        </footer>
      </div>
      <Navigation />
    </div>
  );
}
