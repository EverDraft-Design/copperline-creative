import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { onRequest } from "../functions/api/contact.js";

const flyerHtmlPath = new URL("../Copperline Creative/flyer/index.html", import.meta.url);
const flyerScriptPath = new URL("../Copperline Creative/flyer/contact-form.js", import.meta.url);
const homeHtmlPath = new URL("../Copperline Creative/index.html", import.meta.url);
const modalScriptPath = new URL("../Copperline Creative/contact-modal.js", import.meta.url);

test("flyer contact form posts to the Pages Function endpoint", async () => {
  const html = await readFile(flyerHtmlPath, "utf8");
  const script = await readFile(flyerScriptPath, "utf8");

  assert.match(html, /class="flyer-contact-form"/);
  assert.match(html, /action="\/api\/contact"/);
  assert.match(html, /method="post"/);
  assert.match(html, /novalidate/);
  assert.match(html, /<p class="flyer-form-status" role="status" aria-live="polite"><\/p>/);
  assert.match(html, /<script src="contact-form\.js" defer><\/script>/);
  assert.match(script, /event\.preventDefault\(\)/);
  assert.match(script, /fetch\("\/api\/contact"/);
});

test("homepage contact CTAs open the modal instead of mailto navigation", async () => {
  const html = await readFile(homeHtmlPath, "utf8");
  const script = await readFile(modalScriptPath, "utf8");

  assert.match(html, /<script src="contact-modal\.js" defer><\/script>/);
  assert.match(html, /data-contact-modal/);
  assert.match(html, /data-contact-modal-open/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /name="phone"/);
  assert.match(html, /name="projectType"/);
  assert.match(html, /Get in touch &rarr;<\/a>/);
  assert.doesNotMatch(html, /<a class="button" href="mailto:hello@copperline-creative\.com\.au">Get in touch/);
  assert.match(script, /fetch\("\/api\/contact"/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /window\.location\.hash === "#contact-modal"/);
  assert.match(script, /projectType/);
});

function callContactFunction(request, env = {}) {
  return onRequest({ request, env });
}

test("POST /api/contact sends a Copperline enquiry through Resend", async () => {
  const originalFetch = globalThis.fetch;
  let resendRequest;

  globalThis.fetch = async (url, options) => {
    resendRequest = { url, options };
    return new Response(null, { status: 200 });
  };

  try {
    const request = new Request("https://example.com/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Person",
        email: "test@example.com",
        phone: "0432 000 000",
        businessName: "Test Studio",
        projectType: ["Website", "Copywriting"],
        message: "Hello from the flyer",
      }),
    });

    const response = await callContactFunction(request, {
      RESEND_API_KEY: "secret",
      CONTACT_TO_EMAIL: "hello@copperline-creative.com.au",
      CONTACT_FROM_EMAIL: "hello@copperline-creative.com.au",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(resendRequest.url, "https://api.resend.com/emails");
    assert.equal(resendRequest.options.method, "POST");

    const resendPayload = JSON.parse(resendRequest.options.body);
    assert.equal(resendPayload.from, "Copperline Creative <hello@copperline-creative.com.au>");
    assert.deepEqual(resendPayload.to, ["hello@copperline-creative.com.au"]);
    assert.equal(resendPayload.reply_to, "test@example.com");
    assert.equal(resendPayload.subject, "New Copperline Creative enquiry from Test Person");
    assert.match(resendPayload.html, /0432 000 000/);
    assert.match(resendPayload.html, /Test Studio/);
    assert.match(resendPayload.html, /Website, Copywriting/);
    assert.match(resendPayload.html, /Hello from the flyer/);
    assert.equal(resendRequest.options.headers.Authorization, "Bearer secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST /api/contact accepts form-encoded submissions", async () => {
  const originalFetch = globalThis.fetch;
  let resendPayload;

  globalThis.fetch = async (url, options) => {
    resendPayload = JSON.parse(options.body);
    return new Response(null, { status: 200 });
  };

  try {
    const formData = new URLSearchParams({
      name: "Form Person",
      email: "form@example.com",
      "business-name": "Form Business",
      message: "Hello via form encoding",
    });

    const response = await callContactFunction(
      new Request("https://example.com/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      }),
      {
        RESEND_API_KEY: "secret",
        CONTACT_TO_EMAIL: "to@example.com",
        CONTACT_FROM_EMAIL: "from@example.com",
      },
    );

    assert.equal(response.status, 200);
    assert.equal(resendPayload.reply_to, "form@example.com");
    assert.match(resendPayload.html, /Form Business/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST /api/contact validates required fields before Resend", async () => {
  const response = await callContactFunction(
    new Request("https://example.com/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Message", email: "person@example.com" }),
    }),
    {
      RESEND_API_KEY: "secret",
      CONTACT_TO_EMAIL: "to@example.com",
      CONTACT_FROM_EMAIL: "from@example.com",
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "Name, email, and message are required.",
    code: "INVALID_REQUEST",
  });
});

test("POST /api/contact reports missing Pages environment variables", async () => {
  const response = await callContactFunction(new Request("https://example.com/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test Person",
      email: "test@example.com",
      message: "Hello",
    }),
  }), {
    CONTACT_TO_EMAIL: "hello@copperline-creative.com.au",
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "Contact form email is not configured.",
    code: "MISSING_ENV",
    missing: ["RESEND_API_KEY", "CONTACT_FROM_EMAIL"],
  });
});

test("POST /api/contact returns Resend response details for debugging", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "The from address is not verified." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const response = await callContactFunction(new Request("https://example.com/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Person",
        email: "test@example.com",
        message: "Hello",
      }),
    }), {
      RESEND_API_KEY: "secret",
      CONTACT_TO_EMAIL: "hello@copperline-creative.com.au",
      CONTACT_FROM_EMAIL: "hello@copperline-creative.com.au",
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "Resend rejected the email request.",
      code: "RESEND_ERROR",
      resendStatus: 403,
      resendBody: '{"message":"The from address is not verified."}',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
