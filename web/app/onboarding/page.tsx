"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import { Compass, ArrowRight, ArrowLeft, Plus, X, Loader2, Sparkles, Check, Package, TrendingUp, Truck, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = ["Website", "Model", "About you", "Presence", "Competitors", "Generating"];
const LAST_INPUT_STEP = 4; // Competitors — the step before Generating

interface BusinessModelOption {
  id: string;
  label: string;
  description: string;
  icon: typeof Package;
}

const BUSINESS_MODELS: BusinessModelOption[] = [
  {
    id: "own_products",
    label: "My own products",
    description: "I make or source my own product line — building a real brand around it.",
    icon: Package,
  },
  {
    id: "trending_products",
    label: "Trending / winning products",
    description: "I chase what's actually selling right now — the product itself can change.",
    icon: TrendingUp,
  },
  {
    id: "dropshipping",
    label: "Dropshipping",
    description: "A supplier holds and ships the stock — I never touch real inventory.",
    icon: Truck,
  },
  {
    id: "mixed",
    label: "A mix of these",
    description: "Some of my own products plus trending or dropshipped items too.",
    icon: Layers,
  },
];

interface Question {
  id: string;
  question: string;
  why: string;
  type: "choice" | "text";
  options?: string[];
  placeholder?: string;
}

