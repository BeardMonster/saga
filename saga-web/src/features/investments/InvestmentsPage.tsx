import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { formatDateOnly } from "../../shared/lib/dates";
import InlineEditText from "../../shared/components/InlineEditText";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type InvestmentAccountType = "k401" | "brokerage" | "ira" | "other";

interface BalanceSnapshot {
  id: string;
  asOfDate: string;
  totalValue: string;
  contributionsThisPeriod: string | null;
}

interface InvestmentAccount {
  id: string;
  institution: string;
  accountType: InvestmentAccountType;
  last4: string | null;
  balanceSnapshots: BalanceSnapshot[];
}

const ACCOUNT_TYPES: { value: InvestmentAccountType; label: string }[] = [
  { value: "k401", label: "401k" },
  { value: "brokerage", label: "Brokerage" },
  { value: "ira", label: "IRA" },
  { value: "other", label: "Other" },
];

function accountTypeLabel(type: InvestmentAccountType) {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type;
}

function InvestmentAccountCard({ account }: { account: InvestmentAccount }) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [asOfDate, setAsOfDate] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [contributions, setContributions] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["investment-accounts"] });

  const addSnapshot = useMutation({
    mutationFn: () =>
      apiPost(`/investments/accounts/${account.id}/snapshots`, {
        asOfDate: new Date(asOfDate).toISOString(),
        totalValue: Number(totalValue),
        contributionsThisPeriod: contributions ? Number(contributions) : undefined,
      }),
    onSuccess: () => {
      setAsOfDate("");
      setTotalValue("");
      setContributions("");
      invalidate();
    },
  });

  const deleteSnapshot = useMutation({
    mutationFn: (snapshotId: string) => deleteWithUndo(`/investments/accounts/${account.id}/snapshots/${snapshotId}`, "balance_snapshot", snapshotId, "Snapshot"),
    onSuccess: invalidate,
  });

  const deleteAccount = useMutation({
    mutationFn: () => deleteWithUndo(`/investments/accounts/${account.id}`, "investment_account", account.id, "Account"),
    onSuccess: invalidate,
  });

  const updateAccount = useMutation({
    mutationFn: (body: Partial<{ institution: string; last4: string }>) => apiPatch(`/investments/accounts/${account.id}`, body),
    onSuccess: invalidate,
  });

  const latest = account.balanceSnapshots[0];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">
            <InlineEditText value={account.institution} onSave={(institution) => updateAccount.mutate({ institution })} />{" "}
            <span className="text-xs text-slate-600 dark:text-slate-400">· {accountTypeLabel(account.accountType)}{account.last4 ? ` ····${account.last4}` : ""}</span>
          </h3>
          {latest && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Latest: <span className="font-mono text-slate-700 dark:text-slate-200">${Number(latest.totalValue).toLocaleString()}</span> as of{" "}
              {formatDateOnly(latest.asOfDate, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="More actions">
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              destructive
              onSelect={() =>
                setTimeout(async () => {
                  if (await confirm(`Move "${account.institution}" to Trash? Its balance history goes with it — restore both together within 30 days.`)) {
                    deleteAccount.mutate();
                  }
                }, 0)
              }
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (asOfDate && totalValue) addSnapshot.mutate();
        }}
        className="grid gap-3 rounded-xl bg-slate-50 dark:bg-slate-950 p-3"
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Log a balance</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="As of">
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </Field>
          <Field label="Total value ($)">
            <Input type="number" step="0.01" inputMode="decimal" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} />
          </Field>
          <Field label="Contributions (optional)">
            <Input type="number" step="0.01" inputMode="decimal" value={contributions} onChange={(e) => setContributions(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary">
            Log Balance
          </Button>
        </div>
      </form>

      {account.balanceSnapshots.length > 0 && (
        <ul className="space-y-1">
          {account.balanceSnapshots.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>
                {formatDateOnly(s.asOfDate, { month: "short", day: "numeric", year: "numeric" })} · $
                {Number(s.totalValue).toLocaleString()}
                {s.contributionsThisPeriod ? ` · +$${Number(s.contributionsThisPeriod).toLocaleString()} contributed` : ""}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-10 w-10 md:h-9 md:w-9"
                aria-label="Delete this balance entry"
                onClick={async () => {
                  if (await confirm("Move this balance snapshot to Trash? You can restore it within 30 days.")) deleteSnapshot.mutate(s.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </div>
  );
}

export default function InvestmentsPage() {
  const queryClient = useQueryClient();
  const [institution, setInstitution] = useState("");
  const [accountType, setAccountType] = useState<InvestmentAccountType>("k401");
  const [last4, setLast4] = useState("");

  const { data } = useQuery({
    queryKey: ["investment-accounts"],
    queryFn: () => apiGet<InvestmentAccount[]>("/investments/accounts"),
  });

  const createAccount = useMutation({
    mutationFn: () => apiPost("/investments/accounts", { institution, accountType, last4: last4 || undefined }),
    onSuccess: () => {
      setInstitution("");
      setLast4("");
      queryClient.invalidateQueries({ queryKey: ["investment-accounts"] });
    },
  });

  const accounts = data?.data ?? [];
  const totalAcrossAccounts = accounts.reduce((sum, a) => sum + Number(a.balanceSnapshots[0]?.totalValue ?? 0), 0);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Investments</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          401k/brokerage/IRA balances over time — periodic snapshots, not itemized transactions. This is what tracks
          progress toward early retirement.
        </p>
      </div>

      {accounts.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Latest combined balance: <span className="font-mono font-semibold">${totalAcrossAccounts.toLocaleString()}</span>
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (institution.trim()) createAccount.mutate();
        }}
        className="grid gap-3"
      >
        <Field label="Institution">
          <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Charles Schwab" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Account type">
            <Select value={accountType} onChange={(e) => setAccountType(e.target.value as InvestmentAccountType)}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Last 4 digits (optional)">
            <Input value={last4} onChange={(e) => setLast4(e.target.value)} maxLength={4} inputMode="numeric" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit">Add Account</Button>
        </div>
      </form>

      <div className="space-y-3">
        {accounts.map((a) => (
          <InvestmentAccountCard key={a.id} account={a} />
        ))}
        {accounts.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No investment accounts yet.</p>}
      </div>
    </div>
  );
}
