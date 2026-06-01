document.addEventListener("DOMContentLoaded", () => {
  const modal = document.querySelector("[data-contact-modal]");
  const modalCard = modal ? modal.querySelector(".contact-modal-card") : null;
  const form = modal ? modal.querySelector(".contact-modal-form") : null;
  const successMessage = modal ? modal.querySelector(".contact-modal-success") : null;
  const status = modal ? modal.querySelector(".contact-modal-status") : null;
  const closeButtons = modal ? modal.querySelectorAll("[data-contact-modal-close]") : [];
  const openButtons = document.querySelectorAll("[data-contact-modal-open]");
  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "textarea:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  let previousFocus = null;

  if (!modal || !modalCard || !form) {
    return;
  }

  function getFocusableElements() {
    return Array.from(modal.querySelectorAll(focusableSelector))
      .filter((element) => element.offsetParent !== null);
  }

  function setStatus(message, type) {
    if (!status) {
      return;
    }

    status.textContent = message;
    status.dataset.status = type;
  }

  function openModal(event) {
    if (event) {
      event.preventDefault();
    }

    const trigger = event ? event.currentTarget : null;
    const ctaInput = form.querySelector("input[name='ctaLabel']");

    if (ctaInput && trigger) {
      ctaInput.value = trigger.dataset.contactCta || trigger.textContent.trim();
    }

    previousFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    form.hidden = false;

    if (successMessage) {
      successMessage.hidden = true;
    }

    setStatus("", "");

    const firstField = modal.querySelector("input[name='name']");
    if (firstField) {
      firstField.focus();
    }
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    form.reset();
    setStatus("", "");

    if (previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus();
    }
  }

  function handleKeydown(event) {
    if (modal.hidden) {
      return;
    }

    if (event.key === "Escape") {
      closeModal();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements();
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (!firstElement || !lastElement) {
      return;
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  openButtons.forEach((button) => {
    button.addEventListener("click", openModal);
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  if (window.location.hash === "#contact-modal") {
    openModal();
  }

  modal.addEventListener("click", (event) => {
    if (!modalCard.contains(event.target)) {
      closeModal();
    }
  });

  document.addEventListener("keydown", handleKeydown);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button[type='submit']");
    const defaultButtonText = submitButton ? submitButton.textContent : "Send Message";
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.projectType = formData.getAll("projectType");

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

      form.hidden = true;

      if (successMessage) {
        successMessage.hidden = false;
        successMessage.focus();
      }
    } catch {
      setStatus("Something went wrong. Please try again, or email hello@copperline-creative.com.au.", "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultButtonText;
      }
    }
  });
});
