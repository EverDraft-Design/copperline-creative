const RESEND_API_URL = "https://api.resend.com/emails";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEAD_SOURCE_LABELS = {
  "/": "Main website",
  "/flyer/": "Flyer landing page",
  "/faq/": "FAQ page",
};

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
  const pagePath = normalisePagePath(payload.pagePath || payload.path || "");

  return {
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim(),
    phone: String(payload.phone || "").trim(),
    businessName: String(payload.businessName || payload["business-name"] || "").trim(),
    projectType: Array.isArray(payload.projectType)
      ? payload.projectType.map((value) => String(value).trim()).filter(Boolean)
      : String(payload.projectType || "").trim(),
    message: String(payload.message || "").trim(),
    leadSource: String(payload.leadSource || payload.sourceLabel || "").trim() || getLeadSourceLabel(pagePath),
    pagePath,
    ctaLabel: String(payload.ctaLabel || payload.ctaSource || "").trim(),
    company: String(payload.company || "").trim(),
  };
}

function normalisePagePath(value) {
  const rawPath = String(value || "").trim();

  if (!rawPath) {
    return "";
  }

  try {
    const url = rawPath.startsWith("http")
      ? new URL(rawPath)
      : new URL(rawPath, "https://copperline-creative.com.au");
    return url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  } catch {
    return rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  }
}

function getLeadSourceLabel(pagePath) {
  return LEAD_SOURCE_LABELS[pagePath] || "Copperline Creative website";
}

function getFallbackPagePath(request) {
  const referer = request.headers.get("Referer") || request.headers.get("Referrer") || "";
  return normalisePagePath(referer);
}

async function parseContactPayload(request) {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  }

  return request.json();
}

function getEnvironmentStatus(env) {
  return {
    RESEND_API_KEY: Boolean(env.RESEND_API_KEY),
    CONTACT_TO_EMAIL: Boolean(env.CONTACT_TO_EMAIL),
    CONTACT_FROM_EMAIL: Boolean(env.CONTACT_FROM_EMAIL),
  };
}

function getMissingEnvironmentKeys(environmentStatus) {
  return Object.entries(environmentStatus)
    .filter(([, configured]) => !configured)
    .map(([key]) => key);
}

function buildEmailHtml(fields) {
  const businessLine = fields.businessName
    ? `<p><strong>Business name:</strong> ${escapeHtml(fields.businessName)}</p>`
    : "";
  const phoneLine = fields.phone
    ? `<p><strong>Phone:</strong> ${escapeHtml(fields.phone)}</p>`
    : "";
  const projectType = Array.isArray(fields.projectType)
    ? fields.projectType.join(", ")
    : fields.projectType;
  const projectTypeLine = projectType
    ? `<p><strong>Project type:</strong> ${escapeHtml(projectType)}</p>`
    : "";
  const leadSource = fields.leadSource || getLeadSourceLabel(fields.pagePath);
  const pagePath = fields.pagePath || "";
  const pagePathLine = pagePath
    ? `<p><strong>Page path:</strong> ${escapeHtml(pagePath)}</p>`
    : "";
  const ctaLine = fields.ctaLabel
    ? `<p><strong>CTA:</strong> ${escapeHtml(fields.ctaLabel)}</p>`
    : "";

  return `
    <h1>New Copperline Creative enquiry</h1>
    <p><strong>Name:</strong> ${escapeHtml(fields.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(fields.email)}</p>
    ${phoneLine}
    ${businessLine}
    ${projectTypeLine}
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(fields.message).replaceAll("\n", "<br>")}</p>
    <hr>
    <p><strong>Submitted from:</strong> ${escapeHtml(leadSource)}</p>
    ${pagePathLine}
    ${ctaLine}
  `;
}

async function handleContactRequest(request, env) {
  let payload;

  try {
    payload = await parseContactPayload(request);
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "Invalid request body.",
        code: "INVALID_BODY",
      },
      400,
    );
  }

  const fields = normalisePayload({
    ...payload,
    pagePath: payload.pagePath || payload.path || getFallbackPagePath(request),
  });

  if (fields.company) {
    return jsonResponse({ ok: true });
  }

  if (!fields.name || !fields.email || !fields.message) {
    return jsonResponse(
      {
        ok: false,
        error: "Name, email, and message are required.",
        code: "INVALID_REQUEST",
      },
      400,
    );
  }

  if (!EMAIL_PATTERN.test(fields.email)) {
    return jsonResponse(
      {
        ok: false,
        error: "Please provide a valid email address.",
        code: "INVALID_EMAIL",
      },
      400,
    );
  }

  const environmentStatus = getEnvironmentStatus(env);
  const missingEnvironmentKeys = getMissingEnvironmentKeys(environmentStatus);

  console.log("Copperline contact form environment status", environmentStatus);

  if (missingEnvironmentKeys.length > 0) {
    return jsonResponse(
      {
        ok: false,
        error: "Contact form email is not configured.",
        code: "MISSING_ENV",
        missing: missingEnvironmentKeys,
      },
      500,
    );
  }

  let resendResponse;
  const resendPayload = {
    from: `Copperline Creative <${env.CONTACT_FROM_EMAIL}>`,
    to: [env.CONTACT_TO_EMAIL],
    reply_to: fields.email,
    subject: `New Copperline Creative enquiry from ${fields.name}`,
    html: buildEmailHtml(fields),
  };

  try {
    resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "copperline-creative-pages-function",
      },
      body: JSON.stringify(resendPayload),
    });
  } catch (error) {
    console.error("Resend fetch failed", {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(
      {
        ok: false,
        error: "Unable to reach Resend.",
        code: "RESEND_FETCH_FAILED",
      },
      502,
    );
  }

  const resendResponseBody = await resendResponse.text();

  if (!resendResponse.ok) {
    console.error("Resend email send failed", {
      status: resendResponse.status,
      body: resendResponseBody,
    });

    return jsonResponse(
      {
        ok: false,
        error: "Resend rejected the email request.",
        code: "RESEND_ERROR",
        resendStatus: resendResponse.status,
        resendBody: resendResponseBody,
      },
      502,
    );
  }

  return jsonResponse({ ok: true });
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error: "Method not allowed.",
        code: "METHOD_NOT_ALLOWED",
      },
      405,
    );
  }

  return handleContactRequest(request, env);
}
