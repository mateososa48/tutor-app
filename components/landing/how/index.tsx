"use client";

import { Bento } from "./Bento";

// How it works (Sept 22): the old `AskBoard` ("Talk to it like a human
// tutor", one equation in a window) and `Trio` ("You talk. It writes. You
// try.", three boxes) merged into one bento, because they showed the same
// thing twice and both only ever showed one linear equation. Mateo chose the
// bento over four other layouts (a pinned scroll story, a camera over one
// board, a question index, a printed script and a session timeline), which
// were deleted.

export function HowItWorks() {
  return (
    <div id="how-it-works" className="scroll-mt-24">
      <Bento />
    </div>
  );
}
