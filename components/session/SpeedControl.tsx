"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Popover } from "@base-ui/react/popover";
import { Slider } from "@base-ui/react/slider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DEFAULT_TUTOR_SPEED,
  getTutorSpeed,
  saveTutorSpeed,
  TUTOR_SPEEDS,
  tutorSpeedAt,
  tutorSpeedIndex,
  tutorSpeedLabel,
  type TutorSpeedId,
} from "@/lib/voice-settings";
import { cn } from "@/lib/utils";

// How fast the tutor talks, left of Files above the voice dock. A round button
// whose gauge needle points at the current speed opens a panel that grows out
// of it: five named stops on a slider that clicks into place. The choice is
// remembered in this browser, and the voice follows it mid-sentence.

const listeners = new Set<() => void>();

export function useTutorSpeed(): [TutorSpeedId, (speed: TutorSpeedId) => void] {
  const speed = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getTutorSpeed,
    () => DEFAULT_TUTOR_SPEED,
  );
  const setSpeed = useCallback((next: TutorSpeedId) => {
    saveTutorSpeed(next);
    listeners.forEach((notify) => notify());
  }, []);
  return [speed, setSpeed];
}

const LAST = TUTOR_SPEEDS.length - 1;
// Degrees from straight up for each stop. The dial's arc reaches 120° either
// side of up, so the needle never touches it.
const NEEDLE_DEG = [-64, -32, 0, 32, 64];
// Half the thumb. The slider pads by this much so the thumb stays inside the
// panel at both ends; stop positions are measured inside that padding.
const THUMB_R = 11;

// Panel content settles in just behind the panel itself: a short stagger,
// each part rising 3px out of a slight blur.
const REVEAL =
  "transition-[opacity,translate,filter] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] starting:translate-y-[3px] starting:opacity-0 starting:blur-[2px] motion-reduce:transition-none";

/**
 * A dial in lucide's stroke language: a 240° arc, a needle on a filled hub.
 * The needle turns to the current stop with a slight overshoot and leans a few
 * degrees when the button is hovered.
 */
