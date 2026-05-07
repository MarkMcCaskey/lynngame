window.requestAnimationFrame(function () {
  var ready = (window.IDBMirror && window.IDBMirror.hydrate)
              ? window.IDBMirror.hydrate() : Promise.resolve();

  ready.then(function () {
    if (window.IDBMirror && window.IDBMirror.requestPersistence) {
      window.IDBMirror.requestPersistence();
    }

    var GAME_ID = "bubble";
    var storageManager = new LocalStorageManager(GAME_ID);
    var settings       = new Settings(storageManager.storage);
    var haptics        = new Haptics(settings);
    var scoreHistory   = new ScoreHistory(storageManager.storage, GAME_ID);
    var inputManager   = new InputManager();
    var actuator       = new BubbleActuator();

    var game = new BubbleGame({
      gameId: GAME_ID,
      storageManager: storageManager,
      inputManager:   inputManager,
      actuator:       actuator,
      settings:       settings,
      haptics:        haptics,
      scoreHistory:   scoreHistory
    });

    actuator.onCellTap = function (x, y) { game.pop(x, y); };

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
