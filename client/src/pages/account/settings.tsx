import * as React from "react";
import { AccountManagement } from "@/components/account-management";

export default function AccountSettingsPage() {
  React.useEffect(() => {
    document.title = "Settings · Place2Park";
  }, []);

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Settings</h1>
      <p className="mt-1 text-sm text-muted">Manage your password and account.</p>
      <div className="mt-6">
        <AccountManagement />
      </div>
    </div>
  );
}
