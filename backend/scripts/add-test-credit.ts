
import prisma from "../src/config/database";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test credits are disabled in production.");
  }

  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  if (users.length === 0) {
    console.log("No registered users found.");
    return;
  }

  console.log("\nRegistered accounts:");
  for (const user of users) {
    console.log(`${user.username} (${user.email})`);
  }

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const username = (
      await rl.question("\nEnter your exact username: ")
    ).trim();

    const user = users.find((item) => item.username === username);

    if (!user) {
      console.log("Username not found. No credit added.");
      return;
    }

    const idempotencyKey = `dev-test-credit-${user.id}`;

    const existing = await prisma.walletLedgerEntry.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      console.log("Test credit was already added. No duplicate created.");
      return;
    }

    await prisma.walletLedgerEntry.create({
      data: {
        userId: user.id,
        amount: 200,
        type: "test_credit",
        sourceType: "development_test_credit",
        sourceId: "local-withdrawal-test",
        idempotencyKey,
        description: "Temporary local development test credit",
      },
    });

    console.log("Added $2.00 test credit to your account.");
    console.log("This is test data, not real money.");
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error("Test credit failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
