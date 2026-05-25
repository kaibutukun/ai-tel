"use client";

import { Bell, ChevronDown, Menu } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useSidebar } from "@/shared/layout/sidebar-context";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { setOpen } = useSidebar();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 lg:hidden"
          onClick={() => setOpen(true)}
          aria-label="メニューを開く"
        >
          <Menu className="h-5 w-5 text-gray-600" />
        </Button>
        <h1 className="truncate text-lg font-semibold text-gray-900 sm:text-xl">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5 text-gray-500" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
        </Button>
        <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100 sm:px-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
            田
          </div>
          <span className="hidden text-sm font-medium text-gray-700 sm:inline">株式会社サンプル</span>
          <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
        </button>
      </div>
    </header>
  );
}
