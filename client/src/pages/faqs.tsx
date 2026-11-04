import { useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { FaqBrowser } from "@/pages/help/faq-browser";

export default function PublicFaqsPage() {
  const [params] = useSearchParams();
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <FaqBrowser initialCategory={params.get("category") ?? ""} />
      </main>
      <Footer />
    </>
  );
}
