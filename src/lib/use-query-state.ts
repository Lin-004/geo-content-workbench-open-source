"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
/** Persist page controls through refresh, sharing and browser back navigation. */
export function useQueryState(key: string, fallback: string, server = false) {
  const router = useRouter();
  const params = useSearchParams();
  const value = params.get(key) ?? fallback;
  const [state, setState] = useState(value);
  useEffect(() => { setState(value); }, [value]);
  function update(next: string | ((current: string) => string)) {
    const resolved = typeof next === "function" ? next(state) : next;
    setState(resolved);
    const url = new URL(window.location.href);
    if (resolved === fallback || !resolved) url.searchParams.delete(key); else url.searchParams.set(key, resolved);
    if (server) { if (key !== "page") url.searchParams.delete("page"); window.history.replaceState(null, "", url); router.refresh(); }
    else window.history.replaceState(null, "", url);
  }
  return [state, update] as const;
}
