import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../src/index.mjs";

const flyerHtmlPath = new URL("../Copperline Creative/flyer/index.html", import.meta.url);
const flyerScriptPath = new URL("../Copperline Creative/flyer/contact-form.js", import.meta.url);

test("flyer contact form posts to the Worker endpoint", async () => {
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
        businessName: "Test Studio",
        message: "Hello from the flyer",
      }),
    });

    const response = await worker.fetch(request, {
      RESEND_API_KEY: "secret",
      COPPERLINE_CONTACT_TO_EMAIL: "hello@copperline-creative.com.au",
      COPPERLINE_CONTACT_FROM_EMAIL: "website@send.copperline-creative.com.au",
      ASSETS: { fetch: () => new Response("asset") },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(resendRequest.url, "https://api.resend.com/emails");
    assert.equal(resendRequest.options.method, "POST");

    const resendPayload = JSON.parse(resendRequest.options.body);
    assert.equal(resendPayload.from, "Copperline Creative <website@send.copperline-creative.com.au>");
    assert.deepEqual(resendPayload.to, ["hello@copperline-creative.com.au"]);
    assert.equal(resendPayload.reply_to, "test@example.com");
    assert.equal(resendPayload.subject, "New Copperline Creative enquiry from Test Person");
    assert.match(resendPayload.html, /Test Studio/);
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

    const response = await worker.fetch(
      new Request("https://example.com/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      }),
      {
        RESEND_API_KEY: "secret",
        COPPERLINE_CONTACT_TO_EMAIL: "to@example.com",
        COPPERLINE_CONTACT_FROM_EMAIL: "from@example.com",
        ASSETS: { fetch: () => new Response("asset") },
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
  const response = await worker.fetch(
    new Request("https://example.com/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Message", email: "person@example.com" }),
    }),
    {
      RESEND_API_KEY: "secret",
      COPPERLINE_CONTACT_TO_EMAIL: "to@example.com",
      COPPERLINE_CONTACT_FROM_EMAIL: "from@example.com",
      ASSETS: { fetch: () => new Response("asset") },
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Name, email, and message are required.",
    code: "INVALID_REQUEST",
  });
});

test("GET requests fall through to static assets", async () => {
  const response = await worker.fetch(new Request("https://example.com/flyer/"), {
    ASSETS: { fetch: () => new Response("<html>flyer</html>") },
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<html>flyer</html>");
});
