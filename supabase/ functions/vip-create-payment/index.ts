
import { createClient } from "npm:@supabase/supabase-js@2";

/* =========================================================
   CINEVA VIP — PAYPACK PAYMENT INITIATION
   Supabase Edge Function: vip-create-payment
========================================================= */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PAYPACK_CLIENT_ID = Deno.env.get("PAYPACK_CLIENT_ID")!;
const PAYPACK_CLIENT_SECRET = Deno.env.get("PAYPACK_CLIENT_SECRET")!;
const PAYPACK_WEBHOOK_MODE = Deno.env.get("PAYPACK_WEBHOOK_MODE") || "development";

const PAYPACK_BASE_URL = "https://payments.paypack.rw/api";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: corsHeaders
    });

/* =========================================================
   SUPABASE CLIENTS
========================================================= */

// Used only to verify the user's JWT.
const authClient = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

// Used for trusted server-side database operations.
const adminClient = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

/* =========================================================
   PHONE NUMBER NORMALIZATION
========================================================= */

function normalizeRwandaPhone(value: string): string | null {
    let phone = value.replace(/[\s-]/g, "");

    if (phone.startsWith("+250")) {
        phone = "0" + phone.slice(4);
    } else if (phone.startsWith("250")) {
        phone = "0" + phone.slice(3);
    }

    if (!/^07\d{8}$/.test(phone)) {
        return null;
    }

    return phone;
}

/* =========================================================
   VERIFY SELECTED MOBILE NETWORK
========================================================= */

function matchesOperator(phone: string, method: string): boolean {
    const prefix = phone.slice(0, 3);

    if (method === "mtn") {
        return ["078", "079"].includes(prefix);
    }

    if (method === "airtel") {
        return prefix === "073";
    }

    return false;
}

/* =========================================================
   PAYPACK AUTHENTICATION
========================================================= */

async function getPaypackToken(): Promise<string> {
    const response = await fetch(
        `${PAYPACK_BASE_URL}/auth/agents/authorize`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                client_id: PAYPACK_CLIENT_ID,
                client_secret: PAYPACK_CLIENT_SECRET
            })
        }
    );

    const result = await response.json();

    if (!response.ok || !result.access) {
        console.error("Paypack authentication failed:", response.status);

        throw new Error("Payment provider authentication failed.");
    }

    return result.access;
}

/* =========================================================
   CREATE PAYPACK CASH-IN REQUEST
========================================================= */

