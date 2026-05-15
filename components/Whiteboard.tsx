"use client";

import dynamic from "next/dynamic";
import { forwardRef } from "react";
import type { WhiteboardHandle } from "./TldrawCore";

export type { WhiteboardHandle };

// tldraw touches window at import time — must be client-only
const TldrawCore = dynamic(() => import("./TldrawCore"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <span style={{ color: "#909090", fontSize: 14 }}>Loading whiteboard…</span>
    </div>
  ),
});

const Whiteboard = forwardRef<WhiteboardHandle>(function Whiteboard(_, ref) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <TldrawCore ref={ref as any} />;
});

export default Whiteboard;
