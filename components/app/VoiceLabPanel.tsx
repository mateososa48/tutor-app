"use client";

// The voice lab in the new-session window (Oct 2026): pick which voice stack
// the session runs on. Shown on preview builds, in development, or with
// ?lab=1 (lib/voice-lab.ts). A quiet row with the current stack as one line;
// open, a few segmented switches in the "How long today?" style. Every change
// is written into the page's query, which the intake carries to the session.
import { useEffect, useId, useState } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Select } from "@base-ui/react/select";
import { motion } from "motion/react";
import { Check, ChevronDown, FlaskConical } from "lucide-react";
import { useReduce } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";
import { DEFAULT_LAB, LAB_BRAINS, LAB_VOICES, labFromQuery, labParams, labSummary, normalizeLab, type VoiceLab } from "@/lib/voice-lab";

const STORE = "chalk.voiceLab.v1";

function readStored(): VoiceLab {
  try {
    return normalizeLab(JSON.parse(localStorage.getItem(STORE) ?? "null"));
  } catch {
    return DEFAULT_LAB;
  }
}

function writeQuery(lab: VoiceLab) {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(labParams(lab))) {
    if (v == null) params.delete(k);
    else params.set(k, v);
  }
  params.set("lab", "1");
  window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}`);
}

export function VoiceLabPanel() {
  const [lab, setLab] = useState<VoiceLab>(DEFAULT_LAB);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // The saved pick is only known in the browser.
  useEffect(() => {
    const saved = labFromQuery(new URLSearchParams(window.location.search), readStored());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setLab(saved);
    writeQuery(saved);
  }, []);

  const change = (patch: Partial<VoiceLab>) => {
    setLab((prev) => {
      const next = normalizeLab({ ...prev, ...patch });
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        // the pick still applies to this session
      }
      writeQuery(next);
      return next;
    });
  };

  return (
    <div className="mt-4 rounded-[14px] bg-(--lp-gray)/60">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[14px] px-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
      >
        <FlaskConical aria-hidden className="size-4 shrink-0 text-(--lp-sky-deep)" strokeWidth={2} />
        <span className="shrink-0 text-[13px] font-medium text-(--lp-ink)">Test setup</span>
        <span className="min-w-0 flex-1 truncate text-right text-[12.5px] text-(--lp-ink-2)">{labSummary(lab)}</span>
        <ChevronDown aria-hidden strokeWidth={2.5} className={cn("size-3.5 shrink-0 text-(--lp-ink-2) transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div id={panelId} hidden={!open} className="flex flex-col gap-2.5 px-3 pt-0.5 pb-3">
        <Segment
          label="Engine"
          value={lab.engine}
          options={[
            { value: "livekit", label: "LiveKit cascade" },
            { value: "gemini", label: "Gemini Live" },
          ]}
          onChange={(engine) => change({ engine })}
        />
        {lab.engine === "gemini" ? (
          <>
            <Segment label="Model" value={lab.live} options={[{ value: "3.8", label: "3.8" }, { value: "3.1", label: "3.1" }]} onChange={(live) => change({ live })} />
            <Segment
              label="Planner"
              value={lab.planner ? "on" : "off"}
              options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]}
              onChange={(v) => change({ planner: v === "on" })}
            />
          </>
        ) : (
          <>
            <Segment
              label="Hearing"
              value={lab.stt}
              options={[
                { value: "assemblyai", label: "Universal-3.6 Pro" },
                { value: "gemini", label: "Gemini" },
              ]}
              onChange={(stt) => change({ stt })}
            />
            {lab.stt === "assemblyai" && (
              <Segment
                label="Turn end"
                value={lab.turns}
                options={[
                  { value: "livekit", label: "LiveKit" },
                  { value: "assemblyai", label: "AssemblyAI" },
                ]}
                onChange={(turns) => change({ turns })}
              />
            )}
            <Segment
              label="Patience"
              value={lab.wait}
              options={[
                { value: "patient", label: "Patient" },
                { value: "quick", label: "Quick" },
              ]}
              onChange={(wait) => change({ wait })}
            />
            <Segment label="Brain" value={lab.brain} options={LAB_BRAINS.map((b) => ({ value: b.id, label: b.label }))} onChange={(brain) => change({ brain })} />
            <VoicePick value={lab.tts} onChange={(tts) => change({ tts })} />
          </>
        )}
      </div>
    </div>
  );
}

function Segment<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  const reduce = useReduce();
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={id} className="text-[13px] text-(--lp-ink-2)">
        {label}
      </span>
      <RadioGroup aria-labelledby={id} value={value} onValueChange={(next) => onChange(next as T)} className="flex h-9 items-center rounded-[11px] bg-(--lp-gray) p-[3px]">
        {options.map((o) => (
          <Radio.Root
            key={o.value}
            value={o.value}
            className="relative inline-flex h-full cursor-pointer items-center justify-center rounded-[8px] px-2.5 text-[12.5px] whitespace-nowrap text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) data-[checked]:text-(--lp-ink)"
          >
            {o.value === value && (
              <motion.span
                layoutId={`lab-pill-${id}`}
                aria-hidden
                className="absolute inset-0 rounded-[8px] bg-(--lp-surface) shadow-[0_1px_2px_rgba(18,18,21,0.08),0_1px_1px_rgba(18,18,21,0.04)]"
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0.12 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </Radio.Root>
        ))}
      </RadioGroup>
    </div>
  );
}

function VoicePick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = LAB_VOICES.find((v) => v.id === value) ?? LAB_VOICES[0];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-(--lp-ink-2)">Voice</span>
      <Select.Root value={value} onValueChange={(next) => next && onChange(next)}>
        <Select.Trigger
          aria-label="Tutor voice"
          className="group inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[11px] bg-(--lp-surface) px-3 text-[12.5px] text-(--lp-ink) shadow-[0_1px_2px_rgba(18,18,21,0.08)] outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
        >
          <Select.Value>{() => current.label}</Select.Value>
          <ChevronDown aria-hidden strokeWidth={2.5} className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 group-data-[popup-open]:rotate-180" />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} alignItemWithTrigger={false} className="z-[60] outline-none">
            <Select.Popup className="min-w-[230px] origin-(--transform-origin) rounded-[14px] bg-white p-1.5 shadow-[0_2px_4px_rgba(18,18,21,0.06),0_8px_8px_-6px_rgba(18,18,21,0.14)] ring-1 ring-[rgba(18,18,21,0.08)] outline-none transition-[scale,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0">
              {LAB_VOICES.map((v) => (
                <Select.Item key={v.id} value={v.id} className="flex cursor-pointer items-start gap-2 rounded-[9px] px-2 py-1.5 outline-none select-none data-[highlighted]:bg-(--lp-gray)">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                    <Select.ItemIndicator>
                      <Check className="size-4 text-(--lp-sky)" strokeWidth={2.75} />
                    </Select.ItemIndicator>
                  </span>
                  <span className="flex flex-col">
                    <Select.ItemText className="text-[13.5px] text-(--lp-ink)">{v.label}</Select.ItemText>
                    <span className="text-[12px] text-(--lp-ink-2)">{v.note}</span>
                  </span>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
