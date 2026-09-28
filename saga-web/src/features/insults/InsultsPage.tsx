import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../core/api/client";
import { useConfirm } from "../../shared/hooks/useConfirm";
import InlineEditText from "../../shared/components/InlineEditText";

interface Insult {
  id: string;
  text: string;
  sourceUrl: string | null;
  createdAt: string;
}

export default function InsultsPage() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [bulkText, setBulkText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["insults"], queryFn: () => apiGet<Insult[]>("/insults") });
  const insults = data?.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["insults"] });

  const addLines = useMutation({
    mutationFn: () => apiPost<Insult[]>("/insults", { text: bulkText }),
    onSuccess: () => {
      setBulkText("");
      invalidate();
    },
  });

  const editOne = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => apiPatch(`/insults/${id}`, { text }),
    onSuccess: invalidate,
  });

  const deleteOne = useMutation({
    mutationFn: (id: string) => apiDelete(`/insults/${id}`),
    onSuccess: invalidate,
  });

  const importFromVideo = useMutation({
    mutationFn: () => apiPost<{ addedCount: number }>("/insults/from-video", { url: videoUrl }),
    onSuccess: (res) => {
      const count = res.data?.addedCount ?? 0;
      setImportResult(
        count > 0
          ? `Added ${count} insult${count === 1 ? "" : "s"} from that video.`
          : "Didn't find anything worth pulling out of that one — nothing added.",
      );
      setVideoUrl("");
      invalidate();
    },
    onError: () => setImportResult("Couldn't read that link — check it's a working video URL and try again."),
  });

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Insults</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          A stash of clever put-downs for catching friends off guard — never malicious, just well-turned. The Home page shows one at random.
        </p>
      </div>

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (bulkText.trim()) addLines.mutate();
        }}
      >
        <Field label="Add insults (one per line)">
          <Textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"You have the wit of...\nI'd explain it but..."} minRows={3} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={addLines.isPending || !bulkText.trim()}>
            {addLines.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>

      <form
        className="grid gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (videoUrl.trim()) {
            setImportResult(null);
            importFromVideo.mutate();
          }
        }}
      >
        <Field label="Or pull them from a video link" hint="Downloads just the audio, transcribes it locally, and picks out the insults automatically.">
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            disabled={importFromVideo.isPending}
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={importFromVideo.isPending || !videoUrl.trim()}>
            {importFromVideo.isPending ? "Reading it… this can take a minute" : "Import from video"}
          </Button>
        </div>
        {importResult && <p className="text-sm text-slate-600 dark:text-slate-400">{importResult}</p>}
      </form>

      <ul className="space-y-1">
        {insults.map((insult) => (
          <li
            key={insult.id}
            className="flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
              <InlineEditText
                value={insult.text}
                onSave={(text) => editOne.mutate({ id: insult.id, text })}
                as="textarea"
                minRows={1}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-destructive hover:text-destructive"
              onClick={async () => {
                if (await confirm("Move this insult to Trash? You can restore it within 30 days.")) deleteOne.mutate(insult.id);
              }}
            >
              Delete
            </Button>
          </li>
        ))}
        {insults.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">Nothing here yet — add some above.</p>}
      </ul>
      {dialog}
    </div>
  );
}
