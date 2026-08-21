import Link from "next/link";

export function TopBar({
  back,
  title,
  right,
}: {
  back?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-line px-5 py-3.5 flex items-center gap-3">
      {back && (
        <Link
          href={back}
          aria-label="Back"
          className="text-muted hover:text-foreground -ml-1 text-lg leading-none"
        >
          &#8249;
        </Link>
      )}
      <h1 className="text-[15px] font-semibold tracking-tight flex-1 truncate">
        {title}
      </h1>
      {right}
    </header>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warn" | "good" | "bad";
}) {
  const tones = {
    neutral: "bg-black/5 text-muted",
    warn: "bg-[var(--caution-bg)] text-[var(--caution)]",
    good: "bg-[var(--accent-wash)] text-accent",
    bad: "bg-[var(--warn-bg)] text-[var(--warn)]",
  };
  return (
    <span
      className={`${tones[tone]} text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap`}
    >
      {children}
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-2.5">
      {children}
    </h2>
  );
}
