function Haptics(settings) {
  this.settings = settings;
  this.supported = typeof navigator !== "undefined" &&
                   typeof navigator.vibrate === "function";
}

Haptics.prototype.pulse = function (durationMs) {
  if (!this.supported) return;
  if (this.settings && !this.settings.get("haptics")) return;
  try { navigator.vibrate(durationMs || 12); } catch (e) {}
};
