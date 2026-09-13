// netlify/functions/lib/pin-store.js
// Shared by auth.js (login / change PIN) and questions.js (protecting writes).

const { getStore } = require("@netlify/blobs");

const STORE_NAME = "panther-bob-auth";
const KEY = "pin";
const DEFAULT_PIN = "000000";

async function getPin() {
  const store = getStore(STORE_NAME);
  let pin = await store.get(KEY, { type: "text" });
  if (!pin) {
    pin = DEFAULT_PIN;
    await store.set(KEY, pin);
  }
  return pin;
}

async function setPin(newPin) {
  const store = getStore(STORE_NAME);
  await store.set(KEY, newPin);
}

module.exports = { getPin, setPin, DEFAULT_PIN };
