import * as React from "react";
import { api, errorMessage } from "@/services/api";
import { useAuth } from "@/context/auth";
import { Button } from "./ui/button";

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay-checkout]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Razorpay Checkout.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout."));
    document.body.appendChild(script);
  });
}

interface Props {
  bookingId: string;
  bookingCode: string;
  onPaid: () => void;
}

export function PayNowButton({ bookingId, bookingCode, onPaid }: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<"idle" | "success" | "cancelled" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const inflight = React.useRef(false);

  async function pay() {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setStatus("idle");
    setMessage(null);
    try {
      const { data } = await api.post("/payments/orders", { bookingId });
      const order = data.data as {
        keyId: string;
        orderId: string;
        amount: number;
        currency: string;
        bookingCode?: string;
      };
      if (!order?.keyId || !order.orderId) throw new Error("Payment order was missing a public key or order id.");
      await loadCheckoutScript();
      if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable.");

      await new Promise<void>((resolve, reject) => {
        const checkout = new window.Razorpay!({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency || "INR",
          name: "Parkly",
          description: `Booking ${order.bookingCode || bookingCode}`,
          order_id: order.orderId,
          prefill: { name: user?.name ?? "", email: user?.email ?? "", contact: user?.phone ?? "" },
          theme: { color: "#6C7A89" },
          handler: (response) => {
            api
              .post("/payments/verify", {
                bookingId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              })
              .then(({ data }) => {
                if (data?.data?.refunded) {
                  reject(
                    new Error(
                      "Payment was received but the reservation could not be confirmed. A refund has been requested."
                    )
                  );
                  return;
                }
                resolve();
              })
              .catch((e) => reject(e instanceof Error ? e : new Error(errorMessage(e, "Payment could not be verified."))));
          },
          modal: {
            ondismiss: () => reject(Object.assign(new Error("Payment cancelled."), { cancelled: true })),
          },
        });
        checkout.open();
      });

      setStatus("success");
      setMessage("Payment verified. Your booking is confirmed.");
      onPaid();
    } catch (e) {
      if (e && typeof e === "object" && "cancelled" in e) {
        setStatus("cancelled");
        setMessage("Checkout closed. Your reservation is still unpaid.");
      } else {
        setStatus("error");
        setMessage(errorMessage(e, "Payment failed. Your booking is still unpaid."));
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button size="lg" className="w-full" onClick={pay} loading={busy} disabled={busy}>
        Pay now
      </Button>
      {message && (
        <p
          role={status === "error" ? "alert" : "status"}
          className={`text-sm ${
            status === "success"
              ? "text-emerald-700"
              : status === "cancelled"
                ? "text-slate-500"
                : "text-red-700"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
