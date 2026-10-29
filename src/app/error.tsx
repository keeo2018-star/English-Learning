"use client";
import { AppShell } from "@/components/ui/app-shell";
import { StatePanel } from "@/components/ui/states";
export default function ErrorPage({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <AppShell compact>
      <StatePanel
        title="Let’s try that again."
        description="Something didn’t load as expected. Give it another go."
        eyebrow="A SMALL INTERRUPTION"
        actionLabel="Try again"
        onAction={retry}
        color="coral"
      />
    </AppShell>
  );
}
