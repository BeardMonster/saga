import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Ellipsis, FolderKanban, House, ListChecks, Moon, Sun, Target, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { isSoundOn, playUiSound, setSoundOn } from "../lib/celebrate";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface NavLinkDef {
  to: string;
  label: string;
  end?: boolean;
}

// Phone bottom bar shows the four everyday destinations + "More" (Material 3
// bottom navigation allows 3-5). Desktop shows every link in the top bar.
const primaryLinks: (NavLinkDef & { icon: LucideIcon })[] = [
  { to: "/", label: "Home", end: true, icon: House },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/checklists", label: "Checklists", icon: ListChecks },
  { to: "/goals", label: "Goals", icon: Target },
];

const moreLinks: NavLinkDef[] = [
  { to: "/calendar", label: "Calendar" },
  { to: "/reminders", label: "Reminders" },
  { to: "/people", label: "People" },
  { to: "/finance", label: "Finance" },
  { to: "/investments", label: "Investments" },
  { to: "/recipes", label: "Recipes" },
  { to: "/grocery", label: "Grocery Deals" },
  { to: "/brain-dump", label: "Brain Dump" },
  { to: "/notes", label: "Notes" },
  { to: "/insults", label: "Insults" },
  { to: "/trash", label: "Trash" },
  { to: "/settings", label: "Settings" },
  { to: "/alerts", label: "Alerts" },
  { to: "/chat", label: "Chat" },
];

const allLinks: NavLinkDef[] = [...primaryLinks, ...moreLinks];

function useSoundToggle() {
  const [soundOn, setSoundOnState] = useState(isSoundOn);
  const toggle = () => {
    const next = !soundOn;
    setSoundOnState(next);
    setSoundOn(next);
    playUiSound(next ? "soundOn" : "soundOff");
  };
  return { soundOn, toggle };
}

export default function NavBar() {
  const { theme, toggleTheme } = useTheme();
  const { soundOn, toggle: toggleSound } = useSoundToggle();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const moreActive = moreLinks.some((l) => pathname.startsWith(l.to));

  const toggles = (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSound}
        aria-label={soundOn ? "Mute completion sounds" : "Unmute completion sounds"}
        title="Completion sounds"
      >
        {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </Button>
      <Button variant="ghost" size="icon" onClick={() => {
          toggleTheme();
          playUiSound(theme === "dark" ? "lightMode" : "darkMode");
        }}
        aria-label="Toggle dark mode">
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>
    </>
  );

  return (
    <>
      {/* Desktop: all links across the top */}
      <nav className="sticky top-0 z-10 hidden md:flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2">
        {allLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `text-sm font-medium ${
                isActive ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
        <div className="ml-auto flex items-center">{toggles}</div>
      </nav>

      {/* Phone: slim top bar */}
      <header className="sticky top-0 z-10 flex md:hidden items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-4 pr-1">
        <span className="text-lg font-semibold text-slate-800 dark:text-slate-100">Saga</span>
        <div className="flex items-center">{toggles}</div>
      </header>

      {/* Phone: bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed bottom-0 inset-x-0 z-20 flex md:hidden border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pb-[env(safe-area-inset-bottom)]"
      >
        {primaryLinks.map(({ to, label, end, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className="flex flex-1 flex-col items-center gap-1 py-2 min-h-16">
            {({ isActive }) => (
              <>
                <span className={cn("flex h-8 w-16 items-center justify-center rounded-full transition-colors", isActive && "bg-primary/20")}>
                  <Icon className={cn("h-6 w-6", isActive ? "text-indigo-700 dark:text-indigo-300" : "text-muted-foreground")} />
                </span>
                <span className={cn("text-xs", isActive ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex flex-1 flex-col items-center gap-1 py-2 min-h-16" aria-label="More pages">
              <span className={cn("flex h-8 w-16 items-center justify-center rounded-full transition-colors", moreActive && "bg-primary/20")}>
                <Ellipsis className={cn("h-6 w-6", moreActive ? "text-indigo-700 dark:text-indigo-300" : "text-muted-foreground")} />
              </span>
              <span className={cn("text-xs", moreActive ? "font-semibold text-foreground" : "text-muted-foreground")}>More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="overflow-y-auto">
            {moreLinks.map((link) => (
              <DropdownMenuItem
                key={link.to}
                onSelect={() => navigate(link.to)}
                className={pathname.startsWith(link.to) ? "bg-accent font-semibold" : undefined}
              >
                {link.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </>
  );
}
