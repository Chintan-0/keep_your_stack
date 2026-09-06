"use client";

import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { AddResourceModal } from "@/components/add-resource-modal";
import { EditResourceModal } from "@/components/edit-resource-modal";
import { CreateStackModal } from "@/components/create-stack-modal";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar />
      <main className="pl-0 pt-14 md:pl-60">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>

      <CommandPalette />
      <AddResourceModal />
      <EditResourceModal />
      <CreateStackModal />
      <KeyboardShortcuts />
    </div>
  );
}
