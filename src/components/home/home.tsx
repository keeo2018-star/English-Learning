"use client";
import { useEffect, useState } from 'react';
import { LearningHeader } from '@/components/collections/learning-header';
import { supabase } from '@/lib/supabase';
import { useCollections } from '@/lib/use-collections';
import Link from "next/link";
import { prepareReviewPronunciation,stopPronunciation } from "@/lib/pronunciation";
import { AppShell } from "@/components/ui/app-shell";
import { Icon } from "@/components/ui/icon";
import { TodayReview } from "./today-review";
import styles from "./home.module.css";

export default function Home() {
  const [owner, setOwner] = useState<string|null>(null);
  const learning = useCollections(owner);
  useEffect(() => {
    const session = supabase?.auth.onAuthStateChange((_event, data) => setOwner(data?.user.id ?? null));
    return () => session?.data.subscription.unsubscribe();
  }, []);
  return <AppShell hideAddAction showBranding={false}>
    <LearningHeader brand title={<Link href="/" className="wb-wordmark" aria-label="Noted home">Noted</Link>}
      enabled={learning.enabled} collections={learning.collections} active={learning.active} onSelect={learning.select}/>
    <section className={`${styles.home} wb-ui-text`} aria-labelledby="home-title">
      <div className={styles.welcome}>
        <h1 id="home-title">Make room for<br /><span className={styles.highlight}>new words.</span></h1>
        <p className={styles.intro}>Keep a little. Come back for more.</p>
      </div>
      <TodayReview owner={owner} collection={learning.active} collectionReady={learning.ready && (!learning.enabled || !!learning.active)}/>
      <div className={styles.actions}>
        <Link href="/add" aria-label="Add" aria-describedby="home-add-description" className={`${styles.action} ${styles.add}`}>
          <span className={styles.actionCopy}>
            <span className={styles.label}>Add</span>
            <span id="home-add-description" className={styles.description}>Save your own words.</span>
          </span><Icon name="external" size={24}/>
        </Link>
        <Link href="/discover" aria-label="Discover" aria-describedby="home-discover-description" className={`${styles.action} ${styles.discover}`}>
          <span className={styles.actionCopy}><span className={styles.label}>Discover</span><span id="home-discover-description" className={styles.description}>Find words worth learning.</span></span><Icon name="external" size={24}/>
        </Link>
      </div>
      <Link href="/library" aria-label="Library" className={styles.library}>
        <span className={styles.actionCopy}><strong>Your library</strong><span className={styles.description}>All the words you’ve collected.</span></span><Icon name="external"/>
      </Link>
      <Link href="/review?mode=random" onClick={() => {stopPronunciation();prepareReviewPronunciation(false);}}
        aria-label="Random Review" className={styles.random}><Icon name="shuffle"/> Random review</Link>
    </section>
  </AppShell>;
}
