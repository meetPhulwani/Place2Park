import { useEffect, useState } from "react";
import { Navigate, Routes, Route, useSearchParams } from "react-router-dom";
import { api } from "@/services/api";
import { AnalyticsListener } from "@/components/analytics-listener";
import { Toaster } from "@/components/ui/toaster";
import { ScrollToTop } from "@/components/scroll-to-top";
import { Navbar } from "@/components/navbar";
import { AuthLayout } from "@/layouts/auth-layout";
import { AccountLayout } from "@/layouts/account-layout";
import { HostLayout } from "@/layouts/host-layout";
import { lazyRoute, RouteFallback } from "@/lib/route-page";
import LandingPage from "@/pages/landing";
import NotFoundPage from "@/pages/not-found";

function PublicFallback() {
  return (
    <>
      <Navbar />
      <RouteFallback />
    </>
  );
}

const LoginPage = lazyRoute(() => import("@/pages/auth/login"));
const SignupRolePage = lazyRoute(() => import("@/pages/auth/signup-role"));
const SignupPage = lazyRoute(() => import("@/pages/auth/signup"));
const VerifyEmailPage = lazyRoute(() => import("@/pages/auth/verify-email"));
const ForgotPasswordPage = lazyRoute(() => import("@/pages/auth/forgot-password"));
const ResetPasswordPage = lazyRoute(() => import("@/pages/auth/reset-password"));
const SearchPage = lazyRoute(() => import("@/pages/search"), PublicFallback);
const SearchResultsPage = lazyRoute(() => import("@/pages/search-results"), PublicFallback);
const ParkingDetailPage = lazyRoute(() => import("@/pages/parking-detail"), PublicFallback);
const BecomeAHostPage = lazyRoute(() => import("@/pages/become-a-host"), PublicFallback);
const SupportPage = lazyRoute(() => import("@/pages/support"), PublicFallback);
const PrivacyPage = lazyRoute(() => import("@/pages/privacy"), PublicFallback);
const TermsPage = lazyRoute(() => import("@/pages/terms"), PublicFallback);
const PublicFaqsPage = lazyRoute(() => import("@/pages/faqs"), PublicFallback);

function HistoryRedirect() {
  const [params] = useSearchParams();
  const search = params.toString();
  return <Navigate to={search ? `/bookings?${search}#history` : "/bookings#history"} replace />;
}
const BookingsPage = lazyRoute(() => import("@/pages/account/bookings"));
const BookingDetailPage = lazyRoute(() => import("@/pages/account/booking-detail"));
const SavedPage = lazyRoute(() => import("@/pages/account/saved"));
const PaymentsPage = lazyRoute(() => import("@/pages/account/payments"));
const ProfilePage = lazyRoute(() => import("@/pages/account/profile"));
const AccountSettingsPage = lazyRoute(() => import("@/pages/account/settings"));
const HelpCenterPage = lazyRoute(() => import("@/pages/help/center"));
const ReportUserPage = lazyRoute(() => import("@/pages/help/report-form"));
const ContactSupportPage = lazyRoute(() => import("@/pages/help/ticket-form"));
const MyTicketsPage = lazyRoute(() => import("@/pages/help/tickets"));
const TicketDetailPage = lazyRoute(() => import("@/pages/help/ticket-detail"));
const HelpFaqsPage = lazyRoute(() => import("@/pages/help/faqs"));
const HostOverviewPage = lazyRoute(() => import("@/pages/host/overview"));
const HostListingsPage = lazyRoute(() => import("@/pages/host/listings"));
const HostNewListingPage = lazyRoute(() => import("@/pages/host/listing-new"));
const HostEditListingPage = lazyRoute(() => import("@/pages/host/listing-edit"));
const HostCalendarPage = lazyRoute(() => import("@/pages/host/calendar"));
const HostBookingsPage = lazyRoute(() => import("@/pages/host/bookings"));
const HostEarningsPage = lazyRoute(() => import("@/pages/host/earnings"));
const HostPayoutSettingsPage = lazyRoute(() => import("@/pages/host/payout-settings"));
const HostReviewsPage = lazyRoute(() => import("@/pages/host/reviews"));
const HostSettingsPage = lazyRoute(() => import("@/pages/host/settings"));

function PublicNotice() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    api.get("/platform/notice").then(({ data }) => setMessage(String(data.data?.message ?? ""))).catch(() => setMessage(""));
  }, []);
  if (!message) return null;
  return <div role="status" className="bg-[#0251B0] px-4 py-2 text-center text-sm text-white">{message}</div>;
}

export default function App() {
  return (
    <>
      <PublicNotice />
      <AnalyticsListener />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/search/results" element={<SearchResultsPage />} />
        <Route path="/parking/:id" element={<ParkingDetailPage />} />
        <Route path="/become-a-host" element={<BecomeAHostPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/faqs" element={<PublicFaqsPage />} />

        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupRolePage />} />
          <Route path="/signup/account" element={<SignupPage />} />
          <Route path="/signup/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route element={<AccountLayout />}>
          <Route path="/dashboard" element={<Navigate to="/bookings" replace />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />
          <Route path="/history" element={<HistoryRedirect />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<AccountSettingsPage />} />
          <Route path="/help" element={<HelpCenterPage />} />
          <Route path="/help/faqs" element={<HelpFaqsPage />} />
          <Route path="/help/report" element={<ReportUserPage />} />
          <Route path="/help/contact" element={<ContactSupportPage />} />
          <Route path="/help/tickets" element={<MyTicketsPage />} />
          <Route path="/help/tickets/:kind/:id" element={<TicketDetailPage />} />
        </Route>

        <Route element={<HostLayout />}>
          <Route path="/host" element={<HostOverviewPage />} />
          <Route path="/host/listings" element={<HostListingsPage />} />
          <Route path="/host/listings/new" element={<HostNewListingPage />} />
          <Route path="/host/listings/:id/edit" element={<HostEditListingPage />} />
          <Route path="/host/calendar" element={<HostCalendarPage />} />
          <Route path="/host/bookings" element={<HostBookingsPage />} />
          <Route path="/host/earnings" element={<HostEarningsPage />} />
          <Route path="/host/payout-settings" element={<HostPayoutSettingsPage />} />
          <Route path="/host/reviews" element={<HostReviewsPage />} />
          <Route path="/host/settings" element={<HostSettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}
