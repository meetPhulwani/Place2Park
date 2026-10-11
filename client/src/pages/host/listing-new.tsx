import * as React from "react";
import { ListingWizard } from "@/components/listing-wizard";

export default function NewListingPage() {
  React.useEffect(() => {
    document.title = "New listing · Parkly";
  }, []);
  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-slate-900">
        Add a parking space
      </h1>
      <ListingWizard />
    </div>
  );
}
