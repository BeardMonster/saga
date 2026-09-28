import { EllipsisVertical, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../core/api/client";
import { deleteWithUndo } from "../../core/api/undoableDelete";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { formatDateOnly } from "../../shared/lib/dates";
import InlineEditText from "../../shared/components/InlineEditText";

type AccountPlatform = "bank" | "credit_card" | "venmo" | "paypal" | "wise" | "cashapp";
type AccountType = "checking" | "savings" | "credit" | "payment_app";
type BillingCycle = "weekly" | "monthly" | "quarterly" | "yearly";

interface Account {
  id: string;
  name: string;
  institution: string | null;
  platform: AccountPlatform;
  type: AccountType;
  last4: string | null;
}

interface Category {
  id: string;
  name: string;
  parentCategoryId: string | null;
  parentCategory: { name: string } | null;
}

interface Transaction {
  id: string;
  occurredAt: string;
  merchantRaw: string;
  amount: string;
  categoryId: string | null;
  category: Category | null;
  account: Account;
}

interface Subscription {
  id: string;
  serviceName: string;
  amount: string;
  billingCycle: BillingCycle;
  nextChargeDate: string;
  account: Account;
}

const PLATFORMS: AccountPlatform[] = ["bank", "credit_card", "venmo", "paypal", "wise", "cashapp"];
const ACCOUNT_TYPES: AccountType[] = ["checking", "savings", "credit", "payment_app"];
const BILLING_CYCLES: BillingCycle[] = ["weekly", "monthly", "quarterly", "yearly"];

function AccountsSection({ accounts }: { accounts: Account[] }) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [platform, setPlatform] = useState<AccountPlatform>("bank");
  const [type, setType] = useState<AccountType>("checking");
  const [last4, setLast4] = useState("");

  const createAccount = useMutation({
    mutationFn: () => apiPost("/finance/accounts", { name, institution: institution || undefined, platform, type, last4: last4 || undefined }),
    onSuccess: () => {
      setName("");
      setInstitution("");
      setLast4("");
      queryClient.invalidateQueries({ queryKey: ["finance-accounts"] });
    },
  });

  const deleteAccount = useMutation({
    mutationFn: (id: string) => deleteWithUndo(`/finance/accounts/${id}`, "finance_account", id, "Account"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["finance-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["finance-subscriptions"] });
    },
  });

  const updateAccount = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<{ name: string; institution: string; last4: string }>) =>
      apiPatch(`/finance/accounts/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-accounts"] }),
  });

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Accounts</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createAccount.mutate();
        }}
        className="grid gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Account name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Institution (optional)">
            <Input value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Platform">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value as AccountPlatform)}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Last 4 (optional)" className="col-span-2 sm:col-span-1">
            <Input value={last4} onChange={(e) => setLast4(e.target.value)} maxLength={4} inputMode="numeric" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit">Add Account</Button>
        </div>
      </form>
      <ul className="space-y-2">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
            <span>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                <InlineEditText value={a.name} onSave={(name) => updateAccount.mutate({ id: a.id, name })} />
              </span>{" "}
              <span className="text-slate-600 dark:text-slate-400">
                · {a.platform.replace("_", " ")} · {a.type.replace("_", " ")} ·{" "}
                <InlineEditText
                  value={a.institution ?? ""}
                  onSave={(institution) => updateAccount.mutate({ id: a.id, institution })}
                  placeholder="institution"
                />
                {a.last4 ? ` ····${a.last4}` : ""}
              </span>
            </span>
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
                      if (await confirm(`Move "${a.name}" to Trash? Its transactions, statements and subscriptions go with it — restore them all together within 30 days.`)) deleteAccount.mutate(a.id);
                    }, 0)
                  }
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
        {accounts.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No accounts yet — add one to start logging transactions.</p>}
      </ul>
      {dialog}
    </section>
  );
}

function CategoriesSection({ categories }: { categories: Category[] }) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");

  const createCategory = useMutation({
    mutationFn: () => apiPost("/finance/categories", { name, parentCategoryId: parentCategoryId || undefined }),
    onSuccess: () => {
      setName("");
      setParentCategoryId("");
      queryClient.invalidateQueries({ queryKey: ["finance-categories"] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => deleteWithUndo(`/finance/categories/${id}`, "finance_category", id, "Category"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-categories"] });
      queryClient.invalidateQueries({ queryKey: ["finance-transactions"] });
    },
  });

  const renameCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => apiPatch(`/finance/categories/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-categories"] });
      queryClient.invalidateQueries({ queryKey: ["finance-transactions"] });
    },
  });

  const topLevel = categories.filter((c) => !c.parentCategoryId);

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Categories</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createCategory.mutate();
        }}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <Field label="Category name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Goes under">
          <Select value={parentCategoryId} onChange={(e) => setParentCategoryId(e.target.value)}>
            <option value="">Top-level</option>
            {topLevel.map((c) => (
              <option key={c.id} value={c.id}>
                Under {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit">Add Category</Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <span key={c.id} className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 py-1 pl-3 pr-2 text-sm text-slate-700 dark:text-slate-300">
            {c.parentCategory ? `${c.parentCategory.name} > ` : ""}
            <InlineEditText value={c.name} onSave={(name) => renameCategory.mutate({ id: c.id, name })} className="!w-24" />
            <Button
              variant="ghost"
              size="icon"
              className="-my-1 -mr-1 h-10 w-10 rounded-full md:h-8 md:w-8"
              aria-label={`Delete ${c.name}`}
              onClick={async () => {
                if (await confirm(`Move "${c.name}" to Trash? You can restore it within 30 days.`)) deleteCategory.mutate(c.id);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </span>
        ))}
      </div>
      {dialog}
    </section>
  );
}

function TransactionsSection({ transactions, accounts, categories }: { transactions: Transaction[]; accounts: Account[]; categories: Category[] }) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [accountId, setAccountId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [merchantRaw, setMerchantRaw] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const createTransaction = useMutation({
    mutationFn: () =>
      apiPost("/finance/transactions", {
        accountId,
        occurredAt: new Date(occurredAt).toISOString(),
        merchantRaw,
        amount: Number(amount),
        categoryId: categoryId || undefined,
      }),
    onSuccess: () => {
      setOccurredAt("");
      setMerchantRaw("");
      setAmount("");
      setCategoryId("");
      queryClient.invalidateQueries({ queryKey: ["finance-transactions"] });
    },
  });

  const categorize = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string }) => apiPatch(`/finance/transactions/${id}`, { categoryId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-transactions"] }),
  });

  const updateTransaction = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<{ merchantRaw: string; amount: number }>) =>
      apiPatch(`/finance/transactions/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-transactions"] }),
  });

  const deleteTransaction = useMutation({
    mutationFn: (id: string) => deleteWithUndo(`/finance/transactions/${id}`, "finance_transaction", id, "Transaction"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-transactions"] }),
  });

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Transactions</h3>
      <p className="text-slate-600 dark:text-slate-400 text-sm -mt-2">
        Manual entry for now — pasting a full statement in for Ollama to parse is the next layer to build on top of this.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (accountId && occurredAt && merchantRaw.trim() && amount) createTransaction.mutate();
        }}
        className="grid gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Merchant">
            <Input value={merchantRaw} onChange={(e) => setMerchantRaw(e.target.value)} />
          </Field>
          <Field label="Amount ($)">
            <Input type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        <Field label="Category (optional)">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentCategory ? `${c.parentCategory.name} > ${c.name}` : c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end">
          <Button type="submit">Add Transaction</Button>
        </div>
      </form>
      <ul className="space-y-1.5">
        {transactions.map((t) => (
          <li key={t.id} className="flex flex-col gap-2 rounded-lg sm:flex-row sm:items-center sm:justify-between border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
            <span>
              <span className="text-slate-600 dark:text-slate-400">{formatDateOnly(t.occurredAt, { month: "short", day: "numeric" })}</span>{" "}
              <span className="font-medium text-slate-800 dark:text-slate-100">
                <InlineEditText value={t.merchantRaw} onSave={(merchantRaw) => updateTransaction.mutate({ id: t.id, merchantRaw })} />
              </span>{" "}
              <span className="text-slate-600 dark:text-slate-400">· {t.account.name}</span>
            </span>
            <span className="flex items-center gap-2">
              <Select
                aria-label="Category"
                value={t.categoryId ?? ""}
                onChange={(e) => e.target.value && categorize.mutate({ id: t.id, categoryId: e.target.value })}
                className="h-9 min-w-0 flex-1 text-xs sm:w-40 sm:flex-none md:h-10"
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentCategory ? `${c.parentCategory.name} > ${c.name}` : c.name}
                  </option>
                ))}
              </Select>
              <span className="font-mono text-slate-700 dark:text-slate-200 w-16 text-right">
                $
                <InlineEditText
                  value={Number(t.amount).toFixed(2)}
                  onSave={(v) => !Number.isNaN(Number(v)) && updateTransaction.mutate({ id: t.id, amount: Number(v) })}
                  className="!w-16 !inline"
                />
              </span>
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
                        if (await confirm(`Move this transaction (${t.merchantRaw}) to Trash? You can restore it within 30 days.`)) deleteTransaction.mutate(t.id);
                      }, 0)
                    }
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </li>
        ))}
        {transactions.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No transactions logged yet.</p>}
      </ul>
      {dialog}
    </section>
  );
}

function SubscriptionsSection({ subscriptions, accounts }: { subscriptions: Subscription[]; accounts: Account[] }) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [accountId, setAccountId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [amount, setAmount] = useState("");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [nextChargeDate, setNextChargeDate] = useState("");

  const createSubscription = useMutation({
    mutationFn: () =>
      apiPost("/finance/subscriptions", {
        accountId,
        serviceName,
        amount: Number(amount),
        billingCycle,
        nextChargeDate: new Date(nextChargeDate).toISOString(),
      }),
    onSuccess: () => {
      setServiceName("");
      setAmount("");
      setNextChargeDate("");
      queryClient.invalidateQueries({ queryKey: ["finance-subscriptions"] });
    },
  });

  const deleteSubscription = useMutation({
    mutationFn: (id: string) => deleteWithUndo(`/finance/subscriptions/${id}`, "finance_subscription", id, "Subscription"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-subscriptions"] }),
  });

  const updateSubscription = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<{ serviceName: string; amount: number }>) =>
      apiPatch(`/finance/subscriptions/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-subscriptions"] }),
  });

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Subscriptions</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (accountId && serviceName.trim() && amount && nextChargeDate) createSubscription.mutate();
        }}
        className="grid gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Service">
            <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="e.g. Netflix" />
          </Field>
          <Field label="Charged to">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Amount ($)">
            <Input type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Billing cycle">
            <Select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}>
              {BILLING_CYCLES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next charge" className="col-span-2 sm:col-span-1">
            <Input type="date" value={nextChargeDate} onChange={(e) => setNextChargeDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit">Add Subscription</Button>
        </div>
      </form>
      <ul className="space-y-1.5">
        {subscriptions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
            <span>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                <InlineEditText value={s.serviceName} onSave={(serviceName) => updateSubscription.mutate({ id: s.id, serviceName })} />
              </span>{" "}
              <span className="text-slate-600 dark:text-slate-400">
                · $
                <InlineEditText
                  value={Number(s.amount).toFixed(2)}
                  onSave={(v) => !Number.isNaN(Number(v)) && updateSubscription.mutate({ id: s.id, amount: Number(v) })}
                  className="!w-14 !inline"
                />
                /{s.billingCycle} · next {formatDateOnly(s.nextChargeDate, { month: "short", day: "numeric" })} · {s.account.name}
              </span>
            </span>
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
                      if (await confirm(`Move "${s.serviceName}" to Trash? You can restore it within 30 days.`)) deleteSubscription.mutate(s.id);
                    }, 0)
                  }
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
        {subscriptions.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-sm">No subscriptions tracked yet.</p>}
      </ul>
      {dialog}
    </section>
  );
}

