"use client";

import { useEffect } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200">
      <Skeleton className="h-5 w-32 mb-4" />
      <div className="flex gap-6">
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-10 w-16" />
      </div>
      <Skeleton className="h-3 w-40 mt-4" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <Skeleton className="h-4 w-28 mb-4" />
      <Skeleton className="h-[250px] w-full" />
    </div>
  );
}

export function SummaryCard({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className="bg-sky-50 border border-sky-100 rounded-xl p-4">
      <h3 className="text-sm font-medium text-sky-800 mb-1">Summary</h3>
      <p className="text-sm text-slate-700 leading-relaxed">{lines.join(" ")}</p>
    </div>
  );
}

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m5 13 4 4L19 7" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {message}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full p-5">
        <p className="text-sm text-slate-700">{message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
