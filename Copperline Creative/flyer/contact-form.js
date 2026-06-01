document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".flyer-contact-form");

  if (!form) {
    return;
  }

  const status = form.querySelector(".flyer-form-status");
  const submitButton = form.querySelector("button[type='submit']");
  const defaultButtonText = submitButton ? submitButton.textContent : "Send Message";

  function setStatus(message, type) {
    if (!status) {
      return;
    }

    status.textContent = message;
    status.dataset.status = type;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    setStatus("Sending your message...", "loading");

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Contact request failed");
      }

      form.reset();
      setStatus("Thanks, your message has been sent. I'll be in touch soon.", "success");
    } catch {
      setStatus("Something went wrong sending your message. Please email hello@copperline-creative.com.au instead.", "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultButtonText;
      }
    }
  });
});
