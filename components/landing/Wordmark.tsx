import { ChalkMark } from "@/components/app/ChalkMark";

// The logo: the plain sky scribble (no tile behind it) and the word "chalk" in
// Sora (`.lp-brand`). The mark keeps the sidebar's proportion to the text.
export function Wordmark({ size = 17, iconOnly = false, className = "" }: { size?: number; iconOnly?: boolean; className?: string }) {
  return (
    <span
      className={`lp-brand inline-flex select-none items-center gap-2 ${className}`}
      style={{ fontSize: size, color: "var(--lp-ink)" }}
    >
      <ChalkMark size={Math.round(size * 1.45)} />
      {!iconOnly && "chalk"}
    </span>
  );
}
