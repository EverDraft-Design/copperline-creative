const RESEND_API_URL = "https://api.resend.com/emails";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalisePayload(payload) {
  return {
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim(),
    businessName: String(payload.businessName || payload["business-name"] || "").trim(),
    message: String(payload.message || "").trim(),
    company: String(payload.company || "").trim(),
  };
}

async function parseContactPayload(request) {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data") ||
    contentType.includes("text/plain")
  ) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  }

  return request.json();
}

function getEmailConfig(env) {
  return {
    apiKey: env.RESEND_API_KEY,
    toEmail: env.COPPERLINE_CONTACT_TO_EMAIL || env.CONTACT_TO_EMAIL,
    fromEmail: env.COPPERLINE_CONTACT_FROM_EMAIL || env.CONTACT_FROM_EMAIL,
  };
}

function buildEmailHtml(fields) {
  const businessLine = fields.businessName
    ? `<p><strong>Business name:</strong> ${escapeHtml(fields.businessName)}</p>`
    : "";

  return `
    <h1>New Copperline Creative enquiry</h1>
    <p><strong>Name:</strong> ${escapeHtml(fields.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(fields.email)}</p>
    ${businessLine}
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(fields.message).replaceAll("\n", "<br />")}</p>
    <hr />
    <p>Submitted from copperline-creative.com.au/flyer/</p>
  `;
}

async function handleContactRequest(request, env) {
  let payload;

  try {
    payload = await parseContactPayload(request);
  } catch {
    return jsonResponse({ error: "Invalid request body.", code: "INVALID_BODY" }, 400);
  }

  const fields = normalisePayload(payload);

  if (fields.company) {
    return jsonResponse({ ok: true });
  }

  if (!fields.name || !fields.email || !fields.message) {
    return jsonResponse({ error: "Name, email, and message are required.", code: "INVALID_REQUEST" }, 400);
  }

  if (!EMAIL_PATTERN.test(fields.email)) {
    return jsonResponse({ error: "Please provide a valid email address.", code: "INVALID_REQUEST" }, 400);
  }

  const emailConfig = getEmailConfig(env);
  const environmentStatus = {
    RESEND_API_KEY: Boolean(emailConfig.apiKey),
    COPPERLINE_CONTACT_TO_EMAIL: Boolean(emailConfig.toEmail),
    COPPERLINE_CONTACT_FROM_EMAIL: Boolean(emailConfig.fromEmail),
  };

  console.log("Copperline contact form environment status", environmentStatus);

  if (!environmentStatus.RESEND_API_KEY || !environmentStatus.COPPERLINE_CONTACT_TO_EMAIL || !environmentStatus.COPPERLINE_CONTACT_FROM_EMAIL) {
    return jsonResponse({ error: "Contact form email is not configured.", code: "MISSING_ENV" }, 500);
  }

  let resendResponse;

  try {
    resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emailConfig.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "copperline-creative-worker",
      },
      body: JSON.stringify({
        from: `Copperline Creative <${emailConfig.fromEmail}>`,
        to: [emailConfig.toEmail],
        reply_to: fields.email,
        subject: `New Copperline Creative enquiry from ${fields.name}`,
        html: buildEmailHtml(fields),
      }),
    });
  } catch (error) {
    console.error("Resend fetch failed", {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse({ error: "Unable to send message.", code: "RESEND_FETCH_FAILED" }, 502);
  }

  const resendResponseBody = await resendResponse.text();

  if (!resendResponse.ok) {
    console.error("Resend email send failed", {
      status: resendResponse.status,
      body: resendResponseBody,
    });

    return jsonResponse({ error: "Unable to send message.", code: "RESEND_ERROR" }, 502);
  }

  return jsonResponse({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      return handleContactRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
