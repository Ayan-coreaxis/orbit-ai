"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { Star, Check, Loader2 } from "lucide-react";

interface ReviewData {
  businessName: string;
  productNames: string;
  status: string;
  rating: number | null;
  comment: string | null;
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ReviewData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/review/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setNotFound(true));
  }, [id]);

  async function submit() {
    if (rating === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't submit.");
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
        <p className="text-[14.5px] text-zinc-500">This review link isn&apos;t valid.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  const alreadyDone = data.status === "submitted" || data.status === "flagged" || submitted;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        {alreadyDone ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <h1 className="text-lg font-semibold text-zinc-900">Thanks for your review!</h1>
            <p className="text-[13.5px] text-zinc-500">It means a lot to {data.businessName}.</p>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-zinc-900">How was {data.productNames}?</h1>
            <p className="mt-1 text-[13.5px] text-zinc-500">From {data.businessName}</p>

            <div className="mt-5 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)}>
                  <Star
                    className={`h-8 w-8 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`}
                  />
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anything you'd like to add? (optional)"
              rows={3}
              className="mt-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-[13.5px] outline-none focus:border-zinc-500"
            />

            {error && <p className="mt-2 text-[12.5px] text-red-500">{error}</p>}

            <button
              onClick={submit}
              disabled={rating === 0 || submitting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit review"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
