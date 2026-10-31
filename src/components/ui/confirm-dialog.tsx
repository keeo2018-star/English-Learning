"use client";
import { useEffect, useRef, useId } from "react";
import { Pill } from "./primitives";
export function ConfirmDialog({
  word,
  busy,
  onConfirm,
  onCancel,
}: {
  word: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="wb-dialog"
      aria-labelledby={id + "-title"}
      aria-describedby={id + "-description"}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <Pill>YOUR LIBRARY</Pill>
      <h2 id={id + "-title"}>Delete this word?</h2>
      <p id={id + "-description"} className="wb-ui-text">
        “<span className="wb-learning-content">{word}</span>” will be removed from your library. This can’t be undone.
      </p>
      <div className="actions">
        <button
          ref={cancel}
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Keep word
        </button>
        <button
          type="button"
          className="wb-destructive"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Deleting…" : "Delete word"}
        </button>
      </div>
    </dialog>
  );
}
