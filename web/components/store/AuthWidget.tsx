"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WidgetStyles } from "./widget-ui";
import { copyText, type WidgetCopyKey } from "@/lib/widget-copy";

type AuthMode = "otp" | "password" | "none" | "both";

/**
 * Generic sign-in / sign-up widget. `authMode` says which methods this store accepts:
 * "otp" = phone + a code, "password" = email + password, "both" = the shopper picks, "none" = no accounts.
 * Used both as a designed slot widget and on the core /account/login page.
 */
export function AuthWidget({
  businessId,
  authMode,
  onDone,
  initialTab = "in",
  widgetCopy = {},
  widgetMotion = "standard",
}: {
  businessId: string;
  authMode: AuthMode;
  /** called after a successful sign-in instead of router.refresh() — e.g. to redirect to /account */
  onDone?: () => void;
  /** which tab to open on — "up" (create account) for the checkout gate */
  initialTab?: "in" | "up";
  widgetCopy?: Partial<Record<WidgetCopyKey, string>>;
  widgetMotion?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"in" | "up">(initialTab);
  const [step, setStep] = useState<"form" | "code">("form");
  const [method, setMethod] = useState<"otp" | "password">(authMode === "password" ? "password" : "otp");
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", code: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  if (authMode === "none") {
    return <p style={{ color: "var(--od-muted)" }}>This store doesn&apos;t use customer accounts.</p>;
  }

  const eff: "otp" | "password" = authMode === "both" ? method : authMode;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const done = () => (onDone ? onDone() : router.refresh());

  async function post(path: string, body: Record<string, unknown>) {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/store/${businessId}/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) {
        setErr(data.error ?? copyText("auth.genericError", widgetCopy));
        return null;
      }
      return data;
    } catch {
      setBusy(false);
      setErr(copyText("auth.networkError", widgetCopy));
      return null;
    }
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (eff === "password") {
      const data = await post(tab === "in" ? "login" : "signup", { name: f.name, email: f.email, password: f.password });
      if (data?.ok) done();
      return;
    }
    // otp — signup on the "up" tab (captures name), otp-request on "in"
    const data = await post(tab === "up" ? "signup" : "otp-request", { name: f.name, phone: f.phone });
    if (data?.ok) {
      setDevCode(data.devCode ?? null);
      setStep("code");
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const data = await post("otp-verify", { phone: f.phone, code: f.code, name: f.name });
    if (data?.ok) done();
  }

  return (
    <div className="odw" style={{ maxWidth: 400, margin: "0 auto" }}>
      <WidgetStyles />
      <div className="odw-card" style={{ display: "grid", gap: 16 }}>
        <div className="odw-tabs">
          {(["in", "up"] as const).map((t) => (
            <button
              key={t}
              className={tab === t ? "on" : ""}
              onClick={() => {
                setTab(t);
                setStep("form");
                setErr(null);
              }}
            >
              {t === "in" ? copyText("auth.signIn", widgetCopy) : copyText("auth.createAccountBtn", widgetCopy)}
            </button>
          ))}
        </div>

        {step === "form" ? (
          <form onSubmit={submitForm} style={{ display: "grid", gap: 14 }}>
            <div>
              <h3 className="odw-h" style={{ fontSize: 17 }}>{tab === "in" ? copyText("auth.welcomeBack", widgetCopy) : copyText("auth.createAccount", widgetCopy)}</h3>
              <p className="odw-sub">
                {eff === "password"
                  ? tab === "in"
                    ? "Sign in with your email and password."
                    : "You'll be signed in right away."
                  : tab === "in"
                    ? "We'll text you a one-time code to sign in."
                    : "We'll text you a code to confirm your number."}
              </p>
            </div>

            {authMode === "both" && (
              <div className="odw-seg">
                {(["otp", "password"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={method === m ? "on" : ""}
                    onClick={() => {
                      setMethod(m);
                      setErr(null);
                    }}
                  >
                    {m === "otp" ? copyText("auth.textMeACode", widgetCopy) : copyText("auth.usePassword", widgetCopy)}
                  </button>
                ))}
              </div>
            )}

            {tab === "up" && (
              <label className="odw-field">
                <span className="odw-label">Full name</span>
                <input className="odw-input" required value={f.name} onChange={set("name")} autoComplete="name" />
              </label>
            )}
            {eff === "password" ? (
              <>
                <label className="odw-field">
                  <span className="odw-label">Email</span>
                  <input className="odw-input" required type="email" value={f.email} onChange={set("email")} autoComplete="email" />
                </label>
                <label className="odw-field">
                  <span className="odw-label">Password</span>
                  <input
                    className="odw-input"
                    required
                    type="password"
                    minLength={6}
                    value={f.password}
                    onChange={set("password")}
                    autoComplete={tab === "in" ? "current-password" : "new-password"}
                    placeholder={tab === "up" ? "At least 6 characters" : ""}
                  />
                  {tab === "up" && f.password && <PasswordStrength value={f.password} />}
                </label>
              </>
            ) : (
              <label className="odw-field">
                <span className="odw-label">Phone number</span>
                <input className="odw-input" required type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder="+92 3XX XXXXXXX" />
              </label>
            )}
            {err && <p role="alert" className="odw-err">{err}</p>}
            <button type="submit" className="odw-btn" disabled={busy}>
              {busy
                ? copyText("auth.pleaseWait", widgetCopy)
                : eff === "password"
                  ? tab === "in"
                    ? copyText("auth.signIn", widgetCopy)
                    : copyText("auth.createAccountBtn", widgetCopy)
                  : copyText("auth.sendCode", widgetCopy)}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} style={{ display: "grid", gap: 14 }}>
            <div>
              <h3 className="odw-h" style={{ fontSize: 17 }}>{copyText("auth.enterYourCode", widgetCopy)}</h3>
              <p className="odw-sub">
                We sent a 6-digit code to <strong style={{ color: "var(--od-text)" }}>{f.phone}</strong>.
                {devCode ? ` (dev: ${devCode})` : ""}
              </p>
            </div>
            <label className="odw-field">
              <span className="odw-label">6-digit code</span>
              <input
                className="odw-input"
                required
                inputMode="numeric"
                maxLength={6}
                value={f.code}
                onChange={set("code")}
                style={{ letterSpacing: "0.4em", fontSize: 18, textAlign: "center" }}
                placeholder="••••••"
              />
            </label>
            {err && <p role="alert" className="odw-err">{err}</p>}
            <button type="submit" className="odw-btn" disabled={busy}>
              {busy ? "Verifying…" : copyText("auth.verifyAndSignIn", widgetCopy)}
            </button>
            <button type="button" className="odw-link" style={{ justifySelf: "center" }} onClick={() => setStep("form")}>
              {copyText("auth.useDifferentNumber", widgetCopy)}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const STRENGTH_LABEL = ["Weak", "Weak", "Medium", "Medium", "Strong"];
const STRENGTH_COLOR = ["#ef4444", "#ef4444", "#f59e0b", "#f59e0b", "#22c55e"];

function passwordScore(pw: string): number {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

/** Live password-strength meter for the sign-up password field — a thin bar that fills/colours as
 *  the shopper types, matching the "strength meter" expectation from the site's design brief. */
function PasswordStrength({ value }: { value: string }) {
  const score = passwordScore(value);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 4, borderRadius: 2, background: "var(--od-border)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${((score + 1) / 5) * 100}%`,
            background: STRENGTH_COLOR[score],
            transition: "width .25s ease, background .25s ease",
            borderRadius: 2,
          }}
        />
      </div>
      <span style={{ fontSize: 11.5, color: STRENGTH_COLOR[score] }}>{STRENGTH_LABEL[score]}</span>
    </div>
  );
}
