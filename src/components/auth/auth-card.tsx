import Image from "next/image";
import Link from "next/link";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Image src="/logo-mark.png" alt="" width={36} height={36} className="h-9 w-9 rounded-[9px]" priority />
          <span className="text-[16px] font-semibold tracking-tight text-text-primary">KeepYourStack</span>
        </Link>

        <div className="rounded-[var(--radius-lg)] border border-border-strong bg-surface-2 p-6 shadow-2xl">
          <div className="mb-5 flex flex-col gap-1">
            <h1 className="text-[17px] font-semibold text-text-primary">{title}</h1>
            <p className="text-[13px] text-text-secondary">{subtitle}</p>
          </div>
          {children}
        </div>

        {footer && <div className="mt-4 text-center text-[13px] text-text-secondary">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-text-secondary">{label}</span>
      <input
        {...props}
        className="h-10 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-3 text-[13.5px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
      />
    </label>
  );
}
