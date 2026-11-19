import { useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { PageMeta } from "@/components/page-meta";
import { Footer } from "@/components/footer";
import { FaqBrowser } from "@/pages/help/faq-browser";

export default function PublicFaqsPage() {
  const [params] = useSearchParams();
  return (
    <>
      <PageMeta
        title="FAQs · Place2Park"
        description="Answers about booking private parking, payments, refunds, and how Place2Park works."
        path="/faqs"
      />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <FaqBrowser documentTitle="FAQs · Place2Park" initialCategory={params.get("category") ?? ""} />
      </main>
      <Footer />
    </>
  );
}
