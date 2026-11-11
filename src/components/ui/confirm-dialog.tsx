"use client";
import { useEffect, useRef, useId } from "react";
import { Pill } from "./primitives";
export function ConfirmDialog({
  word,
  busy,
  onConfirm,
  onCancel,
  recordingWarning=false,
  returnFocus,
  entry=false,
  error,
}: {
  word: string;
  entry?: boolean;
  error?: string;
  recordingWarning?: boolean;
  returnFocus?: HTMLElement | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = returnFocus || document.activeElement;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [returnFocus]);
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
      <h2 id={id + "-title"}>{entry?'Delete this entry?':'Delete this word?'}</h2>
      <p id={id + "-description"} className="wb-ui-text">
        “<span className="wb-learning-content">{word}</span>” will be removed from your library. {recordingWarning&&"Any attached voice note will also be removed. "}This can’t be undone.
      </p>
      {error&&<p role="alert">{error}</p>}
      <div className="actions">
        <button
          ref={cancel}
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          {entry?'Cancel':'Keep word'}
        </button>
        <button
          type="button"
          className="wb-destructive"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Deleting…" : entry?"Delete":"Delete word"}
        </button>
      </div>
    </dialog>
  );
}
