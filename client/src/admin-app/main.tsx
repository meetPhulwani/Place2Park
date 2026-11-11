import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { lazyRoute } from "@/lib/route-page";
import "../globals.css";
import { ConsoleShell } from "./shell";
import { ConsoleSignIn } from "./sign-in";
import { consoleApi } from "@/services/console-api";

const AdminDashboardPage = lazyRoute(() => import("@/pages/admin/dashboard"));
const AdminUsersPage = lazyRoute(() => import("@/pages/admin/users"));
const AdminListingsPage = lazyRoute(() => import("@/pages/admin/listings"));
const AdminBookingsPage = lazyRoute(() => import("@/pages/admin/bookings"));
const AdminPaymentsPage = lazyRoute(() => import("@/pages/admin/payments"));
const AdminReportsPage = lazyRoute(() => import("@/pages/admin/reports"));
const AdminReviewsPage = lazyRoute(() => import("@/pages/admin/reviews"));
const AdminPayoutsPage = lazyRoute(() => import("@/pages/admin/payouts"));
const AdminSupportPage = lazyRoute(() => import("@/pages/admin/support-desk"));
const AdminSupportCasePage = lazyRoute(() => import("@/pages/admin/support-case"));
const AdminFaqsPage = lazyRoute(() => import("@/pages/admin/faqs"));
const StaffPage = lazyRoute(() => import("./staff").then((mod) => ({ default: mod.StaffPage })));
const AuditsPage = lazyRoute(() => import("./audits").then((mod) => ({ default: mod.AuditsPage })));
const SettingsPage = lazyRoute(() => import("./settings").then((mod) => ({ default: mod.SettingsPage })));

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
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>
);
