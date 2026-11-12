export const accountNavItems = [
  { href: "/bookings", label: "My bookings", icon: "CalendarClock" },
  { href: "/saved", label: "Saved", icon: "Heart" },
  { href: "/payments", label: "Payments", icon: "CreditCard" },
  { href: "/profile", label: "Profile", icon: "User" },
  { href: "/settings", label: "Settings", icon: "Settings", exact: true },
  { href: "/help", label: "Help Center", icon: "CircleHelp" },
] as const;
