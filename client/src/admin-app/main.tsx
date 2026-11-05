import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import "../globals.css";
import { ConsoleShell } from "./shell";
import { ConsoleSignIn } from "./sign-in";
import { consoleApi } from "@/services/console-api";
import AdminDashboardPage from "@/pages/admin/dashboard";
import AdminUsersPage from "@/pages/admin/users";
import AdminListingsPage from "@/pages/admin/listings";
import AdminBookingsPage from "@/pages/admin/bookings";
import AdminPaymentsPage from "@/pages/admin/payments";
import AdminReportsPage from "@/pages/admin/reports";
import AdminReviewsPage from "@/pages/admin/reviews";
import AdminPayoutsPage from "@/pages/admin/payouts";
import AdminSupportPage from "@/pages/admin/support-desk";
import AdminSupportCasePage from "@/pages/admin/support-case";
import AdminFaqsPage from "@/pages/admin/faqs";
import { StaffPage } from "./staff";
import { AuditsPage } from "./audits";
import { SecurityPage } from "./security";
import { SettingsPage } from "./settings";

function RequireSession({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState<"loading" | "in" | "out">("loading");
  React.useEffect(() => {
    consoleApi.get("/auth/session").then(() => setReady("in")).catch(() => setReady("out"));
  }, []);
  if (ready === "loading") return null;
  if (ready === "out") return <Navigate to="/sign-in" replace />;
  return children;
}

const base = document.querySelector('meta[name="console-base"]')?.getAttribute("content") || "/";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={base}>
      <Routes>
        <Route path="/sign-in" element={<ConsoleSignIn />} />
        <Route element={<RequireSession><ConsoleShell /></RequireSession>}>
          <Route path="/" element={<AdminDashboardPage />} />
          <Route path="/users" element={<AdminUsersPage />} />
          <Route path="/listings" element={<AdminListingsPage />} />
          <Route path="/bookings" element={<AdminBookingsPage />} />
          <Route path="/payments" element={<AdminPaymentsPage />} />
          <Route path="/payouts" element={<AdminPayoutsPage />} />
          <Route path="/reports" element={<AdminReportsPage />} />
          <Route path="/support" element={<AdminSupportPage />} />
          <Route path="/faqs" element={<AdminFaqsPage />} />
          <Route path="/support/:kind/:id" element={<AdminSupportCasePage />} />
          <Route path="/reviews" element={<AdminReviewsPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/audits" element={<AuditsPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>
);
