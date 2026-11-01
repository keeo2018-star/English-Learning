import { Suspense } from "react";
import Workspace from "@/lib/workspace";
import Loading from "../loading";
export default function Page() {
  return <Suspense fallback={<Loading />}><Workspace page="review" /></Suspense>;
}
