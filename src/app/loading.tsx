import { AppShell } from "@/components/ui/app-shell";
import { LoadingState } from "@/components/ui/states";
export default function Loading() {
  return (
    <AppShell compact>
      <LoadingState label="Opening your wordbook…" />
    </AppShell>
  );
}
