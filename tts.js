// tts.js — shared text-to-speech helper (Web Speech API)
// Include this before any page-specific script that calls speak().

function speak(text, rate) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel(); // don't stack overlapping utterances
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate || 0.95;
  window.speechSynthesis.speak(utterance);
}

function ttsSupported() {
  return "speechSynthesis" in window;
}
