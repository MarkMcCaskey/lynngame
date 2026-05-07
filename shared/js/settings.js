function Settings(storage) {
  this.storage = storage;
  this.key = "settings";
  this.defaults = {
    undoDepth: 10,         // 5, 10, 25, 50, or 0 for unlimited (per game)
    haptics: true,
    showHistory: true
  };
  this.values = this.load();
}

Settings.prototype.load = function () {
  var raw = this.storage.getItem(this.key);
  var parsed = {};
  if (raw) {
    try { parsed = JSON.parse(raw) || {}; } catch (e) { parsed = {}; }
  }
  var merged = {};
  for (var k in this.defaults) merged[k] = (k in parsed) ? parsed[k] : this.defaults[k];
  return merged;
};

Settings.prototype.save = function () {
  this.storage.setItem(this.key, JSON.stringify(this.values));
};

Settings.prototype.get = function (key) {
  return this.values[key];
};

Settings.prototype.set = function (key, value) {
  this.values[key] = value;
  this.save();
  if (this.onChange) this.onChange(key, value);
};
