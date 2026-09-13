export function Wordmark({ size = 17, iconOnly = false, className = "" }: { size?: number; iconOnly?: boolean; className?: string }) {
  return (
    <span
      className={`lp-display inline-flex select-none items-center gap-2 ${className}`}
      style={{ fontSize: size, letterSpacing: "-0.02em", color: "var(--lp-ink)" }}
    >
      <svg width={size + 5} height={size + 5} viewBox="0 0 22 22" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="6" fill="var(--lp-ink)" />
        <path
          d="M6 13.5c2.2-4.6 4.2-6.9 5.4-6.4 1.3.5-1.8 6.4-.6 6.9 1 .4 2.6-1.6 4.6-3.4"
          fill="none"
          stroke="var(--lp-sky)"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
      {!iconOnly && "chalk"}
    </span>
  );
}
