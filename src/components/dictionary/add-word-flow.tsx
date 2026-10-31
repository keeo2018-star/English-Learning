"use client";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
export function AddWordFlow({ busy, canSave, checkingAccount, onManualSubmit }: {
    busy: boolean;
    canSave: boolean;
    checkingAccount: boolean;
    onManualSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
    if (!canSave)
        return <Card className="wb-ui-text"><p>{checkingAccount ? "Checking your account…" : "Sign in to save words to your private library."}</p>{!checkingAccount && <Link className="wb-control" href="/auth">Sign in</Link>}</Card>;
    return <form className="panel word-form" onSubmit={onManualSubmit}>
 <label>Word or phrase<input name="word" placeholder="e.g. meticulous" required maxLength={120}/></label>
 <label>Meaning<textarea name="meaning" placeholder="What does it mean to you?" required maxLength={2000}/></label>
 <div className="form-bottom"><span>Your words. Your meaning. Dictionary reference is available after saving.</span><button disabled={busy}>{busy ? "Saving…" : "Add to my library + "}</button></div>
 </form>;
}
