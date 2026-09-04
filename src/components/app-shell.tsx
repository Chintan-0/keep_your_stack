"use client";

import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { AddResourceModal } from "@/components/add-resource-modal";
import { EditResourceModal } from "@/components/edit-resource-modal";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { StoreHydrator } from "@/components/store-hydrator";

export function AppShell({
  children,
  userEmail,
  userName,
}: {
  children: React.ReactNode;
  userEmail: string;
  userName: string;
}) {
  return (
    <div className="min-h-screen bg-background">
      <StoreHydrator />
      <TopBar userEmail={userEmail} userName={userName} />
      <Sidebar />
      <main className="pl-0 pt-14 md:pl-60">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>

      <CommandPalette />
      <AddResourceModal />
      <EditResourceModal />
      <KeyboardShortcuts />
    </div>
  );
}
