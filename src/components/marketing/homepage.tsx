"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import {
  ArrowRight,
  Search,
  Bookmark,
  FolderTree,
  Layers,
  Tag as TagIcon,
  Lightbulb,
  Puzzle,
  Wand2,
  Lock,
  Sparkles,
  Check,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { Reveal } from "./scroll-reveal";
import { HeroDemo } from "./hero-demo";
import { track } from "./track";

function LinkButton({
  href,
  variant,
  size,
  className,
  onClick,
  children,
  external,
}: {
  href: string;
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  external?: boolean;
}) {
  const cls = cn(buttonVariants({ variant, size }), className);
  if (external) {
    return (
      <a href={href} className={cls} onClick={onClick} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} onClick={onClick}>
      {children}
    </Link>
  );
}

export function Homepage() {
  useEffect(() => {
    track("homepage_viewed");
  }, []);

  return (
    <div className="relative overflow-x-hidden bg-background">
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <ContextFirst />
      <SearchByIntent />
      <Stacks />
      <StackStudio />
      <ExtensionSection />
      <BuiltForDevelopers />
      <Privacy />
      <FinalCta />
      <Footer />
    </div>
  );
}

// ── Nav ──────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 shrink items-center gap-2">
          <Image
            src="/logo-mark.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-[7px]"
            priority
          />
          <span className="truncate text-[14px] font-semibold tracking-tight text-text-primary">KeepYourStack</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <Link
            href="/auth/login"
            onClick={() => track("homepage_login_clicked")}
            className="shrink-0 whitespace-nowrap rounded-[var(--radius-sm)] px-2 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary sm:px-3"
          >
            Log in
          </Link>
          <LinkButton
            href="/auth/sign-up"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => track("homepage_signup_clicked", "nav")}
          >
            <span className="sm:hidden">Sign up</span>
            <span className="hidden sm:inline">Start building your stack</span>
          </LinkButton>
        </div>
      </div>
    </header>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative border-b border-border/60 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:px-8">
      {/* Restrained technical backdrop — a faint dot grid, not a glowing blob */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(var(--border-strong) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, black 40%, transparent 100%)",
        }}
      />
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 font-mono text-[11px] text-text-secondary">
            <Sparkles size={11} className="text-accent" /> A personal toolbox for building on the internet
          </span>
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-tight text-text-primary sm:text-[46px] lg:text-[54px]">
            Your browser is messy.
            <br />
            Your stack shouldn&apos;t be.
          </h1>
          <p className="max-w-lg text-[15px] leading-relaxed text-text-secondary sm:text-[16px]">
            Keep the tools, docs, APIs, libraries, and references you actually use — organized by what they do, where
            they belong, and why you saved them.
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            <LinkButton href="/auth/sign-up" size="lg" onClick={() => track("homepage_cta_clicked", "hero-primary")}>
              Start building your stack <ArrowRight size={15} />
            </LinkButton>
            <LinkButton
              href="#how-it-works"
              size="lg"
              variant="secondary"
              onClick={() => track("homepage_cta_clicked", "hero-secondary")}
            >
              See how it works
            </LinkButton>
          </div>
        </div>

        <Reveal delay={150} className="mt-14 sm:mt-16">
          <HeroDemo />
        </Reveal>
      </div>
    </section>
  );
}

// ── Problem ──────────────────────────────────────────────────────────────

