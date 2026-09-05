// Sends an owner a one-time sign-in link by email, using Resend for
// delivery instead of Supabase's built-in mailer (chosen so the site can
// handle real submission volume without hitting Supabase's low free-tier
// email rate limit).
//
// Security note: this endpoint always returns the same generic response
// regardless of whether the submitted email belongs to a known owner.
// Returning a different response for "found" vs "not found" would let
// anyone enumerate the real owner list by trying emails one at a time.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://thestableca.github.io/yearling-sales/prototype_v3/";
// Resend's sandbox sending address — works without a verified domain, but
// (per Resend's own restriction) can only deliver to the email address that
// owns this Resend account, not to arbitrary owners. Switch to a
// @thestable.ca address once that domain is verified in Resend.
const FROM_ADDRESS = Deno.env.get("RESEND_FROM_ADDRESS") ?? "TheStable.ca <onboarding@resend.dev>";

const GENERIC_RESPONSE = {
  message: "If that email is on file, a sign-in link has been sent.",
};

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const email = (body as { email?: unknown })?.email;
    if (!isValidEmail(email)) {
      return Response.json({ error: "A valid email is required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up (or silently create) the owner record. Every real owner is
    // expected to already exist in `owners` (imported from TheStable's
    // roster) — auto-creating here means a first-time visitor typing their
    // own email still gets a working link rather than a dead end, while
    // still recording them for Anthony to see as an "unmatched" submitter.
    const { data: existingOwner } = await ctx.supabaseAdmin
      .from("owners")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!existingOwner) {
      await ctx.supabaseAdmin
        .from("owners")
        .insert({ name: "", email: normalizedEmail })
        .select("id")
        .maybeSingle();
    }

    // Generate a real, server-signed one-time link via Supabase Auth. This
    // does not send an email itself — magiclink generation only issues the
    // token; delivery is handled separately below via Resend.
    const { data: linkData, error: linkError } = await ctx.supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: { redirectTo: SITE_URL },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("generateLink failed:", linkError?.message);
      // Still return the generic response — never leak whether this step
      // succeeded, since that would itself be an enumeration signal.
      return Response.json(GENERIC_RESPONSE);
    }

    const actionLink = linkData.properties.action_link;

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return Response.json(GENERIC_RESPONSE);
    }

    const emailHtml = `
      <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a2a4a;">Sign in to your Yearling Sale intake</h2>
        <p>Click the button below to open your 2026 Yearling Sale intake form. This link is valid for one use and expires shortly.</p>
        <p style="margin: 32px 0;">
          <a href="${actionLink}" style="background: #1a2a4a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Open my intake form</a>
        </p>
        <p style="color: #666; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `;

    try {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [normalizedEmail],
          subject: "Your TheStable.ca sign-in link",
          html: emailHtml,
        }),
      });

      if (!resendResponse.ok) {
        const errText = await resendResponse.text();
        console.error("Resend send failed:", resendResponse.status, errText);
      }
    } catch (err) {
      console.error("Resend request threw:", err instanceof Error ? err.message : err);
    }

    return Response.json(GENERIC_RESPONSE);
  }),
};
