import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterFaqs, type FaqItem } from "./faq-search.js";

const rows: FaqItem[] = [
  { id: "1", key: "refunds", category: "PAYMENTS", question: "How do refunds work?", answer: "Cancel more than 60 minutes before the start.", featured: true },
  { id: "2", key: "find", category: "DRIVERS", question: "How do I find a parking space?", answer: "Search within 12 km.", active: true },
  { id: "3", key: "old", category: "DRIVERS", question: "Retired question", answer: "Hidden answer", active: false },
];

describe("faq search", () => {
  it("matches questions and answers and hides inactive rows", () => {
    assert.deepEqual(filterFaqs(rows, "60 minutes", "").map((row) => row.key), ["refunds"]);
    assert.deepEqual(filterFaqs(rows, "parking space", "DRIVERS").map((row) => row.key), ["find"]);
    assert.equal(filterFaqs(rows, "retired", "").length, 0);
  });

  it("filters by category", () => {
    assert.equal(filterFaqs(rows, "", "PAYMENTS").length, 1);
    assert.equal(filterFaqs(rows, "", "HOSTS").length, 0);
  });
});
