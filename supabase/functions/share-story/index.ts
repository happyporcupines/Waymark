// Waymark – share-story Edge Function
// Sends email invitations via Resend when a story is shared.
//
// Deploy:   supabase functions deploy share-story
// Secrets:  supabase secrets set RESEND_API_KEY=re_...
//
// POST body: {
//   storyTitle: string,
//   ownerName: string,
//   ownerEmail: string,
//   recipientEmails: string[]
// }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = "https://happyporcupines.github.io/Waymark/";
const FROM_EMAIL = "Waymark <noreply@waymark.app>";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: {
    storyTitle?: string;
    ownerName?: string;
    ownerEmail?: string;
    recipientEmails?: string[];
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { storyTitle, ownerName, recipientEmails } = body;

  if (!Array.isArray(recipientEmails) || recipientEmails.length === 0) {
    return new Response(JSON.stringify({ error: "recipientEmails required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!RESEND_API_KEY) {
    // Return success-ish so the frontend doesn't show an error if the key
    // hasn't been configured yet – sharing still worked, email just wasn't sent.
    console.warn("RESEND_API_KEY not set – skipping email send");
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const errors: string[] = [];

  for (const to of recipientEmails) {
    const html = `
      <p>Hi there,</p>
      <p><strong>${ownerName || "Someone"}</strong> has shared their Waymark story
         <em>"${storyTitle || "Untitled"}"</em> with you.</p>
      <p>
        <a href="${APP_URL}" style="
          display: inline-block;
          background: #a43855;
          color: white;
          padding: 10px 22px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: bold;
        ">Open in Waymark</a>
      </p>
      <p style="color:#888;font-size:0.85em;">
        Log in with the email address this invitation was sent to, then check
        the Gallery → Shared with Me tab to view the story.
      </p>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject: `${ownerName || "Someone"} shared a Waymark story with you`,
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Resend error for ${to}:`, text);
      errors.push(to);
    }
  }

  return new Response(
    JSON.stringify({ sent: recipientEmails.length - errors.length, failed: errors }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
