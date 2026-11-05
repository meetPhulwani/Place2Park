import * as React from "react";
import { useNavigate } from "react-router-dom";
import { consoleApi, consoleError } from "@/services/console-api";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold text-[#111827]">Place2Park Console</h1>
      <p className="mt-2 text-sm text-[#111827]">Sign in with your administrator credentials.</p>
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
        <button className="w-full rounded-lg bg-[#0251B0] px-3 py-2 text-white" disabled={busy} type="submit">
          Continue
        </button>
      </form>
    </main>
  );
}
