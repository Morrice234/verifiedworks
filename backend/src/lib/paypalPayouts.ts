import { createHash } from "node:crypto";
import {
  fetchPayPalToken,
  getPayPalConfig,
  paypalBaseUrl,
  centsToAmount,
} from "./settings";

export type PayoutSubmission =
  | {
      status: "accepted";
      batchId: string;
      paypalStatus: string;
    }
  | {
      status: "rejected" | "unknown";
      detail: string;
    };

/**
 * Submit one withdrawal as one PayPal payout batch.
 *
 * This initial implementation deliberately permits Sandbox only.
 * Network failures are treated as unknown because PayPal might
 * have received the request even when the response was lost.
 */
export async function submitPayPalPayout(input: {
  withdrawalId: string;
  destination: string;
  amountCents: number;
}): Promise<PayoutSubmission> {
  const cfg = await getPayPalConfig();

  if (!cfg) {
    return {
      status: "rejected",
      detail: "PayPal is not configured.",
    };
  }

  if (cfg.mode !== "sandbox") {
    return {
      status: "rejected",
      detail: "Automated payouts are currently restricted to Sandbox.",
    };
  }

  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.destination)
  ) {
    return {
      status: "rejected",
      detail: "The payout amount or destination is invalid.",
    };
  }

  let token: string;

  try {
    token = await fetchPayPalToken(cfg);
  } catch {
    return {
      status: "rejected",
      detail: "Could not authenticate with PayPal Sandbox.",
    };
  }

  // Deterministic batch ID: a retry for this withdrawal uses the same ID.
  const senderBatchId =
    "VW-" +
    createHash("sha256")
      .update(input.withdrawalId)
      .digest("hex")
      .slice(0, 24);

  let response: Response;

  try {
    response = await fetch(
      `${paypalBaseUrl(cfg.mode)}/v1/payments/payouts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender_batch_header: {
            sender_batch_id: senderBatchId,
            email_subject: "Your CaptchaLab payout",
            email_message:
              "A CaptchaLab payout has been submitted. Its status may still be pending.",
          },
          items: [
            {
              recipient_type: "EMAIL",
              amount: {
                value: centsToAmount(input.amountCents),
                currency: "USD",
              },
              receiver: input.destination,
              sender_item_id: input.withdrawalId,
              note: "CaptchaLab withdrawal",
            },
          ],
        }),
      },
    );
  } catch {
    return {
      status: "unknown",
      detail:
        "PayPal's response could not be confirmed. Keep the funds reserved and reconcile this batch before retrying.",
    };
  }

  const data: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    const issue = String(data?.name ?? "");

    // A duplicate batch ID can mean an earlier attempt already reached PayPal.
    if (
      issue === "DUPLICATE_BATCH_ID" ||
      response.status >= 500
    ) {
      return {
        status: "unknown",
        detail:
          "PayPal could not confirm whether this batch was accepted. Keep the funds reserved and reconcile before retrying.",
      };
    }

    return {
      status: "rejected",
      detail: "PayPal rejected the payout request.",
    };
  }

  const batchId = data?.batch_header?.payout_batch_id;
  const paypalStatus = data?.batch_header?.batch_status;

  if (
    typeof batchId !== "string" ||
    typeof paypalStatus !== "string"
  ) {
    return {
      status: "unknown",
      detail:
        "PayPal returned an incomplete response. Keep the funds reserved and reconcile before retrying.",
    };
  }

  return {
    status: "accepted",
    batchId,
    paypalStatus,
  };
}

export type PayoutStatusResult =
  | {
      status: "checked";
      batchStatus: string;
      itemStatus: string | null;
    }
  | {
      status: "unknown";
      detail: string;
    };

/**
 * Retrieve the current status of a previously submitted PayPal payout.
 * This function does not submit a new payout or change the wallet balance.
 */
export async function getPayPalPayoutStatus(
  batchId: string,
): Promise<PayoutStatusResult> {
  if (!batchId.trim()) {
    return {
      status: "unknown",
      detail: "A PayPal payout batch ID is required.",
    };
  }

  const cfg = await getPayPalConfig();

  if (!cfg || cfg.mode !== "sandbox") {
    return {
      status: "unknown",
      detail: "PayPal Sandbox configuration is unavailable.",
    };
  }

  try {
    const token = await fetchPayPalToken(cfg);

    const response = await fetch(
      `${paypalBaseUrl(cfg.mode)}/v1/payments/payouts/${encodeURIComponent(batchId)}?page=1&page_size=100`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      return {
        status: "unknown",
        detail: `PayPal status lookup failed with HTTP ${response.status}.`,
      };
    }

    const data: any = await response.json();

    const batchStatus = data?.batch_header?.batch_status;

    if (typeof batchStatus !== "string") {
      return {
        status: "unknown",
        detail: "PayPal returned no valid batch status.",
      };
    }

    const items = Array.isArray(data?.items) ? data.items : [];

    // This implementation submits one recipient per batch.
    const itemStatus =
      items.length === 1 &&
      typeof items[0]?.transaction_status === "string"
        ? items[0].transaction_status
        : null;

    return {
      status: "checked",
      batchStatus,
      itemStatus,
    };
  } catch {
    return {
      status: "unknown",
      detail: "Could not retrieve the payout status from PayPal.",
    };
  }
}