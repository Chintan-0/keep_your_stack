"use client";

import dynamic from "next/dynamic";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { StoreHydrator } from "@/components/store-hydrator";

// These four are all overlays that render nothing until the user
// deliberately opens them (⌘K, "Add Resource", editing a card, "New
// Stack") — every session mounts them, but most page loads never open
// any of them. Loading their JS (Add Resource's form alone pulls in the
// category/tag pickers; the command palette pulls in the cmdk library) on
// demand instead of unconditionally keeps the initial bundle smaller
// without changing when/how they actually appear — Modal already gates
// on `open` internally, so this only defers the *module* fetch, not any
// interaction.
// Modal itself already returns null server-side (no `document`) and when
// closed, so ssr:false costs nothing and skips resolving these modules on
// the server render pass at all.
const CommandPalette = dynamic(() => import("@/components/command-palette").then((m) => m.CommandPalette), { ssr: false });
const AddResourceModal = dynamic(() => import("@/components/add-resource-modal").then((m) => m.AddResourceModal), { ssr: false });
const EditResourceModal = dynamic(() => import("@/components/edit-resource-modal").then((m) => m.EditResourceModal), { ssr: false });
const CreateStackModal = dynamic(() => import("@/components/create-stack-modal").then((m) => m.CreateStackModal), { ssr: false });

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
      <CreateStackModal />
      <KeyboardShortcuts />
    </div>
  );
}
