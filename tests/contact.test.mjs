import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { onRequest } from "../functions/api/contact.js";

const flyerHtmlPath = new URL("../Copperline Creative/flyer/index.html", import.meta.url);
const homeHtmlPath = new URL("../Copperline Creative/index.html", import.meta.url);
const faqHtmlPath = new URL("../Copperline Creative/faq.html", import.meta.url);
const modalScriptPath = new URL("../Copperline Creative/contact-modal.js", import.meta.url);

test("flyer contact CTAs open the shared modal with flyer source tracking", async () => {
  const html = await readFile(flyerHtmlPath, "utf8");
  const script = await readFile(modalScriptPath, "utf8");

  assert.match(html, /<script src="\.\.\/contact-modal\.js" defer><\/script>/);
  assert.match(html, /data-contact-modal/);
  assert.match(html, /data-contact-modal-open/);
  assert.match(html, /data-contact-cta="Flyer header Let's do this"/);
  assert.match(html, /data-contact-cta="Flyer contact box Let's Chat"/);
  assert.doesNotMatch(html, /class="flyer-contact-form"/);
  assert.match(html, /action="\/api\/contact"/);
  assert.match(html, /method="post"/);
  assert.match(html, /novalidate/);
  assert.match(html, /name="leadSource" value="Flyer landing page"/);
  assert.match(html, /name="pagePath" value="\/flyer\/"/);
  assert.match(html, /name="ctaLabel" value="Flyer contact modal"/);
  assert.match(html, /name="phone"/);
  assert.match(html, /name="projectType"/);
  assert.match(html, /<p class="contact-modal-status" role="status" aria-live="polite"><\/p>/);
  assert.match(script, /event\.preventDefault\(\)/);
  assert.match(script, /fetch\("\/api\/contact"/);
  assert.match(script, /projectType/);
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
  assert.match(html, /name="leadSource" value="Main website"/);
  assert.match(html, /name="pagePath" value="\/"/);
  assert.match(html, /name="ctaLabel" value="Main website contact modal"/);
  assert.match(html, /data-contact-cta="Homepage header Let's do this"/);
  assert.match(html, /Get in touch &rarr;<\/a>/);
  assert.doesNotMatch(html, /<a class="button" href="mailto:hello@copperline-creative\.com\.au">Get in touch/);
  assert.match(script, /fetch\("\/api\/contact"/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /window\.location\.hash === "#contact-modal"/);
  assert.match(script, /ctaLabel/);
  assert.match(script, /projectType/);
});

test("FAQ CTAs open the shared contact modal with FAQ source tracking", async () => {
  const html = await readFile(faqHtmlPath, "utf8");

  assert.match(html, /<script src="contact-modal\.js" defer><\/script>/);
  assert.match(html, /data-contact-modal/);
  assert.match(html, /data-contact-modal-open/);
  assert.match(html, /data-contact-cta="FAQ header Let's do this"/);
  assert.match(html, /data-contact-cta="FAQ CTA Let's chat"/);
  assert.match(html, /name="leadSource" value="FAQ page"/);
  assert.match(html, /name="pagePath" value="\/faq\/"/);
  assert.match(html, /name="ctaLabel" value="FAQ contact modal"/);
  assert.doesNotMatch(html, /<a class="button button-small" href="mailto:hello@copperline-creative\.com\.au">Let's do this!<\/a>/);
  assert.doesNotMatch(html, /<a class="button" href="mailto:hello@copperline-creative\.com\.au">Let’s chat<\/a>/);
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
        leadSource: "Flyer landing page",
        pagePath: "/flyer/",
        ctaLabel: "Flyer contact form",
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
    assert.match(resendPayload.html, /<strong>Submitted from:<\/strong> Flyer landing page/);
    assert.match(resendPayload.html, /<strong>Page path:<\/strong> \/flyer\//);
    assert.match(resendPayload.html, /<strong>CTA:<\/strong> Flyer contact form/);
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
      pagePath: "/faq/",
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
    assert.match(resendPayload.html, /FAQ page/);
    assert.match(resendPayload.html, /\/faq\//);
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