export function SpeedGauge({ index, className }: { index: number; className?: string }) {
  const deg = NEEDLE_DEG[Math.min(LAST, Math.max(0, index))];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M3.77 18.75A9.5 9.5 0 1 1 20.23 18.75" />
      <g
        className="transition-transform duration-[420ms] ease-[cubic-bezier(0.34,1.45,0.64,1)] motion-reduce:transition-none"
        style={{
          transform: `rotate(calc(${deg}deg + var(--needle-lean, 0deg)))`,
          transformOrigin: "12px 14px",
          transformBox: "view-box",
        }}
      >
        <path d="M12 14V7.6" />
      </g>
      <circle cx="12" cy="14" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

type Props = {
  speed: TutorSpeedId;
  onChange: (speed: TutorSpeedId) => void;
  /** Surface styles for the round button (the dock passes its pill styles). */
  className?: string;
};

export function SpeedControl({ speed, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const index = tutorSpeedIndex(speed);
  const label = tutorSpeedLabel(speed);
  const atDefault = speed === DEFAULT_TUTOR_SPEED;

  const choose = useCallback(
    (next: TutorSpeedId) => {
      if (next === speed) return;
      onChange(next);
      setBump((n) => n + 1);
    },
    [onChange, speed],
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip disabled={open}>
        <TooltipTrigger
          render={
            <Popover.Trigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Speaking speed: ${label}`}
                  className={cn(
                    className,
                    "size-9 px-0 transition-[background-color,scale] duration-150 ease-out active:scale-[0.95] motion-reduce:active:scale-100",
                    "[@media(hover:hover)_and_(pointer:fine)]:not-aria-expanded:hover:[--needle-lean:9deg]",
                  )}
                />
              }
            />
          }
        >
          <SpeedGauge index={index} className="size-[18px]" />
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          Speaking speed
          <span className="text-background/60">{label}</span>
        </TooltipContent>
      </Tooltip>

      <Popover.Portal>
        <Popover.Positioner side="top" align="center" sideOffset={10} collisionPadding={12} className="isolate z-50">
          <Popover.Popup
            initialFocus={inputRef}
            className={cn(
              "w-[336px] max-w-[calc(100vw-24px)] origin-(--transform-origin) rounded-[16px] bg-popover px-4 pt-3 pb-2.5 text-(--lp-ink) shadow-md ring-1 ring-foreground/10 outline-none",
              // Grows out of the button: origin-aware scale through a light blur.
              "transition-[scale,opacity,filter] duration-[260ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
              "data-[starting-style]:scale-[0.86] data-[starting-style]:opacity-0 data-[starting-style]:blur-[6px]",
              "data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:blur-[2px] data-[ending-style]:duration-150 data-[ending-style]:ease-[cubic-bezier(0.23,1,0.32,1)]",
              "motion-reduce:data-[starting-style]:scale-100 motion-reduce:data-[starting-style]:blur-none motion-reduce:data-[ending-style]:scale-100 motion-reduce:data-[ending-style]:blur-none",
            )}
          >
            <div className={cn(REVEAL, "flex h-7 items-center justify-between")}>
              <Popover.Title className="text-[13.5px] font-medium tracking-[-0.005em]">Speaking speed</Popover.Title>
              <button
                type="button"
                // Reset hides itself, so hand focus back to the slider.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  choose(DEFAULT_TUTOR_SPEED);
                  inputRef.current?.focus();
                }}
                inert={atDefault}
                className={cn(
                  "-mr-1.5 rounded-[6px] px-1.5 py-0.5 text-[12px] font-medium text-(--lp-ink-2) outline-none transition-[opacity,filter,color] duration-200 ease-out hover:text-(--lp-ink) focus-visible:ring-2 focus-visible:ring-(--lp-sky)",
                  atDefault ? "pointer-events-none opacity-0 blur-[2px]" : "opacity-100 blur-none",
                )}
              >
                Reset
              </button>
            </div>

            <Slider.Root
              value={index}
              min={0}
              max={LAST}
              step={1}
              onValueChange={(value) => choose(tutorSpeedAt(value))}
              className={cn(REVEAL, "delay-[50ms]")}
            >
              <Slider.Control
                className="relative flex h-11 w-full cursor-pointer touch-none items-center select-none"
                style={{ paddingInline: THUMB_R }}
              >
                <Slider.Track className="relative h-1.5 w-full rounded-full bg-(--lp-gray-2)">
                  <Slider.Indicator className="rounded-full bg-(--lp-sky) transition-[width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[dragging]:duration-100 motion-reduce:transition-none" />
                  {TUTOR_SPEEDS.map((stop, i) => (
                    <span
                      key={stop.id}
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-200 ease-out",
                        i < index ? "bg-white/85" : "bg-(--lp-ink)/20",
                      )}
                      style={{ left: `${(i / LAST) * 100}%` }}
                    />
                  ))}
                  <Slider.Thumb
                    inputRef={inputRef}
                    getAriaLabel={() => "Speaking speed"}
                    getAriaValueText={(_, value) => TUTOR_SPEEDS[Math.round(value)]?.label ?? ""}
                    className="group/thumb size-[22px] rounded-full outline-none transition-[inset-inline-start,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[dragging]:scale-[1.12] data-[dragging]:duration-100 [@media(hover:hover)_and_(pointer:fine)]:hover:scale-[1.06] motion-reduce:transition-none"
                  >
                    <motion.span
                      key={bump}
                      initial={bump > 0 && !reduce ? { scale: 1.16 } : false}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", duration: 0.35, bounce: 0.45 }}
                      className={cn(
                        "absolute inset-0 rounded-full bg-white transition-shadow duration-200 ease-out",
                        "shadow-[0_0_0_1px_rgba(18,18,21,0.08),0_1px_2px_rgba(18,18,21,0.14),0_3px_8px_rgba(18,18,21,0.12)]",
                        "group-data-[dragging]/thumb:shadow-[0_0_0_1px_rgba(18,18,21,0.08),0_2px_4px_rgba(18,18,21,0.16),0_4px_8px_rgba(61,156,255,0.28)]",
                        "group-has-[input:focus-visible]/thumb:shadow-[0_0_0_4px_var(--lp-sky-glow),0_1px_2px_rgba(18,18,21,0.14)]",
                      )}
                    />
                  </Slider.Thumb>
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>

            {/* Stop names. The slider carries the semantics; these are pointer shortcuts. */}
            <div aria-hidden className={cn(REVEAL, "relative -mt-1 h-6 delay-[100ms]")}>
              {TUTOR_SPEEDS.map((stop, i) => {
                const first = i === 0;
                const last = i === LAST;
                return (
                  <button
                    key={stop.id}
                    type="button"
                    tabIndex={-1}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => choose(stop.id)}
                    className={cn(
                      "absolute top-0 h-6 cursor-pointer rounded-[6px] text-[12px] leading-6 font-medium whitespace-nowrap transition-colors duration-150 ease-out",
                      first && "left-0",
                      last && "right-0",
                      !first && !last && "-translate-x-1/2",
                      i === index ? "text-(--lp-ink)" : "text-(--lp-ink-2) hover:text-(--lp-ink)",
                    )}
                    style={first || last ? undefined : { left: `calc(${THUMB_R}px + (100% - ${THUMB_R * 2}px) * ${i / LAST})` }}
                  >
                    {stop.label}
                  </button>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
