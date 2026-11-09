import { createClient } from "npm:@supabase/supabase-js@2.95.0";

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

async function validPaypackSignature(rawBody: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return safeEqual(expected, signature);
}

function normalizePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("250")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

Deno.serve(async (req: Request) => {
  // Paypack pings the webhook with HEAD before sending events.
  if (req.method === "HEAD") return new Response(null, { status: 200 });
  if (req.method === "OPTIONS") return new Response("ok", { status: 204 });
  if (req.method !== "POST") return response(405, { success: false, message: "Method not allowed." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("PAYPACK_WEBHOOK_SIGN_KEY");

  if (!supabaseUrl || !serviceKey || !webhookSecret) {
    console.error("Paypack webhook environment is incomplete.");
    return response(500, { success: false, message: "Webhook is not configured." });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("X-Paypack-Signature") || "";
  if (!signature || !(await validPaypackSignature(rawBody, signature, webhookSecret))) {
    return response(401, { success: false, message: "Invalid webhook signature." });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return response(400, { success: false, message: "Invalid webhook payload." });
  }

  if (event?.kind !== "transaction:processed" || event?.data?.kind !== "CASHIN") {
    return response(200, { success: true, ignored: true });
  }

  const transaction = event.data;
  const reference = typeof transaction.ref === "string" ? transaction.ref : "";
  if (!reference) return response(400, { success: false, message: "Missing transaction reference." });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: payment, error: paymentError } = await admin
    .from("vip_payments")
    .select("id,user_id,plan_id,amount_rwf,payment_method,phone_number,status,provider_reference")
    .eq("provider", "paypack")
    .eq("provider_reference", reference)
    .maybeSingle();

  if (paymentError) {
    console.error("Payment lookup failed:", paymentError.message);
    return response(500, { success: false, message: "Unable to locate payment." });
  }
  if (!payment) return response(404, { success: false, message: "Payment reference not found." });

  const receivedAmount = Number(transaction.amount);
  const expectedAmount = Number(payment.amount_rwf);
  if (!Number.isFinite(receivedAmount) || receivedAmount !== expectedAmount) {
    console.error("Paypack amount mismatch for payment:", payment.id);
    return response(409, { success: false, message: "Payment amount does not match." });
  }

  if (normalizePhone(transaction.client) !== normalizePhone(payment.phone_number)) {
    console.error("Paypack payer mismatch for payment:", payment.id);
    return response(409, { success: false, message: "Payer number does not match." });
  }

  const receivedProvider = String(transaction.provider || "").toLowerCase();
  if (receivedProvider !== payment.payment_method) {
    console.error("Paypack network mismatch for payment:", payment.id);
    return response(409, { success: false, message: "Payment network does not match." });
  }

  const transactionStatus = String(transaction.status || "").toLowerCase();
  if (transactionStatus === "failed") {
    if (payment.status === "pending" || payment.status === "processing") {
      const { error } = await admin.from("vip_payments")
        .update({ status: "failed" })
        .eq("id", payment.id)
        .in("status", ["pending", "processing"]);
      if (error) throw error;
    }
    return response(200, { success: true, status: "failed" });
  }

  if (transactionStatus !== "successful" && transactionStatus !== "success") return response(400, { success: false, message: "Unsupported transaction status." });
  if (payment.status === "failed" || payment.status === "cancelled") {
    return response(409, { success: false, message: "This payment is no longer eligible for activation." });
  }

  if (payment.status !== "paid") {
    const { error: paidError } = await admin.from("vip_payments")
      .update({ status: "paid", paid_at: new Date().toISOString(), provider_transaction_id: reference })
      .eq("id", payment.id)
      .in("status", ["pending", "processing"]);
    if (paidError) throw paidError;
  }

  // The unique payment_id makes activation idempotent across duplicate webhook deliveries.
  const { data: existingSubscription, error: subscriptionLookupError } = await admin
    .from("vip_subscriptions")
    .select("id")
    .eq("payment_id", payment.id)
    .maybeSingle();

  if (subscriptionLookupError) throw subscriptionLookupError;

  if (!existingSubscription) {
    const { data: plan, error: planError } = await admin
      .from("vip_plans")
      .select("duration_days")
      .eq("id", payment.plan_id)
      .maybeSingle();

    if (planError) throw planError;
    if (!plan || !Number.isInteger(plan.duration_days) || plan.duration_days < 1) {
      throw new Error("VIP plan duration is unavailable.");
    }

    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

    const { error: insertSubscriptionError } = await admin
      .from("vip_subscriptions")
      .insert({
        user_id: payment.user_id,
        plan_id: payment.plan_id,
        payment_id: payment.id,
        status: "active",
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

    if (insertSubscriptionError) {
      // A concurrent duplicate webhook may have inserted it first; confirm before failing.
      const { data: racedSubscription } = await admin
        .from("vip_subscriptions")
        .select("id")
        .eq("payment_id", payment.id)
        .maybeSingle();
      if (!racedSubscription) throw insertSubscriptionError;
    }
  }

  return response(200, { success: true, status: "paid", vip_activated: true });
});
