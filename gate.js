// gate.js — Panther Bob Games site-wide PIN gate
//
// Included on every page. On load, shows a full-screen lock overlay unless
// this browser TAB has already unlocked this session (sessionStorage, so
// closing the tab/browser locks it again — reopening the site always asks
// again). The PIN itself lives server-side in Netlify Blobs (see
// netlify/functions/auth.js) — this script never stores or has access to
// the real PIN value, only whether a guess was right.
//
// Also injects a small "Change PIN" link into the page footer, so it's
// reachable from anywhere once unlocked.

const PBQ_UNLOCK_KEY = "pbq_unlocked_v1";

function buildGateOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "pin-gate";
  overlay.className = "pin-gate";
  overlay.innerHTML = `
    <div class="pin-gate-card">
      <div class="pin-gate-logo">🐾</div>
      <h2>Panther Bob Games</h2>
      <p class="hint">Enter the PIN to continue.</p>
      <form id="pin-gate-form">
        <input id="pin-gate-input" type="password" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="PIN" />
        <button type="submit" class="btn btn-primary">Unlock</button>
      </form>
      <p id="pin-gate-error" class="status-msg error hidden"></p>
    </div>
  `;
  document.body.prepend(overlay);
  return overlay;
}

function buildChangePinModal() {
  const modal = document.createElement("div");
  modal.id = "pin-change-modal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-card pin-change-card">
      <div class="modal-category">Change PIN</div>
      <form id="pin-change-form" class="admin-form">
        <div class="form-row">
          <label for="pin-change-current">Current PIN</label>
          <input id="pin-change-current" type="password" inputmode="numeric" maxlength="10" required />
        </div>
        <div class="form-row">
          <label for="pin-change-new">New PIN (4-10 digits)</label>
          <input id="pin-change-new" type="password" inputmode="numeric" maxlength="10" required />
        </div>
        <div class="form-row">
          <label for="pin-change-confirm">Confirm new PIN</label>
          <input id="pin-change-confirm" type="password" inputmode="numeric" maxlength="10" required />
        </div>
        <button type="submit" class="btn btn-primary">Save New PIN</button>
      </form>
      <p id="pin-change-status" class="status-msg"></p>
      <button id="pin-change-close-btn" class="btn btn-ghost pin-change-close">Close</button>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function injectFooterLink() {
  const footer = document.querySelector(".site-footer");
  if (!footer) return null;
  const btn = document.createElement("button");
  btn.id = "pin-change-open-btn";
  btn.className = "footer-link-btn";
  btn.textContent = "🔒 Change PIN";
  footer.appendChild(btn);
  return btn;
}

function injectDefaultPinNotice(overlayCard) {
  const notice = document.createElement("p");
  notice.className = "pin-gate-default-notice";
  notice.textContent = "Still using the starting PIN (000000) — you can change it below once you're in.";
  overlayCard.appendChild(notice);
}

async function fetchIsDefaultPin() {
  try {
    const res = await fetch("/api/auth");
    const data = await res.json();
    return !!data.isDefault;
  } catch (e) {
    return false;
  }
}

async function verifyPin(pin) {
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", pin }),
    });
    const data = await res.json();
    return !!data.valid;
  } catch (e) {
    return false;
  }
}

async function changePin(currentPin, newPin) {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "change", currentPin, newPin }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not change PIN.");
  return data;
}

(function initGate() {
  const alreadyUnlocked = sessionStorage.getItem(PBQ_UNLOCK_KEY) === "true";

  const overlay = buildGateOverlay();
  const changeModal = buildChangePinModal();

  const overlayCard = overlay.querySelector(".pin-gate-card");
  const form = overlay.querySelector("#pin-gate-form");
  const input = overlay.querySelector("#pin-gate-input");
  const errorEl = overlay.querySelector("#pin-gate-error");

  function unlock() {
    sessionStorage.setItem(PBQ_UNLOCK_KEY, "true");
    overlay.classList.add("hidden");
  }

  if (alreadyUnlocked) {
    overlay.classList.add("hidden");
  } else {
    input.focus();
    fetchIsDefaultPin().then((isDefault) => {
      if (isDefault && !overlay.classList.contains("hidden")) {
        injectDefaultPinNotice(overlayCard);
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const ok = await verifyPin(input.value.trim());
    if (ok) {
      unlock();
    } else {
      errorEl.textContent = "Incorrect PIN. Try again.";
      errorEl.classList.remove("hidden");
      input.value = "";
      input.focus();
    }
  });

  // Footer "Change PIN" control — set up once the DOM (incl. footer) is ready.
  document.addEventListener("DOMContentLoaded", () => {
    const footerBtn = injectFooterLink();
    if (!footerBtn) return;

    footerBtn.addEventListener("click", () => {
      changeModal.classList.remove("hidden");
    });
    changeModal.querySelector("#pin-change-close-btn").addEventListener("click", () => {
      changeModal.classList.add("hidden");
    });
    changeModal.querySelector(".modal-backdrop").addEventListener("click", () => {
      changeModal.classList.add("hidden");
    });
    changeModal.querySelector("#pin-change-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const statusEl = changeModal.querySelector("#pin-change-status");
      const current = changeModal.querySelector("#pin-change-current").value.trim();
      const next = changeModal.querySelector("#pin-change-new").value.trim();
      const confirmVal = changeModal.querySelector("#pin-change-confirm").value.trim();

      statusEl.className = "status-msg";
      statusEl.textContent = "";

      if (!/^\d{4,10}$/.test(next)) {
        statusEl.textContent = "New PIN must be 4-10 digits.";
        statusEl.className = "status-msg error";
        return;
      }
      if (next !== confirmVal) {
        statusEl.textContent = "New PIN and confirmation don't match.";
        statusEl.className = "status-msg error";
        return;
      }
      try {
        await changePin(current, next);
        statusEl.textContent = "PIN updated!";
        statusEl.className = "status-msg success";
        changeModal.querySelector("#pin-change-form").reset();
        setTimeout(() => changeModal.classList.add("hidden"), 1200);
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = "status-msg error";
      }
    });
  });
})();
