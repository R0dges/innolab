"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Search } from "lucide-react";

import { Button } from "@juryza/ui/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@juryza/ui/components/ui/command";
import { Kbd } from "@juryza/ui/components/ui/kbd";

import { useI18n } from "@/components/locale-provider";
import type { Viewer } from "@/components/viewer";
import { api } from "@/lib/api";

import { extraCommands, mainNav } from "./nav";

interface EventRow {
  id: string;
  slug: string;
  name: string;
  createdBy: string | null;
}

/** ⌘K / Ctrl+K: jump to any page or event. */
export function CommandMenu({ viewer }: { viewer: Viewer }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<{ events: EventRow[] }>("/api/events"),
    enabled: open,
  });

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground hidden w-64 justify-start gap-2 font-normal md:flex"
        onClick={() => setOpen(true)}
      >
        <Search />
        Search or jump to…
        <Kbd className="ml-auto">⌘K</Kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Search"
        onClick={() => setOpen(true)}
      >
        <Search />
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command menu"
        description="Jump to a page or event"
      >
        <Command>
          <CommandInput placeholder="Type a page or event name…" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {mainNav(viewer, t).map((g) => (
              <CommandGroup key={g.label} heading={g.label}>
                {g.items.map((i) => (
                  <CommandItem
                    key={i.href}
                    value={`${g.label} ${i.label}`}
                    onSelect={() => go(i.href)}
                  >
                    <i.icon /> {i.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandSeparator />
            {data?.events.length ? (
              <CommandGroup heading="Events">
                {data.events.map((e) => (
                  <CommandItem
                    key={e.id}
                    value={`event ${e.name} ${e.slug}`}
                    onSelect={() =>
                      go(
                        e.createdBy === viewer.userId || viewer.role === "admin"
                          ? `/manage/${e.slug}`
                          : `/e/${e.slug}`
                      )
                    }
                  >
                    <CalendarDays /> {e.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading="More">
              {extraCommands(t).map((i) => (
                <CommandItem key={i.href} value={i.label} onSelect={() => go(i.href)}>
                  <i.icon /> {i.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
