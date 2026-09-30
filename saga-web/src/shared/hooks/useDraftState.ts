import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

// Switching to another app (e.g. copying the next chunk from Keep) and back
// can make a mobile browser reclaim Saga's backgrounded tab — a real reload,
// not just a background refetch, which would otherwise silently wipe
// whatever was typed into a "new X" field mid-paste. A drop-in replacement
// for useState("") on any freeform create-form field: same API, but backed
// by localStorage so a reload restores it, and cleared once the value goes
// back to empty (typically right after a successful submit).
//
// `key` must be unique per field across the whole app (e.g.
// "saga-draft-checklist-name") — two fields sharing a key would stomp on
// each other's drafts.
export function useDraftState(key: string, initial = ""): [string, (value: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      /* storage unavailable — draft just won't survive a reload */
    }
  }, [key, value]);

  return [value, setValue];
}

// Same idea as useDraftState, for a whole form's worth of fields (e.g.
// RecipeForm's title/ingredients/instructions/etc.) instead of one string.
// Caller owns making the key collision-free — e.g. a fixed key for "new
// recipe" and a per-id key for "editing recipe X", so an abandoned edit on
// one recipe can never bleed into another. Never auto-clears (an object
// draft has no obvious "empty" state) — clear it explicitly with
// clearDraft() on a real cancel/success.
export function useDraftObject<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — draft just won't survive a reload */
    }
  }, [key, value]);

  return [value, setValue];
}

// For a "cancel" path that also unmounts this component in the same render
// (e.g. a parent flipping the boolean that conditionally renders the dialog
// this draft lives in) — calling setValue("") there is NOT enough, since
// React can skip firing the just-scheduled persistence effect when the
// component unmounts in the same commit, leaving the old value stuck in
// localStorage forever. Call this synchronously instead, before/alongside
// closing whatever unmounts the component.
export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
