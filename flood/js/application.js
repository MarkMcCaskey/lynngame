window.requestAnimationFrame(function () {
  var ready = (window.IDBMirror && window.IDBMirror.hydrate)
              ? window.IDBMirror.hydrate() : Promise.resolve();

  ready.then(function () {
    if (window.IDBMirror && window.IDBMirror.requestPersistence) {
      window.IDBMirror.requestPersistence();
    }

    var GAME_ID = "flood";
    var storageManager = new LocalStorageManager(GAME_ID);
    var settings       = new Settings(storageManager.storage);
    var haptics        = new Haptics(settings);
    var scoreHistory   = new ScoreHistory(storageManager.storage, GAME_ID);
    var inputManager   = new InputManager();
    var actuator       = new FloodActuator();

    var game = new FloodGame({
      gameId: GAME_ID,
      storageManager: storageManager,
      inputManager:   inputManager,
      actuator:       actuator,
      settings:       settings,
      haptics:        haptics,
      scoreHistory:   scoreHistory
    });

    actuator.onColorPick = function (color) { game.pick(color); };

    var panel = new SettingsPanel(settings, game, scoreHistory);
    inputManager.on("openSettings",  function () { panel.open(); });
    inputManager.on("closeSettings", function () { panel.close(); });

    game.boot();
    actuator.renderHistoryStrip(scoreHistory.list(), settings.get("showHistory"));

    window.gameManager  = game;
    window.gameSettings = settings;
    window.gameScoreHistory = scoreHistory;
  });
});