function Problem() {
  return (
    <section className="border-b border-border/60 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-text-primary sm:text-[32px]">
            Your bookmarks remember the link.
            <br />
            You forget why you saved it.
          </h2>
          <p className="mt-3 text-[14.5px] text-text-secondary">
            Bookmarks answer &ldquo;where did I save this?&rdquo; KeepYourStack answers &ldquo;what was that tool I
            needed for this?&rdquo;
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Reveal delay={80}>
            <div className="h-full rounded-[var(--radius-lg)] border border-border bg-surface p-5">
              <p className="mb-4 font-mono text-[11px] uppercase tracking-wide text-text-muted">Browser bookmarks</p>
              <div className="flex flex-col gap-2 opacity-80">
                <BookmarkRow label="New folder (12)" indent={0} folder />
                <BookmarkRow label="stuff" indent={1} folder />
                <BookmarkRow label="Untitled" indent={2} />
                <BookmarkRow label="reactjs.org" indent={2} />
                <BookmarkRow label="Untitled (2)" indent={2} />
                <BookmarkRow label="check this later" indent={1} />
                <BookmarkRow label="cool tool???" indent={1} />
                <BookmarkRow label="Bookmarks bar (247)" indent={0} folder />
              </div>
              <p className="mt-4 text-[12.5px] italic text-text-muted">&ldquo;I&apos;ll remember this later.&rdquo;</p>
            </div>
          </Reveal>

          <Reveal delay={180}>
            <div className="h-full rounded-[var(--radius-lg)] border border-accent/30 bg-surface p-5 shadow-lg shadow-accent/5">
              <p className="mb-4 font-mono text-[11px] uppercase tracking-wide text-accent">KeepYourStack</p>
              <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3.5">
                <p className="text-[13.5px] font-medium text-text-primary">Hoppscotch</p>
                <p className="font-mono text-[11px] text-text-muted">hoppscotch.io</p>
                <div className="mt-3 flex flex-col gap-2 text-[12px]">
                  <FieldRow label="Category" value="Development / API" />
                  <FieldRow label="Stack" value="Backend Stack" />
                  <FieldRow label="Useful For" value="Test APIs without installing a client" />
                  <div className="flex items-center gap-1.5">
                    <span className="w-16 shrink-0 text-text-muted">Tags</span>
                    <Tag>api</Tag>
                    <Tag>rest</Tag>
                    <Tag>graphql</Tag>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function BookmarkRow({ label, indent, folder }: { label: string; indent: number; folder?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-text-secondary" style={{ paddingLeft: indent * 16 }}>
      {folder ? <FolderTree size={12} className="shrink-0 text-text-muted" /> : <Bookmark size={11} className="shrink-0 text-text-muted" />}
      <span className="truncate">{label}</span>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="w-16 shrink-0 text-text-muted">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}

// ── How it works ─────────────────────────────────────────────────────────

const STEPS = [
  { n: "01", title: "Discover", body: "Find something useful — a doc, a tool, a library, an API." },
  { n: "02", title: "Save", body: "Save the URL in seconds, from the web app or the Chrome extension." },
  { n: "03", title: "Add Context", body: "Give it meaning: Useful For, Tags, Stack, and a note if you need one." },
  { n: "04", title: "Organize", body: "Keep everything in a structure that actually makes sense to you." },
  { n: "05", title: "Find", body: "Search by what you remember, not just what the resource was called." },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border/60 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mx-auto max-w-xl text-center">
          <h2 className="text-[26px] font-semibold tracking-tight text-text-primary sm:text-[32px]">
            Save it once. Actually find it later.
          </h2>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 90}>
              <div className="flex h-full flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-transform duration-300 hover:-translate-y-1 hover:border-border-strong">
                <span className="font-mono text-[11px] text-accent">{step.n}</span>
                <p className="text-[14px] font-semibold text-text-primary">{step.title}</p>
                <p className="text-[12.5px] leading-relaxed text-text-secondary">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Context-first ────────────────────────────────────────────────────────

const CONTEXT_FIELDS = [
  { label: "Category", value: "Development → API", icon: FolderTree },
  { label: "Stack", value: "Backend Stack", icon: Layers },
  { label: "Tags", value: "#api #rest #graphql", icon: TagIcon },
  { label: "Useful For", value: "Test APIs without installing a client", icon: Lightbulb },
  { label: "Note", value: "Use this when Postman feels like overkill.", icon: Bookmark },
];

function ContextFirst() {
  return (
    <section className="border-b border-border/60 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-text-primary sm:text-[32px]">
            A URL isn&apos;t enough.
            <br />
            Context is the useful part.
          </h2>
          <p className="mt-3 max-w-md text-[14.5px] text-text-secondary">
            Every resource you save can carry a category, a stack, tags, and a plain-language reason you saved it —
            the fields that actually exist in KeepYourStack, not a decorative mockup.
          </p>
        </Reveal>

        <Reveal delay={150}>
          <div className="rounded-[var(--radius-lg)] border border-border-strong bg-surface-2 p-5 shadow-xl">
            <div className="flex items-center gap-2.5 border-b border-border pb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-cyan/15 font-bold text-cyan">H</span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-text-primary">Hoppscotch</p>
                <p className="truncate font-mono text-[11px] text-text-muted">hoppscotch.io</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2.5">
              {CONTEXT_FIELDS.map((field, i) => (
                <Reveal key={field.label} delay={200 + i * 120}>
                  <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] bg-surface-3/60 px-2.5 py-2">
                    <field.icon size={13} className="mt-0.5 shrink-0 text-accent" />
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-wide text-text-muted">{field.label}</p>
                      <p className="truncate text-[12.5px] text-text-primary">{field.value}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Search by intent ─────────────────────────────────────────────────────

const INTENT_EXAMPLES = [
  { query: "that tool for testing APIs", result: "Hoppscotch" },
  { query: "compress images", result: "TinyPNG" },
  { query: "database GUI", result: "TablePlus" },
  { query: "convert SVG to React", result: "SVGR" },
];

function SearchByIntent() {
  return (
    <section className="border-b border-border/60 bg-surface/40 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Reveal className="mx-auto max-w-xl text-center">
          <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-text-primary sm:text-[32px]">
            You don&apos;t remember the name.
            <br />
            You remember what you needed.
          </h2>
          <p className="mt-3 text-[14.5px] text-text-secondary">
            KeepYourStack&apos;s search matches title, description, notes, tags, category, and domain together — built
            around how developers actually remember resources: by the problem they solve.
          </p>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {INTENT_EXAMPLES.map((ex, i) => (
            <Reveal key={ex.query} delay={i * 100}>
              <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
                <Search size={14} className="shrink-0 text-text-muted" />
                <span className="flex-1 truncate font-mono text-[12.5px] text-text-secondary">&ldquo;{ex.query}&rdquo;</span>
                <ArrowRight size={13} className="shrink-0 text-text-muted" />
                <span className="shrink-0 truncate text-[12.5px] font-medium text-accent">{ex.result}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Stacks ───────────────────────────────────────────────────────────────

const STACK_EXAMPLES = [
  { name: "Frontend Stack", icon: "🌐", items: ["React", "Next.js", "Tailwind", "Figma", "Browser DevTools"] },
  { name: "Backend Stack", icon: "🗄️", items: ["Supabase", "Postgres", "API tools", "Auth", "Monitoring"] },
  { name: "SaaS Stack", icon: "💳", items: ["Payments", "Analytics", "Email", "Hosting", "Automation"] },
];

function Stacks() {
  return (
    <section className="border-b border-border/60 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mx-auto max-w-xl text-center">
          <h2 className="text-[26px] font-semibold tracking-tight text-text-primary sm:text-[32px]">
            Organize by how you build.
          </h2>
          <p className="mt-3 text-[14.5px] text-text-secondary">
            Categories tell you what something is. Stacks tell you where you use it. Tags connect related ideas.
            Useful For tells you why you saved it.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STACK_EXAMPLES.map((stack, i) => (
            <Reveal key={stack.name} delay={i * 120}>
              <div className="h-full rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-transform duration-300 hover:-translate-y-1">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[18px]">{stack.icon}</span>
                  <p className="text-[14px] font-semibold text-text-primary">{stack.name}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  {stack.items.map((item) => (
                    <div key={item} className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-text-muted" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Stack Studio ─────────────────────────────────────────────────────────

function StackStudio() {
  return (
    <section className="border-b border-border/60 bg-surface/40 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 font-mono text-[10.5px] text-text-secondary">
            <Wand2 size={11} className="text-accent" /> Stack Studio
          </span>
          <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-text-primary sm:text-[32px]">
            Got a bookmark graveyard?
            <br />
            Turn it into a toolbox.
          </h2>
          <p className="mt-3 max-w-md text-[14.5px] text-text-secondary">
            Import your Chrome bookmark export, preview what&apos;s new vs. already saved, then organize everything on
            a visual board — drag between categories, bulk-move, tag, or archive. Suggestions are deterministic (folder,
            title, and domain-based rules), never AI, and never applied without you reviewing them first.
          </p>
          <ul className="mt-4 flex flex-col gap-1.5 text-[13px] text-text-secondary">
            {["Chrome bookmark import", "Duplicate detection before anything is created", "Bulk actions: move, tag, archive", "Review queue for anything uncertain"].map((line) => (
              <li key={line} className="flex items-center gap-2">
                <Check size={13} className="shrink-0 text-success" /> {line}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={150}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-3">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">Before</p>
              <div className="flex flex-col gap-1.5 opacity-70">
                {["Untitled", "stuff/tool", "reactjs.org", "check later", "New Folder (18)"].map((l) => (
                  <div key={l} className="truncate rounded-[6px] bg-surface-3 px-2 py-1 text-[11px] text-text-muted">
                    {l}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-accent/30 bg-surface p-3 shadow-lg shadow-accent/5">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-accent">After</p>
              <div className="flex flex-col gap-1.5">
                {["Frontend / React", "Backend / Database", "Design / UI", "DevOps / Deploy"].map((l) => (
                  <div key={l} className="truncate rounded-[6px] border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-primary">
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Chrome extension ─────────────────────────────────────────────────────

const EXTENSION_STEPS = ["Browsing a page", "Click KeepYourStack", "Page detected", "Category & stack suggested", "Save"];

function ExtensionSection() {
  return (
    <section className="border-b border-border/60 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <Reveal className="order-2 lg:order-1">
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-surface-2 shadow-xl">
            <div className="flex items-center gap-1.5 border-b border-border bg-surface-3 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
              <span className="ml-2 truncate font-mono text-[10.5px] text-text-muted">hoppscotch.io</span>
            </div>
            <div className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Image src="/logo-mark.png" alt="" width={20} height={20} className="h-5 w-5 rounded-[5px]" />
                <span className="text-[12.5px] font-semibold text-text-primary">KeepYourStack</span>
                <Check size={13} className="ml-auto text-success" />
              </div>
              <div className="rounded-[var(--radius-sm)] border border-border bg-surface p-2.5">
                <p className="text-[12px] font-medium text-text-primary">Hoppscotch</p>
                <p className="font-mono text-[10px] text-text-muted">hoppscotch.io</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Tag>Development / API</Tag>
                  <Tag>Backend Stack</Tag>
                </div>
              </div>
              <Button size="sm" className="mt-3 w-full" tabIndex={-1}>
                Save to KeepYourStack
              </Button>
            </div>
          </div>
        </Reveal>

        <Reveal delay={100} className="order-1 lg:order-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 font-mono text-[10.5px] text-text-secondary">
            <Puzzle size={11} className="text-accent" /> Chrome Extension
          </span>
          <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-text-primary sm:text-[32px]">
            See something useful?
            <br />
            Save it before the tab disappears.
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {EXTENSION_STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2.5 text-[13px] text-text-secondary">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[10px] text-text-muted">
                  {i + 1}
                </span>
                {step}
              </div>
            ))}
          </div>
          <LinkButton
            href="/extension"
            variant="secondary"
            className="mt-5"
            onClick={() => track("homepage_extension_clicked")}
          >
            <Puzzle size={14} /> Save from your browser
          </LinkButton>
        </Reveal>
      </div>
    </section>
  );
}

// ── Built for developers ─────────────────────────────────────────────────

const RESOURCE_TYPES = [
  { label: "Documentation", example: "developer.mozilla.org" },
  { label: "APIs", example: "hoppscotch.io" },
  { label: "Libraries", example: "npmjs.com" },
  { label: "Developer Tools", example: "github.com" },
  { label: "Databases", example: "supabase.com" },
  { label: "Design Tools", example: "figma.com" },
  { label: "Deployment", example: "vercel.com" },
  { label: "Testing", example: "playwright.dev" },
  { label: "References", example: "roadmap.sh" },
  { label: "Utilities", example: "tinypng.com" },
];

function BuiltForDevelopers() {
  return (
    <section className="border-b border-border/60 bg-surface/40 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mx-auto max-w-xl text-center">
          <h2 className="text-[26px] font-semibold tracking-tight text-text-primary sm:text-[32px]">
            A toolbox for people who live in tabs.
          </h2>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {RESOURCE_TYPES.map((type, i) => (
            <Reveal key={type.label} delay={i * 50}>
              <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3 transition-colors hover:border-border-strong">
                <p className="truncate text-[12.5px] font-medium text-text-primary">{type.label}</p>
                <p className="mt-0.5 truncate font-mono text-[10.5px] text-text-muted">{type.example}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Privacy ──────────────────────────────────────────────────────────────

function Privacy() {
  return (
    <section className="border-b border-border/60 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <Lock size={20} className="mx-auto mb-3 text-accent" />
          <h2 className="text-[26px] font-semibold tracking-tight text-text-primary sm:text-[32px]">Your stack is yours.</h2>
          <p className="mx-auto mt-3 max-w-xl text-[14.5px] text-text-secondary">
            Every resource lives in your own private, authenticated library by default. Nothing you save is visible to
            anyone else unless you explicitly make a stack public or unlisted and share the link — you can revert that
            at any time.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ── Final CTA ────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-text-primary sm:text-[38px]">
          Stop bookmarking.
          <br />
          Start building your stack.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[14.5px] text-text-secondary">
          Keep the useful things you find on the internet close, contextual, and ready when you need them.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <LinkButton href="/auth/sign-up" size="lg" onClick={() => track("homepage_cta_clicked", "final-primary")}>
            Start building your stack <ArrowRight size={15} />
          </LinkButton>
          <LinkButton href="/auth/login" size="lg" variant="secondary" onClick={() => track("homepage_login_clicked")}>
            Log in
          </LinkButton>
        </div>
      </Reveal>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border/60 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo-mark.png" alt="" width={24} height={24} className="h-6 w-6 rounded-[6px]" />
            <span className="text-[13px] font-semibold text-text-primary">KeepYourStack</span>
          </Link>
          <p className="mt-2 text-[12px] text-text-secondary">A personal toolbox for building on the internet.</p>
        </div>
        <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-[12.5px] sm:grid-cols-3">
          <FooterLink href="#how-it-works" label="How it works" />
          <FooterLink href="/extension" label="Chrome Extension" />
          <FooterLink href="/auth/login" label="Log in" />
          <FooterLink href="/auth/sign-up" label="Sign up" />
          <a
            href="https://github.com/Chintan-0/keep_your_stack"
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-text-secondary transition-colors hover:text-text-primary"
          >
            GitHub
          </a>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-[11.5px] text-text-muted">
        © {new Date().getFullYear()} KeepYourStack.
      </p>
    </footer>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-text-secondary transition-colors hover:text-text-primary">
      {label}
    </Link>
  );
}
