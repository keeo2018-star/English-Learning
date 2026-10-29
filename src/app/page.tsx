import Link from "next/link";
export default function Home() {
  return (
    <main className="landing">
      <div className="eyebrow">WORDBOOK / YOUR ENGLISH PRACTICE</div>
      <h1>
        A little practice.
        <br />A bigger vocabulary.
      </h1>
      <p>Keep the words you discover. Make them yours with a daily review.</p>
      <div className="actions">
        <Link className="button" href="/add">
          Start learning →
        </Link>
        <Link href="/auth">Sign in to sync</Link>
      </div>
      <div className="tiles">
        <article>
          <b>01 / COLLECT</b>
          <h2>Notice a new word?</h2>
          <p>Save its meaning and a sentence that makes it stick.</p>
        </article>
        <article>
          <b>02 / PRACTICE</b>
          <h2>Come back to it.</h2>
          <p>Review at your pace, with cards scheduled around your progress.</p>
        </article>
        <article>
          <b>03 / GROW</b>
          <h2>See what you know.</h2>
          <p>Your personal library, always ready to explore.</p>
        </article>
      </div>
    </main>
  );
}
