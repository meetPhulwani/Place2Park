import Link from "@/components/link";
import { SearchX } from "lucide-react";
import { Logo } from "@/components/brand";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <div className="glass mt-10 flex size-14 items-center justify-center rounded-2xl">
        <SearchX className="size-7 text-slate-400" aria-hidden />
      </div>
      <h1 className="mt-5 font-display text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        This page doesn&apos;t exist or may have been removed — like a parking spot that just got
        taken.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
        >
          Go home
        </Link>
        <Link
          href="/search"
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Find parking
        </Link>
      </div>
    </div>
  );
}
