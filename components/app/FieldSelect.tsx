"use client";

import { Select } from "@base-ui/react/select";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

// A choice in a settings row: a quiet field that opens a menu of options,
// each with a line saying what it means (Paper "Inputs and choices").

export const FIELD =
  "h-10 rounded-[10px] border border-(--lp-gray-2) bg-white px-3 text-[14px] text-(--lp-ink) outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-(--lp-ink-3) hover:border-(--lp-ink)/20 focus:border-(--lp-sky) focus:shadow-[0_0_0_3px_var(--lp-sky-glow)]";

export function FieldSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose",
  className,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; title: string; detail?: string }[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (next !== null && next !== undefined) onChange(next as T);
      }}
    >
      <Select.Trigger
        aria-label={label}
        className={cn(
          FIELD,
          "group flex w-full cursor-pointer items-center justify-between gap-3 text-left sm:w-[240px]",
          "data-[popup-open]:border-(--lp-sky) data-[popup-open]:shadow-[0_0_0_3px_var(--lp-sky-glow)] focus-visible:border-(--lp-sky) focus-visible:shadow-[0_0_0_3px_var(--lp-sky-glow)]",
          className,
        )}
      >
        <span className={cn("min-w-0 truncate", !current && "text-(--lp-ink-3)")}>{current?.title ?? placeholder}</span>
        <Icon icon={ArrowDown01Icon} size={16} className="text-(--lp-ink-2) transition-transform duration-200 group-data-[popup-open]:rotate-180" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} alignItemWithTrigger={false} className="z-50 outline-none">
          <Select.Popup
            className={cn(
              "max-h-[min(380px,var(--available-height))] w-(--anchor-width) min-w-[240px] origin-(--transform-origin) overflow-y-auto rounded-[14px] bg-white p-1.5 ring-1 ring-[rgba(18,18,21,0.08)] outline-none",
              "shadow-[0_2px_4px_rgba(18,18,21,0.06),0_8px_24px_rgba(18,18,21,0.10)]",
              "transition-[scale,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 motion-reduce:data-[starting-style]:scale-100",
            )}
          >
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="flex cursor-pointer items-start gap-2 rounded-[9px] py-2 pr-3 pl-2 outline-none select-none data-[highlighted]:bg-(--lp-gray)"
              >
                <span className="mt-[2px] flex size-4 shrink-0 items-center justify-center">
                  <Select.ItemIndicator>
                    <Icon icon={Tick02Icon} size={16} strokeWidth={2.25} className="text-(--lp-sky-deep)" />
                  </Select.ItemIndicator>
                </span>
                <span className="flex min-w-0 flex-col">
                  <Select.ItemText className="text-[14px] font-medium text-(--lp-ink)">{option.title}</Select.ItemText>
                  {option.detail && <span className="mt-0.5 text-[12.5px] leading-[1.35] text-(--lp-ink-2)">{option.detail}</span>}
                </span>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