async function createPaypackCashin(
    token: string,
    amount: number,
    phone: string,
    paymentId: string
) {
    const idempotencyKey = paymentId.replace(/-/g, "").slice(0, 32);

    const response = await fetch(
        `${PAYPACK_BASE_URL}/transactions/cashin`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`,
                "Idempotency-Key": idempotencyKey,
                "X-Webhook-Mode": PAYPACK_WEBHOOK_MODE
            },
            body: JSON.stringify({
                amount,
                number: phone
            })
        }
    );

    const result = await response.json();

    if (!response.ok || !result.ref) {
        console.error("Paypack cashin failed:", response.status);

        throw new Error(
            "The mobile money payment request could not be created."
        );
    }

    return result;
}

/* =========================================================
   MAIN HANDLER
========================================================= */

Deno.serve(async (req: Request) => {

    // Browser CORS preflight.
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders
        });
    }

    if (req.method !== "POST") {
        return jsonResponse({
            success: false,
            message: "Method not allowed."
        }, 405);
    }

    let paymentId: string | null = null;

    try {

        /* -----------------------------------------------
           CHECK REQUIRED CONFIGURATION
        ----------------------------------------------- */

        const requiredSecrets = [
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            SUPABASE_SERVICE_ROLE_KEY,
            PAYPACK_CLIENT_ID,
            PAYPACK_CLIENT_SECRET
        ];

        if (requiredSecrets.some(value => !value)) {
            throw new Error("Payment service is not configured.");
        }

        /* -----------------------------------------------
           VERIFY USER AUTHENTICATION
        ----------------------------------------------- */

        const authorization = req.headers.get("Authorization");

        if (!authorization?.startsWith("Bearer ")) {
            return jsonResponse({
                success: false,
                message: "You must sign in before making a payment."
            }, 401);
        }

        const accessToken = authorization.slice(7);

        const {
            data: { user },
            error: authError
        } = await authClient.auth.getUser(accessToken);

        if (authError || !user) {
            return jsonResponse({
                success: false,
                message: "Your session is invalid. Please sign in again."
            }, 401);
        }

        /* -----------------------------------------------
           READ REQUEST
        ----------------------------------------------- */

        const body = await req.json();

        const planId = body?.plan_id;
        const paymentMethod = body?.payment_method;
        const suppliedPhone = body?.phone_number;

        if (!planId || !suppliedPhone || !paymentMethod) {
            return jsonResponse({
                success: false,
                message: "Plan, phone number and payment method are required."
            }, 400);
        }

        if (!["mtn", "airtel"].includes(paymentMethod)) {
            return jsonResponse({
                success: false,
                message: "Unsupported payment method."
            }, 400);
        }

        /* -----------------------------------------------
           VALIDATE PHONE
        ----------------------------------------------- */

        if (
            typeof suppliedPhone !== "string" ||
            suppliedPhone.length > 30
        ) {
            return jsonResponse({
                success: false,
                message: "Invalid phone number."
            }, 400);
        }

        const phone = normalizeRwandaPhone(suppliedPhone);

        if (!phone) {
            return jsonResponse({
                success: false,
                message: "Enter a valid Rwandan mobile number."
            }, 400);
        }

        if (!matchesOperator(phone, paymentMethod)) {
            return jsonResponse({
                success: false,
                message:
                    paymentMethod === "mtn"
                        ? "This number does not match the supported MTN prefixes."
                        : "This number does not match the supported Airtel prefix."
            }, 400);
        }

        /* -----------------------------------------------
           LOAD REAL PLAN PRICE FROM DATABASE
           Never trust the amount sent by the browser.
        ----------------------------------------------- */

        const { data: plan, error: planError } = await adminClient
            .from("vip_plans")
            .select("id, name, price_rwf, duration_days, is_active")
            .eq("id", planId)
            .eq("is_active", true)
            .single();

        if (planError || !plan) {
            return jsonResponse({
                success: false,
                message: "This membership plan is unavailable."
            }, 404);
        }

        const amount = Number(plan.price_rwf);

        if (
            !Number.isSafeInteger(amount) ||
            amount <= 0
        ) {
            throw new Error("The membership plan has an invalid price.");
        }

        /* -----------------------------------------------
           CREATE PENDING PAYMENT RECORD
        ----------------------------------------------- */

        const { data: payment, error: insertError } = await adminClient
            .from("vip_payments")
            .insert({
                user_id: user.id,
                plan_id: plan.id,
                amount_rwf: amount,
                currency: "RWF",
                payment_method: paymentMethod,
                provider: "paypack",
                phone_number: phone,
                status: "pending"
            })
            .select("id")
            .single();

        if (insertError || !payment) {
            console.error("VIP payment database error:", insertError);

            throw new Error("Could not create your payment record.");
        }

        paymentId = payment.id;

        /* -----------------------------------------------
           AUTHENTICATE PAYPACK
        ----------------------------------------------- */

        const token = await getPaypackToken();

        /* -----------------------------------------------
           INITIATE MOBILE MONEY PAYMENT
        ----------------------------------------------- */

        const providerResult = await createPaypackCashin(
            token,
            amount,
            phone,
            payment.id
        );

        /* -----------------------------------------------
           SAVE PROVIDER REFERENCE
        ----------------------------------------------- */

        const { error: updateError } = await adminClient
            .from("vip_payments")
            .update({
                provider_reference: providerResult.ref,
                status: "processing",
                updated_at: new Date().toISOString()
            })
            .eq("id", payment.id);

        if (updateError) {
            // Do not report success if the provider reference
            // could not be safely linked to the payment record.
            console.error("Could not save Paypack reference:", updateError);

            throw new Error(
                "Payment was initiated, but its reference could not be saved. Contact support before retrying."
            );
        }

        /* -----------------------------------------------
           SUCCESS
        ----------------------------------------------- */

        return jsonResponse({
            success: true,
            message:
                "Payment request sent. Check your phone and approve the mobile money prompt.",
            payment_id: payment.id,
            provider_reference: providerResult.ref,
            amount_rwf: amount,
            currency: "RWF",
            status: "processing"
        });

    } catch (error) {

        console.error("CINEVA VIP payment error:", error);

        /* -----------------------------------------------
           MARK FAILED WHEN POSSIBLE
        ----------------------------------------------- */

        if (paymentId) {
            const { error: updateError } = await adminClient
                .from("vip_payments")
                .update({
                    status: "failed",
                    updated_at: new Date().toISOString()
                })
                .eq("id", paymentId)
                .eq("status", "pending");

            if (updateError) {
                console.error(
                    "Could not update failed payment:",
                    updateError
                );
            }
        }

        return jsonResponse({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Unable to initiate payment."
        }, 500);
    }
});
