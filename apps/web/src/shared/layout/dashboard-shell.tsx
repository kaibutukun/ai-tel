"use client";

import { Sidebar } from "@/shared/layout/sidebar";
import { SidebarProvider } from "@/shared/layout/sidebar-context";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex min-h-screen w-full flex-1 flex-col overflow-auto lg:ml-60">
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}
