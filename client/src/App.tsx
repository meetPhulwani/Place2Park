import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { ScrollToTop } from "@/components/scroll-to-top";
import { AuthLayout } from "@/layouts/auth-layout";
import { AccountLayout } from "@/layouts/account-layout";
import { HostLayout } from "@/layouts/host-layout";
import { AdminLayout } from "@/layouts/admin-layout";

import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/auth/login";
import SignupPage from "@/pages/auth/signup";
import ForgotPasswordPage from "@/pages/auth/forgot-password";
import ResetPasswordPage from "@/pages/auth/reset-password";
import SearchPage from "@/pages/search";
import ParkingDetailPage from "@/pages/parking-detail";
import BecomeAHostPage from "@/pages/become-a-host";
import SupportPage from "@/pages/support";
import NotFoundPage from "@/pages/not-found";

import DashboardPage from "@/pages/account/dashboard";
import BookingsPage from "@/pages/account/bookings";
import BookingDetailPage from "@/pages/account/booking-detail";
import HistoryPage from "@/pages/account/history";
import SavedPage from "@/pages/account/saved";
import PaymentsPage from "@/pages/account/payments";
import ProfilePage from "@/pages/account/profile";

import HostOverviewPage from "@/pages/host/overview";
import HostListingsPage from "@/pages/host/listings";
import HostNewListingPage from "@/pages/host/listing-new";
import HostEditListingPage from "@/pages/host/listing-edit";
import HostCalendarPage from "@/pages/host/calendar";
import HostBookingsPage from "@/pages/host/bookings";
import HostEarningsPage from "@/pages/host/earnings";
import HostReviewsPage from "@/pages/host/reviews";
import HostSettingsPage from "@/pages/host/settings";

import AdminDashboardPage from "@/pages/admin/dashboard";
import AdminUsersPage from "@/pages/admin/users";
import AdminListingsPage from "@/pages/admin/listings";
import AdminBookingsPage from "@/pages/admin/bookings";
import AdminPaymentsPage from "@/pages/admin/payments";
import AdminReportsPage from "@/pages/admin/reports";
import AdminReviewsPage from "@/pages/admin/reviews";
import AdminPayoutsPage from "@/pages/admin/payouts";

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/parking/:id" element={<ParkingDetailPage />} />
        <Route path="/become-a-host" element={<BecomeAHostPage />} />
        <Route path="/support" element={<SupportPage />} />

        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route element={<AccountLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route element={<HostLayout />}>
          <Route path="/host" element={<HostOverviewPage />} />
          <Route path="/host/listings" element={<HostListingsPage />} />
          <Route path="/host/listings/new" element={<HostNewListingPage />} />
          <Route path="/host/listings/:id/edit" element={<HostEditListingPage />} />
          <Route path="/host/calendar" element={<HostCalendarPage />} />
          <Route path="/host/bookings" element={<HostBookingsPage />} />
          <Route path="/host/earnings" element={<HostEarningsPage />} />
          <Route path="/host/reviews" element={<HostReviewsPage />} />
          <Route path="/host/settings" element={<HostSettingsPage />} />
        </Route>

        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/listings" element={<AdminListingsPage />} />
          <Route path="/admin/bookings" element={<AdminBookingsPage />} />
          <Route path="/admin/payments" element={<AdminPaymentsPage />} />
          <Route path="/admin/payouts" element={<AdminPayoutsPage />} />
          <Route path="/admin/reports" element={<AdminReportsPage />} />
          <Route path="/admin/reviews" element={<AdminReviewsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}
