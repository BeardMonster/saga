import type { PrismaClient } from "@prisma/client";

// Single-tenant app — there is exactly one user, and the network boundary
// (Tailscale-only reachability) is what actually gates access, not a login
// screen. This just resolves "the" user for every request rather than
// hardcoding an id. Revisit if a second real user is ever needed.
let cachedUserId: string | null = null;

export async function getCurrentUserId(prisma: PrismaClient): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const user = await prisma.user.findFirst();
  if (!user) {
    throw new Error("No user found — run `npx prisma db seed` first.");
  }

  cachedUserId = user.id;
  return user.id;
}
