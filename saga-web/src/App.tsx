import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./core/queryClient";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import NavBar from "./shared/components/NavBar";
import AlertBanner from "./shared/components/AlertBanner";
import Dashboard from "./features/dashboard/Dashboard";
import ProjectsPage from "./features/projects/ProjectsPage";
import ChecklistsPage from "./features/checklists/ChecklistsPage";
import GoalsPage from "./features/goals/GoalsPage";
import CalendarPage from "./features/calendar/CalendarPage";
import RemindersPage from "./features/reminders/RemindersPage";
import PeoplePage from "./features/people/PeoplePage";
import PersonPage from "./features/people/PersonPage";
import FinancePage from "./features/finance/FinancePage";
import InvestmentsPage from "./features/investments/InvestmentsPage";
import RecipesPage from "./features/recipes/RecipesPage";
import GroceryPage from "./features/grocery/GroceryPage";
import InboxPage from "./features/inbox/InboxPage";
import InsultsPage from "./features/insults/InsultsPage";
import TargetTypeInstructionsPage from "./features/inbox/TargetTypeInstructionsPage";
import NotesPage from "./features/notes/NotesPage";
import TrashPage from "./features/trash/TrashPage";
import SettingsPage from "./features/settings/SettingsPage";
import AlertsPage from "./features/alerts/AlertsPage";
import ChatPage from "./features/chat/ChatPage";
import { Toaster } from "@/components/ui/sonner";
import { useEffect } from "react";
import { playUiSound } from "./shared/lib/celebrate";

// Sounds for taps that don't touch the server (Edit, Cancel, Close). Saves
// are covered by the API response rule in core/api/client.ts.
function useTapSounds() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("button, [role='menuitem']");
      if (!el || (el as HTMLButtonElement).disabled) return;
      const label = `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`.trim();
      if (/^(cancel|close|back|not now|never mind)\b/i.test(label)) playUiSound("cancel");
      else if (/^(edit|rename)\b/i.test(label)) playUiSound("edit");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

export default function App() {
  useTapSounds();
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 md:pb-0">
          <AlertBanner />
          <Toaster />
          <NavBar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/checklists" element={<ChecklistsPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/reminders" element={<RemindersPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/people/:id" element={<PersonPage />} />
            <Route path="/finance" element={<FinancePage />} />
            <Route path="/investments" element={<InvestmentsPage />} />
            <Route path="/recipes" element={<RecipesPage />} />
            <Route path="/grocery" element={<GroceryPage />} />
            <Route path="/brain-dump" element={<InboxPage />} />
            <Route path="/inbox" element={<Navigate to="/brain-dump" replace />} />
            <Route path="/insults" element={<InsultsPage />} />
            <Route path="/brain-dump/instructions" element={<TargetTypeInstructionsPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/trash" element={<TrashPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/chat" element={<ChatPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
