export const accountNavItems = [
  { href: "/dashboard", label: "Overview", icon: "LayoutDashboard", exact: true },
  { href: "/bookings", label: "Upcoming", icon: "CalendarClock" },
  { href: "/history", label: "History", icon: "History" },
  { href: "/saved", label: "Saved", icon: "Heart" },
  { href: "/payments", label: "Payments", icon: "CreditCard" },
  { href: "/profile", label: "Profile", icon: "User" },
  { href: "/settings", label: "Settings", icon: "Settings", exact: true },
  { href: "/help", label: "Help Center", icon: "CircleHelp" },
] as const;
