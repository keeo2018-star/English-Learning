import { AppShell } from "@/components/ui/app-shell";
import { StatePanel } from "@/components/ui/states";
export default function NotFound() {
  return (
    <AppShell compact>
      <StatePanel
        title="A word out of place."
        description="This page doesn’t exist. Your wordbook is right where you left it."
        eyebrow="404 / NOT FOUND"
        href="/"
        actionLabel="Back to Home"
        color="lavender"
      />
    </AppShell>
  );
}
