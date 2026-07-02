import { type ReactNode, useState } from "react";
import { categories } from "@/data/tools";
import { cn } from "@/lib/utils/cn";
import ThemeToggle from "./ThemeToggle";
import { LockIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useUIStore } from "@/stores/uiStore";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function NavContent({ currentPath }: { currentPath: string }) {
  const { state } = useSidebar();
  const setCommandOpen = useUIStore((s) => s.setCommandOpen);
  const activeCatId = categories.find((c) => currentPath.startsWith(c.href))?.id ?? null;
  const [openCat, setOpenCat] = useState<string | null>(activeCatId);

  return (
    <>
      {/* Search */}
      <SidebarGroup>
        <button
          onClick={() => setCommandOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md border border-sidebar-border text-muted-foreground text-xs hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:hidden"
        >
          <MagnifyingGlassIcon className="size-3.5 shrink-0" />
          <span className="flex-1 text-left">Search tools…</span>
          <kbd className="font-mono text-[10px] border border-sidebar-border rounded px-1 py-0.5">⌘K</kbd>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCommandOpen(true)}
              className="hidden group-data-[collapsible=icon]:flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors mx-auto"
            >
              <MagnifyingGlassIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Search tools (⌘K)</TooltipContent>
        </Tooltip>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarMenu>
          {categories.map((cat) => {
            const CatIcon = cat.icon;
            const isOpen = openCat === cat.id;
            const isCatActive = currentPath.startsWith(cat.href);

            return (
              <SidebarMenuItem key={cat.id}>
                <SidebarMenuButton
                  render={state === "collapsed" ? <a href={cat.href} /> : undefined}
                  onClick={state === "collapsed" ? undefined : () => setOpenCat(isOpen ? null : cat.id)}
                  isActive={isCatActive}
                  tooltip={cat.title.replace(" Tools", "")}
                >
                  <CatIcon size={16} />
                  <span>{cat.title.replace(" Tools", "")}</span>
                  <svg
                    className={cn("ml-auto size-3 transition-transform duration-150 group-data-[collapsible=icon]:hidden", isOpen && "rotate-180")}
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M2 4l4 4 4-4" />
                  </svg>
                </SidebarMenuButton>

                {isOpen && (
                  <SidebarMenuSub>
                    {cat.tools.map((tool) => (
                      <SidebarMenuSubItem key={tool.href}>
                        <SidebarMenuSubButton
                          render={<a href={tool.href} />}
                          isActive={currentPath === tool.href}
                        >
                          {tool.name}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}

export default function AppLayout({ children }: { children?: ReactNode }) {
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  const [defaultOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const match = document.cookie.match(/sidebar_state=([^;]+)/);
    if (match) return match[1] === "true";
    return localStorage.getItem("sidebar-collapsed") !== "1";
  });

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="p-2">
          <a
            href="/"
            className="flex items-center gap-2.5 h-9 px-2 rounded-md hover:bg-sidebar-accent transition-colors"
          >
            <img src="/icon.svg" alt="LocalKit" className="size-5 rounded-sm shrink-0" />
            <span className="font-mono font-semibold text-sm text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              LocalKit
            </span>
          </a>
        </SidebarHeader>

        <SidebarContent className="gap-0 overflow-x-hidden">
          <NavContent currentPath={currentPath} />
        </SidebarContent>

        <SidebarFooter className="p-2">
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-0.5">
            <span className="flex items-center gap-1 text-[10px] text-brand-500 font-mono tracking-wide mr-auto group-data-[collapsible=icon]:hidden">
              <LockIcon className="size-2.5" />
              LOCAL
            </span>
            <SidebarTrigger className="size-7" />
            <ThemeToggle />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-40 h-12 flex items-center justify-between px-4 bg-background/90 backdrop-blur-md border-b border-border shrink-0">
          <a href="/" className="flex items-center gap-2 font-mono font-semibold text-sm text-foreground">
            <img src="/icon.svg" alt="LocalKit" className="size-5 rounded-sm" />
            LocalKit
          </a>
          <SidebarTrigger />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
