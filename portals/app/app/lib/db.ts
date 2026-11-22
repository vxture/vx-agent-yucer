import type { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";

// A business execution and its receipt must commit together. Domain stores
// continue acquiring their normal client, scoped to this one transaction.
const domainTransaction = new AsyncLocalStorage<PrismaClient>();

export async function withDomainTransaction<T>(
  work: () => Promise<T>,
): Promise<T> {
  if (domainTransaction.getStore()) return work();
  const client = await getPrismaClient();
  const attempt = async () => {
    let firstDatabaseError: unknown;
    try {
      return await client.$transaction(
        async (tx) => {
          const delegates = new Map<PropertyKey, unknown>();
          const invoke =
            (target: object, method: (...args: unknown[]) => unknown) =>
            async (...args: unknown[]) => {
              try {
                return await method.apply(target, args);
              } catch (error) {
                firstDatabaseError ??= error;
                throw error;
              }
            };
          const scoped = new Proxy(tx, {
            get(target, key) {
              if (key === "$transaction")
                return (callback: unknown) => {
                  if (typeof callback !== "function")
                    throw new Error("nested_batch_transaction_denied");
                  return callback(scoped);
                };
              if (["$connect", "$disconnect", "$extends"].includes(String(key)))
                return () => {
                  throw new Error("transaction_client_operation_denied");
                };
              const value = Reflect.get(target, key);
              if (typeof value === "function") return invoke(target, value);
              if (value && typeof value === "object") {
                if (!delegates.has(key))
                  delegates.set(
                    key,
                    new Proxy(value, {
                      get(delegate, property) {
                        const member = Reflect.get(delegate, property);
                        return typeof member === "function"
                          ? invoke(delegate, member)
                          : member;
                      },
                    }),
                  );
                return delegates.get(key);
              }
              return value;
            },
          }) as unknown as PrismaClient;
          const result = await domainTransaction.run(scoped, work);
          if (firstDatabaseError) throw firstDatabaseError;
          return result;
        },
        { isolationLevel: "Serializable", timeout: 25000, maxWait: 5000 },
      );
    } catch (error) {
      // A domain's collision handler may have observed a later 25P02 after
      // PostgreSQL aborted the transaction. Keep the original database cause.
      throw firstDatabaseError ?? error;
    }
  };
  for (let count = 0; ; count++) {
    try {
      return await attempt();
    } catch (error) {
      const e = error as { code?: string; meta?: { code?: string } };
      // Only a known PostgreSQL serialization rollback can repeat. Unknown
      // commit outcomes are recovered through receipts, never resubmitted.
      if (count >= 3 || !(e.code === "P2034" || hasSerializationCode(error))) throw error;
    }
  }
}
export function inDomainTransaction(): boolean {
  return !!domainTransaction.getStore();
}

// Prisma client singleton with the pg driver adapter (Prisma 7, Rust-free). The
// import is DYNAMIC so the offline/in-memory path never loads @prisma/client -
// only a DATABASE_URL-configured runtime pulls it in. The DDL owns structure;
// Prisma is the client only and never migrates (no migrations dir).

let clientPromise: Promise<PrismaClient> | null = null;

export function utcConnectionString(value: string): string {
  const url = new URL(value);
  const options = url.searchParams.get("options");
  // adapter-pg normalizes timestamptz assuming the PG session returns UTC.
  // Preserve deployment options while ensuring both reads and writes agree.
  url.searchParams.set(
    "options",
    `${options ? `${options} ` : ""}-c timezone=UTC`,
  );
  return url.toString();
}

export function prismaEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function getPrismaClient(): Promise<PrismaClient> {
  const transaction = domainTransaction.getStore();
  if (transaction) return transaction;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { PrismaClient } = await import("@prisma/client");
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const adapter = new PrismaPg({
        connectionString: utcConnectionString(process.env.DATABASE_URL!),
      });
      return new PrismaClient({ adapter });
    })();
  }
  return clientPromise;
}

function hasSerializationCode(value:unknown,depth=0):boolean {
  if(!value||typeof value!=="object"||depth>6)return false;
  const v=value as Record<string,unknown>;
  if([v.code,v.sqlState,v.originalCode].includes("40001"))return true;
  return ["meta","cause","originalError","driverAdapterError"].some(k=>hasSerializationCode(v[k],depth+1));
}
