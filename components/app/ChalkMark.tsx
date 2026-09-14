// The mark on its own: the chalk stroke, no tile behind it. Sized by height.
export function ChalkMark({ size = 22, color = "var(--lp-sky)", className = "" }: { size?: number; color?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden className={className}>
      <path
        d="M3 15.5c3.2-6.8 6.2-10.2 8-9.5 1.9.8-2.7 9.5-.9 10.2 1.5.6 3.9-2.4 6.9-5.1"
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
