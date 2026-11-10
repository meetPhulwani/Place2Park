import * as React from "react";
import { ListingWizard } from "@/components/listing-wizard";
import { BankDetailsReminder } from "@/components/bank-details-card";

export default function NewListingPage() {
  React.useEffect(() => {
    document.title = "New listing · Place2Park";
  }, []);
  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-slate-900">
        Add a parking space
      </h1>
      <div className="mb-6">
        <BankDetailsReminder />
      </div>
      <ListingWizard />
    </div>
  );
}
