"use client";

import dynamic from "next/dynamic";
import { forwardRef } from "react";
import type { ExploreTarget, TldrawCoreProps, WhiteboardHandle, WhiteboardSnapshot } from "./TldrawCore";

export type { ExploreTarget, WhiteboardHandle, WhiteboardSnapshot };

// tldraw touches window at import time — must be client-only.
const TldrawCore = dynamic(() => import("./TldrawCore"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <span style={{ color: "#909090", fontSize: 14 }}>Loading whiteboard…</span>
    </div>
  ),
});

const Whiteboard = forwardRef<WhiteboardHandle, TldrawCoreProps>(function Whiteboard(props, ref) {
  return (
    <TldrawCore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      onWriting={props.onWriting}
      autoFocus={props.autoFocus}
      onExplore={props.onExplore}
      exploringItemId={props.exploringItemId}
    />
  );
});

export default Whiteboard;
