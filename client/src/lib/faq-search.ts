export interface FaqItem {
  id: string;
  key: string;
  category: string;
  question: string;
  answer: string;
  featured?: boolean;
  related?: string[];
  active?: boolean;
}

export const FAQ_CATEGORY_LABELS: [string, string][] = [
  ["GETTING_STARTED", "Getting Started"],
  ["DRIVERS", "Driver FAQs"],
  ["HOSTS", "Host FAQs"],
  ["BOOKINGS", "Bookings & Cancellations"],
  ["PAYMENTS", "Payments & Refunds"],
  ["PAYOUTS", "Host Payouts"],
  ["ACCOUNT", "Account & Security"],
  ["TECHNICAL", "Technical Issues"],
];

export function filterFaqs(rows: FaqItem[], query: string, category: string) {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (row.active === false) return false;
    if (category && row.category !== category) return false;
    if (!q) return true;
    return row.question.toLowerCase().includes(q) || row.answer.toLowerCase().includes(q);
  });
}
