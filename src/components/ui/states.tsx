import Link from "next/link";
import type { ReactNode } from "react";
import { Card, Pill, ArrowIcon, type CardColor } from "./primitives";
export function Feedback({ children }: { children: ReactNode }) {
  return (
    <p className="feedback wb-feedback" role="status">
      {children}
    </p>
  );
}
export function LoadingState({
  label = "Loading your library…",
}: {
  label?: string;
}) {
  return (
    <Card color="paper" className="wb-loading">
      <div role="status" aria-live="polite">
        <Pill>ONE MOMENT</Pill>
        <p>{label}</p>
      </div>
      <div className="wb-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </Card>
  );
}
export function StatePanel({
  title,
  description,
  eyebrow = "YOUR NEXT CHAPTER",
  href,
  actionLabel,
  onAction,
  color = "paper",
  completed = false,
}: {
  title: string;
  description: ReactNode;
  eyebrow?: string;
  href?: string;
  actionLabel?: string;
  onAction?: () => void;
  color?: CardColor;
  completed?: boolean;
}) {
  return (
    <Card
      color={color}
      className={`panel wb-state ${completed ? "wb-state-completed" : ""}`}
    >
      <Pill>{eyebrow}</Pill>
      <h2>{title}</h2>
      <p>{description}</p>
      {href && (
        <Link className="wb-control" href={href}>
          {actionLabel}
          <ArrowIcon />
        </Link>
      )}
      {onAction && (
        <button type="button" onClick={onAction}>
          {actionLabel}
          <ArrowIcon />
        </button>
      )}
    </Card>
  );
}
