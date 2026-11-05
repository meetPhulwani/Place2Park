import * as React from "react";
import { useNavigate } from "react-router-dom";
import { consoleApi, consoleError } from "@/services/console-api";
import "./console.css";

type Stage = "credentials" | "otp" | "question" | "totp";

export function ConsoleSignIn() {
  const navigate = useNavigate();
  const [stage, setStage] = React.useState<Stage>("credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (stage === "credentials") {
        await consoleApi.post("/auth/start", { email, password });
        setPassword("");
        setStage("otp");
      } else if (stage === "otp") {
        const { data } = await consoleApi.post("/auth/otp", { code });
        setQuestion(String(data.data.question ?? ""));
        setCode("");
        setStage("question");
      } else if (stage === "question") {
        await consoleApi.post("/auth/question", { answer });
        setAnswer("");
        setStage("totp");
      } else {
        await consoleApi.post("/auth/totp", { code });
        navigate("/");
      }
    } catch (err) {
      setError(consoleError(err, "Those details are incorrect."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="p2p-signin flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[#C7D1DD] bg-white p-8 shadow-[0_18px_50px_rgb(2_81_176_/_0.08)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0251B0]">Admin Console</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#111827]">Place2Park</h1>
      <p className="mt-2 text-sm text-[#64748b]">Sign in with your administrator credentials.</p>
      <form className="mt-6 space-y-3" onSubmit={(event) => void submit(event)}>
        {stage === "credentials" && (
          <>
            <input className="w-full rounded-lg border border-[#C7D1DD] px-3 py-2" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
            <input className="w-full rounded-lg border border-[#C7D1DD] px-3 py-2" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
          </>
        )}
        {stage === "otp" && (
          <input className="w-full rounded-lg border border-[#C7D1DD] px-3 py-2" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Email code" required />
        )}
        {stage === "question" && (
          <>
            <p className="text-sm">{question}</p>
            <input className="w-full rounded-lg border border-[#C7D1DD] px-3 py-2" type="password" autoComplete="off" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer" required />
          </>
        )}
        {stage === "totp" && (
          <input className="w-full rounded-lg border border-[#C7D1DD] px-3 py-2" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Authenticator code" required />
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="w-full rounded-xl bg-[#0251B0] px-3 py-2.5 font-semibold text-white transition hover:bg-[#01408c] disabled:opacity-60" disabled={busy} type="submit">
          Continue
        </button>
      </form>
      </section>
    </main>
  );
}
