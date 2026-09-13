// netlify/functions/auth.js
//
// GET  /api/auth   -> { isDefault: boolean }  (never returns the PIN itself)
// POST /api/auth    body: { action: "verify", pin }
//                    -> { valid: boolean }
//                  body: { action: "change", currentPin, newPin }
//                    -> { success: true } or 400/401 with { error }

const { getPin, setPin, DEFAULT_PIN } = require("./lib/pin-store");
const { connectLambda } = require("@netlify/blobs");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

exports.handler = async (event) => {
  connectLambda(event); // required so getStore() can find Netlify's Blobs context

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  try {
    if (event.httpMethod === "GET") {
      const pin = await getPin();
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ isDefault: pin === DEFAULT_PIN }),
      };
    }

    if (event.httpMethod === "POST") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Body must be valid JSON." }) };
      }

      const currentPin = await getPin();

      if (body.action === "verify") {
        const valid = typeof body.pin === "string" && body.pin === currentPin;
        return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ valid }) };
      }

      if (body.action === "change") {
        if (body.currentPin !== currentPin) {
          return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: "Current PIN is incorrect." }) };
        }
        const newPin = String(body.newPin || "").trim();
        if (!/^\d{4,10}$/.test(newPin)) {
          return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "New PIN must be 4-10 digits." }) };
        }
        await setPin(newPin);
        return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ success: true }) };
      }

      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Unknown action." }) };
    }

    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed." }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Server error.", message: String((err && err.message) || err) }),
    };
  }
};
