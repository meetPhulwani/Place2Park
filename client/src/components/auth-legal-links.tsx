import Link from "@/components/link";

export function AuthLegalLinks() {
  return (
    <p className="mt-4 text-center text-xs">
      <Link href="/privacy-policy" className="text-brand-500 hover:underline">
        Privacy Policy
      </Link>
      <span className="mx-2 text-slate-300" aria-hidden>
        ·
      </span>
      <Link href="/terms-and-conditions" className="text-brand-500 hover:underline">
        Terms and Conditions
      </Link>
    </p>
  );
}
