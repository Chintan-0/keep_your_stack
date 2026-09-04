"use client";

import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { AddResourceModal } from "@/components/add-resource-modal";
import { EditResourceModal } from "@/components/edit-resource-modal";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <ThemeProvider />
      <TopBar />
      <Sidebar />
      <main className="pl-0 pt-14 md:pl-60">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>

      <CommandPalette />
      <AddResourceModal />
      <EditResourceModal />
      <KeyboardShortcuts />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-primary)",
            fontSize: "13px",
          },
        }}
      />
    </div>
  );
}
