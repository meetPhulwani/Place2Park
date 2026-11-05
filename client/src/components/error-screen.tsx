import { useEffect } from "react";
import Link from "@/components/link";
import { errorCopy } from "@/lib/http-error";

/** Full-screen HTTP error. One action, no server details. */
export function ErrorScreen({ status }: { status: number }) {
  const copy = errorCopy(status);

  useEffect(() => {
    document.title = `${copy.code} · Place2Park`;
  }, [copy.code]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#F3F5F7] px-6 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-0 h-64 w-64 rounded-full bg-[#D1FF42]/35 blur-3xl" />
        <div className="absolute bottom-0 left-0 right-0 h-36 opacity-70">
          <div className="absolute inset-x-0 top-8 h-px bg-[#C7D1DD]" />
          <div className="absolute inset-x-[12%] top-16 h-1.5 rounded-full bg-[#0251B0]/10" />
          <div className="absolute left-1/2 top-16 h-1.5 w-16 -translate-x-1/2 rounded-full bg-[#D1FF42]" />
          <div className="absolute inset-x-0 bottom-8 h-px bg-[#C7D1DD]" />
        </div>
      </div>
      <div className="relative max-w-lg animate-slide-up">
        <p className="font-display text-[5.5rem] font-bold leading-none tracking-tight text-[#0251B0] sm:text-[7.5rem]">
          {copy.code}
        </p>
        <div className="mx-auto mt-5 h-1.5 w-14 rounded-full bg-[#D1FF42]" />
        <h1 className="mt-6 font-display text-xl font-bold tracking-[0.18em] text-[#111827] sm:text-2xl">
          {copy.label}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#64748b]">{copy.description}</p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-[#0251B0] px-6 py-3 text-sm font-semibold text-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:bg-[#01408c]"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
