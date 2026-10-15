"use client";

import { useEffect, useState } from "react";
import { StudentTile, useSpoken, type StudentLottie, type StudentVideo } from "@/components/landing/StudentTile";

type Candidate = { id: string; label: string; note?: string; video?: StudentVideo; lottie?: StudentLottie };

const LINES = ["3/5? cause 3 is more than 2", "wait... the 2/3 one?", "2/3! ten is more than nine"];

// One clock for every tile, so they talk and go quiet together.
function useCycle() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((k) => k + 1), 6200);
    return () => window.clearInterval(id);
  }, []);
  return n;
}

function Tile({ c, n }: { c: Candidate; n: number }) {
  const { said, speaking } = useSpoken(LINES[n % LINES.length], n);
  return (
    <figure className="m-0 flex flex-col gap-3" data-candidate={c.id}>
      <div className="relative flex h-[190px] items-start justify-end rounded-[14px] border border-(--lp-line-strong) bg-white p-5">
        <StudentTile name="Student" said={said} speaking={speaking} reduce={false} video={c.video} lottie={c.lottie} />
      </div>
      <figcaption className="text-[13px] leading-[1.45] text-(--lp-ink-2)">
        <span className="font-medium text-(--lp-ink)">{c.label}</span>
        {c.note ? ` · ${c.note}` : ""}
      </figcaption>
    </figure>
  );
}

export default function StudentLab() {
  const [list, setList] = useState<Candidate[]>([{ id: "wave", label: "Waveform (before)" }]);
  const n = useCycle();
  useEffect(() => {
    fetch("/dev/student/candidates.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((more: Candidate[]) => setList([...more, { id: "wave", label: "Waveform (before)" }]))
      .catch(() => {});
  }, []);
  return (
    <main className="min-h-dvh bg-(--lp-bg) px-6 py-10">
      <h1 className="lp-display m-0 text-[28px] text-(--lp-ink)">Student tile candidates</h1>
      <p className="m-0 mt-2 max-w-[60ch] text-[15px] text-(--lp-ink-2)">Each in the real tile, talking for a line and then listening.</p>
      <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-6">
        {list.map((c) => (
          <Tile key={c.id} c={c} n={n} />
        ))}
      </div>
    </main>
  );
}
