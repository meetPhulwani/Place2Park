import { ErrorScreen } from "@/components/error-screen";

export default function NotFoundPage() {
  return <ErrorScreen status={404} />;
}
