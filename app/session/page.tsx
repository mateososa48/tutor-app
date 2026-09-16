import { Suspense } from "react";
import NewSessionClient from "./NewSessionClient";

// "New session" lands here. The client half reads ?debug=1 / ?qa=1 / ?mock=1
// with useSearchParams, which Next cannot prerender without a boundary, so it
// sits inside Suspense (same shape as app/dev/board/page.tsx).

export const dynamic = "force-dynamic";

export default function NewSessionPage() {
  return (
    <Suspense fallback={null}>
      <NewSessionClient />
    </Suspense>
  );
}