export default function FinancePage() {
  const accountsQuery = useQuery({ queryKey: ["finance-accounts"], queryFn: () => apiGet<Account[]>("/finance/accounts") });
  const transactionsQuery = useQuery({ queryKey: ["finance-transactions"], queryFn: () => apiGet<Transaction[]>("/finance/transactions") });
  const categoriesQuery = useQuery({ queryKey: ["finance-categories"], queryFn: () => apiGet<Category[]>("/finance/categories") });
  const subscriptionsQuery = useQuery({ queryKey: ["finance-subscriptions"], queryFn: () => apiGet<Subscription[]>("/finance/subscriptions") });

  const accounts = accountsQuery.data?.data ?? [];
  const transactions = transactionsQuery.data?.data ?? [];
  const categories = categoriesQuery.data?.data ?? [];
  const subscriptions = subscriptionsQuery.data?.data ?? [];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Finance</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Bank/credit card/Venmo/PayPal/Wise/Cash App tracking — manual entry only for now. Categorization stays fully local
          (rules or Ollama, never Claude) once statement parsing is built on top of this. Investment/retirement balances live
          on the separate Investments page.
        </p>
      </div>
      <AccountsSection accounts={accounts} />
      <CategoriesSection categories={categories} />
      <TransactionsSection transactions={transactions} accounts={accounts} categories={categories} />
      <SubscriptionsSection subscriptions={subscriptions} accounts={accounts} />
    </div>
  );
}
