import { useSearchParams } from "react-router-dom";
import { FaqBrowser } from "./faq-browser";

export default function HelpFaqsPage() {
  const [params] = useSearchParams();
  return (
    <div className="mx-auto max-w-3xl">
      <FaqBrowser initialCategory={params.get("category") ?? ""} />
    </div>
  );
}
