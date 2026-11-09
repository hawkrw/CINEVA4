import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function normalizeRwandaPhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/\D/g, "");
  const local = digits.startsWith("250") ? "0" + digits.slice(3) : digits;
  return /^07[2389]\d{7}$/.test(local) ? local : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { success: false, message: "Method not allowed." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const paypackClientId = Deno.env.get("PAYPACK_CLIENT_ID");
  const paypackClientSecret = Deno.env.get("PAYPACK_CLIENT_SECRET");

  if (!supabaseUrl || !serviceKey) return reply(500, { success: false, message: "Server configuration is incomplete." });
  if (!paypackClientId || !paypackClientSecret) return reply(503, { success: false, message: "Mobile money payments are not configured yet." });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { success: false, message: "Please sign in to continue." });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let paymentId: string | null = null;

  try {
    const token = authorization.slice(7).trim();
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return reply(401, { success: false, message: "Your session is invalid. Please sign in again." });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return reply(400, { success: false, message: "Invalid payment request." });

    const planId = typeof body.plan_id === "string" ? body.plan_id : "";
    const paymentMethod = body.payment_method;
    const phoneNumber = normalizeRwandaPhone(body.phone_number);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(planId)) {
      return reply(400, { success: false, message: "Choose a valid VIP plan." });
    }
    if (paymentMethod !== "mtn" && paymentMethod !== "airtel") return reply(400, { success: false, message: "Choose MTN or Airtel Money." });
    if (!phoneNumber) return reply(400, { success: false, message: "Enter a valid Rwandan mobile money number." });

    const { data: plan, error: planError } = await admin
      .from("vip_plans")
      .select("id, name, duration_days, price_rwf")
      .eq("id", planId)
      .eq("is_active", true)
      .maybeSingle();

    if (planError) throw planError;
    if (!plan) return reply(404, { success: false, message: "This VIP plan is unavailable." });

    const amount = Number(plan.price_rwf);
    if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isInteger(plan.duration_days) || plan.duration_days < 1) {
      return reply(500, { success: false, message: "The selected VIP plan has invalid pricing." });
    }

    const { data: payment, error: insertError } = await admin
      .from("vip_payments")
      .insert({
        user_id: userData.user.id,
        plan_id: plan.id,
        amount_rwf: amount,
        currency: "RWF",
        payment_method: paymentMethod,
        provider: "paypack",
        phone_number: phoneNumber,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;
    paymentId = payment.id;

    const authResponse = await fetch("https://payments.paypack.rw/api/auth/agents/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: paypackClientId, client_secret: paypackClientSecret }),
      signal: AbortSignal.timeout(15000),
    });
    const authPayload = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || typeof authPayload.access !== "string") throw new Error("The payment provider could not authorize this request.");

    const webhookMode = Deno.env.get("PAYPACK_WEBHOOK_MODE") || "production";
    const cashinResponse = await fetch("https://payments.paypack.rw/api/transactions/cashin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + authPayload.access,
        "Idempotency-Key": payment.id.replaceAll("-", "").slice(0, 32),
        "X-Webhook-Mode": webhookMode,
      },
      body: JSON.stringify({ amount, number: phoneNumber }),
      signal: AbortSignal.timeout(20000),
    });
    const cashinPayload = await cashinResponse.json().catch(() => ({}));
    if (!cashinResponse.ok || typeof cashinPayload.ref !== "string") throw new Error("Paypack could not start the mobile money request.");

    const { error: updateError } = await admin
      .from("vip_payments")
      .update({ provider_reference: cashinPayload.ref, status: "processing" })
      .eq("id", payment.id);

    if (updateError) {
      console.error("Payment reference save failed:", updateError.message);
      return reply(502, {
        success: false,
        payment_id: payment.id,
        message: "The provider started a request, but CINEVA could not save its reference. Contact support before trying again.",
      });
    }

    return reply(200, {
      success: true,
      payment_id: payment.id,
      status: "processing",
      amount_rwf: amount,
      currency: "RWF",
      plan_name: plan.name,
      message: "Payment request sent. Approve the mobile money prompt on your phone. VIP activates after payment verification.",
    });
  } catch (error) {
    console.error("VIP payment initiation failed:", error instanceof Error ? error.message : "Unknown error");
    if (paymentId) {
      await admin.from("vip_payments").update({ status: "failed" }).eq("id", paymentId).eq("status", "pending");
    }
    return reply(502, {
      success: false,
      message: error instanceof Error ? error.message : "Unable to start the payment. Please try again.",
    });
  }
});