interface DiscoverResult {
  businessName: string;
  niche: string;
  instagram: string;
  whatsapp?: string;
  contacts?: Record<string, string | null> | null;
  socialsFromSearch?: string[];
  competitors: string[];
  scrapeMethod?: "http" | "browser" | "failed";
}

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [website, setWebsite] = useState("");
  const [business, setBusiness] = useState({ name: "", niche: "" });
  const [businessModel, setBusinessModel] = useState<string | null>(null);
  const [socials, setSocials] = useState({ instagram: "", whatsapp: "" });
  // What the website scan actually found — shown on the channels step so the seller sees why fields are prefilled.
  const [foundOnSite, setFoundOnSite] = useState<{ label: string; value: string; searched: boolean }[]>([]);
  const [competitors, setCompetitors] = useState<string[]>([""]);
  // AI-written questions for this seller (step 3), and which business they were written for.
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsFor, setQuestionsFor] = useState("");
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [progressText, setProgressText] = useState("Reading your business profile…");
  const [error, setError] = useState<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pageRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        pageRef.current!.querySelectorAll("[data-entrance]"),
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.08, ease: "power3.out" },
      );
    }, pageRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!stepContentRef.current) return;
    gsap.fromTo(
      stepContentRef.current,
      { opacity: 0, x: 14 },
      { opacity: 1, x: 0, duration: 0.45, ease: "power2.out" },
    );
  }, [step]);

  async function loadQuestions() {
    const key = `${business.name}|${business.niche}|${businessModel}`;
    if (key === questionsFor && questions.length) return;
    setLoadingQuestions(true);
    try {
      const res = await fetch("/api/onboarding/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: business.name, niche: business.niche, businessModel, website }),
      });
      const data = (await res.json()) as { questions?: Question[] };
      if (data.questions?.length) {
        setQuestions(data.questions);
        setQuestionsFor(key);
      }
    } catch {
      /* the step still works — it just shows nothing to answer */
    } finally {
      setLoadingQuestions(false);
    }
  }

  function next() {
    if (step === LAST_INPUT_STEP) {
      startGeneration();
      return;
    }
    if (step === 1) void loadQuestions();
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function analyzeWithAI() {
    if (!website.trim()) return;
    setAnalyzing(true);
    setDiscoverError(null);
    try {
      const res = await fetch("/api/onboarding/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setDiscoverError(data.error || "Couldn't analyze that site.");
        setManualMode(true);
        return;
      }
      const discovered = data as DiscoverResult;
      setBusiness({ name: discovered.businessName, niche: discovered.niche });
      setSocials((s) => ({
        instagram: discovered.instagram || s.instagram,
        whatsapp: discovered.whatsapp || s.whatsapp,
      }));
      const c = discovered.contacts ?? {};
      const labels: [string, string][] = [["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["x", "X"], ["whatsapp", "WhatsApp"], ["phone", "Phone"], ["email", "Email"]];
      setFoundOnSite(
        labels
          .filter(([k]) => c[k] && !(k === "phone" && c.phone === c.whatsapp))
          .map(([k, label]) => ({ label, value: String(c[k]), searched: !!discovered.socialsFromSearch?.includes(k) })),
      );
      setCompetitors(discovered.competitors.length > 0 ? discovered.competitors : [""]);
      setAnalyzed(true);
      if (discovered.competitors.length === 0) {
        setDiscoverError("Couldn't find real competitors from a search — add some yourself in the next step.");
      }
    } catch {
      setDiscoverError("Couldn't reach the analysis service — try again, or fill this in yourself.");
      setManualMode(true);
    } finally {
      setAnalyzing(false);
    }
  }

  async function startGeneration() {
    setStep(LAST_INPUT_STEP + 1);
    setGenerating(true);
    setError(null);
    const messages = [
      "Reading about your business…",
      "Importing your products from your website…",
      "Visiting your competitors' sites…",
      "Comparing pricing and what's trending…",
      "Putting together your growth plan…",
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = Math.min(i + 1, messages.length - 1);
      setProgressText(messages[i]);
    }, 2200);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: business.name,
          niche: business.niche,
          businessModel,
          website,
          instagram: socials.instagram,
          whatsapp: socials.whatsapp,
          competitors: competitors.filter(Boolean),
          answers: questions.map((q) => ({ question: q.question, answer: (answers[q.id] ?? "").trim() })).filter((a) => a.answer),
        }),
      });
      clearInterval(interval);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong generating your report.");
      }
      setProgressText("Done — taking you to your dashboard…");
      router.push("/dashboard");
    } catch (e) {
      clearInterval(interval);
      setGenerating(false);
      setStep(LAST_INPUT_STEP);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  const canContinueStep0 = business.name.trim().length > 0 && business.niche.trim().length > 0;

  return (
    <div ref={pageRef} className="relative min-h-screen overflow-hidden bg-[#0a0a0c] text-zinc-100">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{
          background: "radial-gradient(600px circle at 50% 0%, rgba(168,85,247,0.18), transparent 60%)",
        }}
      />
      <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          <div data-entrance className="mb-8 flex items-center justify-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400">
              <Compass className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[16px] font-semibold tracking-tight">
              orbit<span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-orange-400 bg-clip-text text-transparent">.ai</span>
            </span>
          </div>

          {!generating && (
            <div data-entrance className="mb-8 flex items-center justify-center gap-2">
              {steps.slice(0, LAST_INPUT_STEP + 1).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-medium transition-all duration-300",
                      i <= step
                        ? "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 text-white"
                        : "bg-zinc-900 text-zinc-600 border border-zinc-800",
                    )}
                  >
                    {i + 1}
                  </div>
                  {i < LAST_INPUT_STEP && (
                    <div
                      className={cn(
                        "h-px w-8 transition-colors duration-300",
                        i < step ? "bg-fuchsia-500/60" : "bg-zinc-800",
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div
            ref={cardRef}
            data-entrance
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-9 shadow-2xl backdrop-blur"
          >
            <div ref={stepContentRef}>
              {step === 0 && (
                <div>
                  <h2 className="text-xl font-semibold text-white">What&apos;s your website?</h2>
                  <p className="mt-1.5 text-[14.5px] text-zinc-400">
                    Give us your real site and AI reads it — business name, what you sell, and your
                    Instagram if it&apos;s linked — then does a real search to find your real competitors.
                    Nothing here is guessed; you can edit anything before we generate your plan.
                  </p>
                  <div className="mt-6 space-y-4">
                    <Field label="Website">
                      <div className="flex gap-2">
                        <input
                          className="dark-input"
                          placeholder="yourstore.com"
                          value={website}
                          onChange={(e) => {
                            setWebsite(e.target.value);
                            setAnalyzed(false);
                          }}
                        />
                        <button
                          onClick={analyzeWithAI}
                          disabled={!website.trim() || analyzing}
                          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500 px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40"
                        >
                          {analyzing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          {analyzing ? "Analyzing…" : "Analyze with AI"}
                        </button>
                      </div>
                    </Field>

                    {discoverError && (
                      <p className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 text-[13px] leading-relaxed text-amber-300">
                        {discoverError}
                      </p>
                    )}

                    {analyzed && (
                      <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 text-[13px] text-emerald-300">
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        Read your site — review and edit what AI found below.
                      </div>
                    )}

                    {(analyzed || manualMode) && (
                      <>
                        <Field label="Business name">
                          <input
                            className="dark-input"
                            placeholder="Your business name"
                            value={business.name}
                            onChange={(e) => setBusiness({ ...business, name: e.target.value })}
                          />
                        </Field>
                        <Field label="What do you sell?">
                          <input
                            className="dark-input"
                            placeholder="e.g. organic cold-pressed oils and herbal supplements"
                            value={business.niche}
                            onChange={(e) => setBusiness({ ...business, niche: e.target.value })}
                          />
                        </Field>
                      </>
                    )}

                    {!analyzed && !manualMode && (
                      <button
                        onClick={() => setManualMode(true)}
                        className="text-[13px] font-medium text-zinc-500 hover:text-zinc-300"
                      >
                        No website, or I&apos;d rather type this myself →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <h2 className="text-xl font-semibold text-white">How do you want to work?</h2>
                  <p className="mt-1.5 text-[14.5px] text-zinc-400">
                    Your AI team always optimizes for the same thing — real orders and real growth.
                    This just changes how it gets there.
                  </p>
                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {BUSINESS_MODELS.map((m) => {
                      const Icon = m.icon;
                      const selected = businessModel === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setBusinessModel(m.id)}
                          className={cn(
                            "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                            selected
                              ? "border-fuchsia-500 bg-fuchsia-500/10"
                              : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700",
                          )}
                        >
                          <div className="flex w-full items-center justify-between">
                            <Icon className={cn("h-4.5 w-4.5", selected ? "text-fuchsia-400" : "text-zinc-500")} />
                            {selected && <Check className="h-3.5 w-3.5 text-fuchsia-400" />}
                          </div>
                          <span className="text-[14px] font-semibold text-white">{m.label}</span>
                          <span className="text-[12.5px] leading-relaxed text-zinc-400">{m.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h2 className="text-xl font-semibold text-white">A few questions about {business.name || "your business"}</h2>
                  <p className="mt-1.5 text-[14.5px] text-zinc-400">
                    Written by AI for what you sell. Answer what you can — skip anything you&apos;re not sure about. Your AI team reads these before every plan.
                  </p>
                  {loadingQuestions ? (
                    <div className="mt-8 flex items-center gap-2.5 text-[13.5px] text-zinc-400">
                      <Loader2 className="h-4 w-4 animate-spin text-fuchsia-400" /> Writing questions for your business…
                    </div>
                  ) : (
                    <div className="mt-6 space-y-5">
                      {questions.map((q) => (
                        <div key={q.id}>
                          <div className="text-[14px] font-medium text-zinc-200">{q.question}</div>
                          {q.why && <div className="mt-0.5 text-[12px] text-zinc-500">{q.why}</div>}
                          {q.type === "choice" && q.options?.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {q.options.map((o) => {
                                const on = answers[q.id] === o;
                                return (
                                  <button
                                    key={o}
                                    type="button"
                                    onClick={() => setAnswers({ ...answers, [q.id]: on ? "" : o })}
                                    className={cn(
                                      "rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
                                      on ? "border-fuchsia-500 bg-fuchsia-500/10 text-white" : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700",
                                    )}
                                  >
                                    {o}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <input
                              className="dark-input mt-2"
                              placeholder={q.placeholder ?? "Your answer"}
                              value={answers[q.id] ?? ""}
                              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div>
                  <h2 className="text-xl font-semibold text-white">Where do you sell &amp; talk to customers?</h2>
                  <p className="mt-1.5 text-[14.5px] text-zinc-400">
                    Your AI team will post and reply across whatever you connect here.
                  </p>
                  <div className="mt-6 space-y-4">
                    <Field label="Instagram handle">
                      <input
                        className="dark-input"
                        placeholder="@yourbrand"
                        value={socials.instagram}
                        onChange={(e) => setSocials({ ...socials, instagram: e.target.value })}
                      />
                    </Field>
                    <Field label="WhatsApp Business number">
                      <input
                        className="dark-input"
                        placeholder="+92 3XX XXXXXXX"
                        value={socials.whatsapp}
                        onChange={(e) => setSocials({ ...socials, whatsapp: e.target.value })}
                      />
                    </Field>
                    {foundOnSite.length > 0 && (
                      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-3.5 text-[13px] leading-relaxed text-zinc-300">
                        <div className="text-[12px] font-medium text-emerald-400">Found for your business</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {foundOnSite.map((f) => (
                            <span key={f.label} className="rounded-md bg-zinc-900 px-2 py-1 text-[12px] text-zinc-400">
                              {f.label}: <span className="text-zinc-200">{f.value}</span>
                              {f.searched && <span className="ml-1 text-amber-400">*</span>}
                            </span>
                          ))}
                        </div>
                        {foundOnSite.some((f) => f.searched) && (
                          <div className="mt-2 text-[11.5px] text-zinc-500">
                            <span className="text-amber-400">*</span> Your site doesn&apos;t link these — AI found them with a web search. Please check they&apos;re really yours.
                          </div>
                        )}
                      </div>
                    )}
                    <p className="rounded-xl bg-zinc-900 border border-zinc-800 p-3.5 text-[13px] leading-relaxed text-zinc-500">
                      No rush — you can connect WhatsApp and Instagram later from Settings. Your website chat works right away either way.
                    </p>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <h2 className="text-xl font-semibold text-white">Who are your competitors?</h2>
                  <p className="mt-1.5 text-[14.5px] text-zinc-400">
                    {competitors.some(Boolean)
                      ? "AI found these from a real search — remove any that aren't right, or add more."
                      : "Add 3 to 10 links. We'll study them and build your first growth report."}
                  </p>
                  <div className="mt-6 space-y-2.5">
                    {competitors.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className="dark-input"
                          placeholder="competitorsite.com or @handle"
                          value={c}
                          onChange={(e) => {
                            const next = [...competitors];
                            next[i] = e.target.value;
                            setCompetitors(next);
                          }}
                        />
                        {competitors.length > 1 && (
                          <button
                            onClick={() => setCompetitors(competitors.filter((_, idx) => idx !== i))}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 hover:text-red-400"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {competitors.length < 10 && (
                      <button
                        onClick={() => setCompetitors([...competitors, ""])}
                        className="flex items-center gap-1.5 text-[13.5px] font-medium text-fuchsia-400 hover:text-fuchsia-300"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add another
                      </button>
                    )}
                    {error && (
                      <p className="rounded-xl bg-red-500/10 border border-red-500/20 p-3.5 text-[13px] leading-relaxed text-red-400">
                        {error}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="relative flex h-14 w-14 items-center justify-center">
                    <div className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,#a855f7,#ec4899,#f97316,#a855f7)] [mask:radial-gradient(farthest-side,transparent_calc(100%-3px),#000_calc(100%-3px))]" />
                    <Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" />
                  </div>
                  <p className="mt-5 text-[14.5px] text-zinc-300">{progressText}</p>
                  <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400" />
                  </div>
                  <p className="mt-4 text-[12px] text-zinc-500">This can take up to 30 seconds — real analysis, not a demo.</p>
                  <style>{`
                    @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
                  `}</style>
                </div>
              )}
            </div>

            {step <= LAST_INPUT_STEP && (
              <div className="mt-8 flex items-center justify-between">
                {step > 0 ? (
                  <button
                    onClick={back}
                    className="flex items-center gap-1.5 text-[14px] font-medium text-zinc-400 hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                ) : (
                  <span />
                )}
                <button
                  onClick={next}
                  disabled={(step === 0 && !canContinueStep0) || (step === 1 && !businessModel) || (step === 2 && loadingQuestions)}
                  className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500 px-5 py-2.5 text-[14.5px] font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.22)] transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
                >
                  {step === LAST_INPUT_STEP ? "Generate my growth report" : step === 2 && !Object.values(answers).some((a) => a.trim()) ? "Skip for now" : "Continue"}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .dark-input {
          width: 100%;
          border-radius: 0.6rem;
          border: 1px solid rgb(39 39 42);
          background: rgb(24 24 27 / 0.8);
          padding: 0.65rem 0.85rem;
          font-size: 0.95rem;
          color: #f4f4f5;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .dark-input::placeholder { color: rgb(113 113 122); }
        .dark-input:focus {
          border-color: #d946ef;
          box-shadow: 0 0 0 3px rgba(217, 70, 239, 0.15);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13.5px] font-medium text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}
