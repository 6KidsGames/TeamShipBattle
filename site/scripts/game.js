// Main entry point for game functions and logic.
// NOTE: This is ES6 JavaScript so we can use classes and other new stuff.
// We transpile to ES5 for the browser using Babel in the Gulp build file.

const Util = require('../Util');

// Track the latest world updates from the server's world update messages.
// We start with an empty world until the server can get a first message
// back to us.
var currentWorld = createEmptyWorldUpdate();
var scrollingTileCamera = null;
var currentLevelName = null;
var levelWorldObj = null;
var numAlienSounds = 2;

// Sound and graphics files we want to load via Hexi.js.
var thingsToLoadIntoHexi = [
  // Sound files.

  // Weapon sounds
  "Sounds/test.mp3",

  // Spritesheet and tileset JSON metadata files and related PNGs.
  'images/GameSpritesheet.json',
  'images/LevelTileset.png',

  // Game map definitions in Tiled Editor (http://mapeditor.org) comma-separated value (CSV) JSON
  // format, suitable for use with Hexi's GameUtilities.
  'Levels/EmptySpace.json',
];

// Hexi.js (and Pixi.js) setup. Pixi will autodetect the browser's capabilities and
// choose the fastest renderer (WebGL or HTML5 Canvas).
var hexiObj = hexi(window.innerWidth, window.innerHeight, hexiSetupCompleted, thingsToLoadIntoHexi, hexiLoading);
hexiObj.fps = 30;  // Game logic loop runs at this rate. Sprites still render at 60 fps.
hexiObj.backgroundColor = 0x000000;  // black
hexiObj.scaleToWindow();
hexiObj.start();

var alienSounds = [];
var characterInfo = [];

// User interface spites and tracking info.
var copyrightSprite = undefined;
var playerHealthSprite = undefined;
var playerWeaponSprite = undefined;
var playerWeaponNumber = -1;
var playerAmmoSprite = undefined;
var playerDeathSprite = undefined;
var playerDeathStart = 0;
var forwardButton = undefined;
var backButton = undefined;
var leftButton = undefined;
var rightButton = undefined;
var shootButton = undefined;

function hexiLoading() {
  hexiObj.loadingBar();
}

function hexiSetupCompleted() {
  console.log("Hexi setup complete");

  // CODESYNC: The number of sounds here is set in Alien.js and in numAlienSounds above
  alienSounds[0] = hexiObj.sound('Sounds/test.mp3');

  // CODESYNC: The number of sounds here is set in RunNodeSiteServer.js numPlayerHurtSounds
  characterInfo[0].costumeFrames = hexiObj.spriteUtilities.frameSeries(0, 1, "player");
  characterInfo[0].hurtSounds = [
    hexiObj.sound('Sounds/test.mp3'),
  ]; 
  characterInfo[1].costumeFrames = hexiObj.spriteUtilities.frameSeries(0, 1, "player");
  characterInfo[1].hurtSounds = [
    hexiObj.sound('Sounds/test.mp3'),
  ];
  characterInfo[2].costumeFrames = hexiObj.spriteUtilities.frameSeries(0, 1, "player");
  characterInfo[2].hurtSounds = [
    hexiObj.sound('Sounds/test.mp3'),
  ];

  logo1Setup();
}

var logo1Sprite = undefined;
var logo1Start;
function logo1Setup() {
  logo1Start = (new Date()).getTime();
  logo1Sprite = hexiObj.sprite("6KidsLogo");
  logo1Sprite.alpha = 0;
  logo1Sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  hexiObj.stage.putCenter(logo1Sprite);
  hexiObj.state = logo1Loop;
}
function logo1Loop() {
  var now = (new Date()).getTime();
  var dt = now - logo1Start;
  if (dt < 600) {
    logo1Sprite.alpha = (dt / 600) * (dt / 600);
  } else if (dt < 1200) {
    logo1Sprite.alpha = 1;
  } else if (dt < 1800) {
    logo1Sprite.alpha = (600 - (dt - 1200)) / 600;
  } else {
    hexiObj.remove(logo1Sprite);
    esrbLogoSetup();
  }
}

var esrbSprite = undefined;
var esrbLogoStart;
function esrbLogoSetup() {
  console.log("esrbLogoSetup");
  esrbLogoStart = (new Date()).getTime();
  esrbSprite = hexiObj.sprite("6KidsLogo");
  esrbSprite.alpha = 0;
  esrbSprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  hexiObj.stage.putCenter(esrbSprite);
  hexiObj.state = esrbLogoLoop;
}
function esrbLogoLoop() {
  var now = (new Date()).getTime();
  var dt = now - esrbLogoStart;
  if (dt < 250) {
    esrbSprite.alpha = (dt / 250) * (dt / 250);
  } else if (dt < 750) {
    esrbSprite.alpha = 1;
  } else if (dt < 1000) {
    esrbSprite.alpha = (250 - (dt - 750)) / 250;
  } else {
    hexiObj.remove(esrbSprite);
    logo2Setup();
  }
}


var logo2Sprite = undefined;
var logo2Start;
function logo2Setup() {
  logo2Start = (new Date()).getTime();
  logo2Sprite = hexiObj.sprite("6KidsLogo");
  logo2Sprite.alpha = 0;
  logo2Sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  hexiObj.stage.putCenter(logo2Sprite);
  hexiObj.state = logo2Loop;

  // Start creepy music at the start of the TeamShipBattle logo.
  var music = hexiObj.sound("Sounds/test.mp3");
  music.loop = true;
  music.fadeIn(1);
  music.volume = 0.5;
  music.play();
}
function logo2Loop() {
  var now = (new Date()).getTime();
  var dt = now - logo2Start;
  if (dt < 600) {
    logo2Sprite.alpha = (dt / 600) * (dt / 600);
  } else if (dt < 1200) {
    logo2Sprite.alpha = 1;
  } else if (dt < 1800) {
    logo2Sprite.alpha = (600 - (dt - 1200)) / 600;
  } else {
    hexiObj.remove(logo2Sprite);
    gameLoopSetup();
  }
}

function gameLoopSetup() {
  playerHealthSprite = hexiObj.text("HEALTH: ", "24px sans-serif", "white", 10, 10);
  playerHealthSprite.alpha = 0.5;
  playerHealthSprite.layer = 1000;  // Foremost

  playerAmmoSprite = hexiObj.text("AMMO: ", "24px sans-serif", "white", 10, 88);
  playerAmmoSprite.alpha = 0.5;
  playerAmmoSprite.layer = 1000;  // Foremost
  playerAmmoSprite.visible = false;

  var copyrightHeightPx = 16;
  copyrightSprite = hexiObj.text("Copyright 2017 6KidsGames.com", `${copyrightHeightPx}px sans-serif`, "white", 10, hexiObj.canvas.height - copyrightHeightPx - 1);
  copyrightSprite.alpha = 0.4;
  copyrightSprite.layer = 1000;

  forwardButton = hexiObj.button(["ForwardButton"], 74, hexiObj.canvas.height - copyrightHeightPx - 1 - 3 - 64 - 32 - 64);
  forwardButton.alpha = 0.5;
  forwardButton.layer = 1000;  // Foremost

  backButton = hexiObj.button(["BackButton"], 74, hexiObj.canvas.height - copyrightHeightPx - 1 - 3 - 64);
  backButton.alpha = 0.5;
  backButton.layer = 1000;  // Foremost

  leftButton = hexiObj.button(["LeftButton"], 10, hexiObj.canvas.height - copyrightHeightPx - 1 - 3 - 64 - 32);
  leftButton.alpha = 0.5;
  leftButton.layer = 1000;  // Foremost

  rightButton = hexiObj.button(["RightButton"], 106, hexiObj.canvas.height - copyrightHeightPx - 1 - 3 - 64 - 32);
  rightButton.alpha = 0.5;
  rightButton.layer = 1000;  // Foremost

  shootButton = hexiObj.button(["ShootButton"], hexiObj.canvas.width - 10 - 96, hexiObj.canvas.height - copyrightHeightPx - 1 - 3 - 64 - 48);
  shootButton.alpha = 0.5;
  shootButton.layer = 1000;  // Foremost

  hexiObj.state = gameLoop;
}

// Tell Primus to create a new WebSockets connection to the current domain/port/protocol.
// Get the primus connection spark ID when we connect - we need it for knowing which player
// we are in the world state passed from the server. 
var primus = Primus.connect();
var currentPrimusSparkID;
primus.on("open", function () {
  console.log("Connected to server through Primus.");
  primus.id(function (id) {
    currentPrimusSparkID = id;
    console.log("Current Primus spark ID: " + id);
  });
});

function nameOrUnknown(name) {
  if (name) return name;
  return "Unknown";
}

// Listen for incoming messages from the server.
primus.on('data', function received(data) {
  if (data.t === 0) {  // World update
    // console.log("Received world update:", data);
    currentWorld = data;
  }
  else {
    console.log("ERROR: Received unknown message type " + data.t)
  }
});

// Helpers that track the state of keyboard keys by hooking the current window's key events
// and tracking if a key down or up has occurred.
let keyPressed = [];
window.addEventListener("keyup", keyEvent => {
  //console.log("keyup: " + keyEvent.keyCode);
  keyPressed[keyEvent.keyCode] = false;
}, false);
window.addEventListener("keydown", keyEvent => {
  //console.log("keydown: " + keyEvent.keyCode);
  keyPressed[keyEvent.keyCode] = true;
}, false);

// Key codes. Full table at http://www.cambiaresearch.com/articles/15/javascript-key-codes
const KEY_W = 87;
const KEY_S = 83;
const KEY_A = 65;
const KEY_D = 68;
const KEY_SPACE = 32;
const KEY_E = 69;
const KEY_R = 82;
const KEY_1 = 49;
const KEY_2 = 50;
const KEY_3 = 51;
const KEY_4 = 52;
const KEY_5 = 53;
const KEY_6 = 54;
const KEY_7 = 55;
const KEY_8 = 56;
const KEY_9 = 57;

// Keep a copy of the last PlayerControlInfo message sent, so we don't send
// a new message if there has been no change since the last one.
var prevControlInfo = { };

// Keep a copy of the last game world update we processed in gameLoop().
// Each time through the loop, a new world update might have appeared
// including new or removed players.
var lastProcessedWorldUpdate = createEmptyWorldUpdate();

// Keep a record of all players we know about right now. Each time
// through gameLoop() the latest world update might include different
// or new or removed players. This is also our record for keeping track
// of all the things the game engine needs (e.g. sprites).
var playerDatas = { };
function forEachPlayerData(func) { Util.forEachInMap(playerDatas, func); }

// Keep a record of all un-picked-up weapons we know about right now. Each time
// through gameLoop() the latest world update might include different
// or new or removed weapons. This is also our record for keeping track
// of all the things the game engine needs (e.g. sprites).
var weaponDatas = { };
function forEachWeaponData(func) { Util.forEachInMap(weaponDatas, func); }

// Keep a record of all aliens in play right now.
var alienDatas = { };
function forEachAlienData(func) { Util.forEachInMap(alienDatas, func); }

// Keep a record of all bullets in play right now.
var bulletDatas = { };
function forEachBulletData(func) { Util.forEachInMap(bulletDatas, func); }

// Keep track of the local player's weapon change ID - we increment this each time the player
// actually presses a weapon key so the server knows that the controlInfo.w value was updated.
var currentWeaponChangeID = 0;

// Called 30 times per second by the Hexi main loop.
function gameLoop() {
  var currentTime = (new Date()).getTime();

  // Create a new, empty PlayerControlInfo message to send to the server
  // with our current control status.
  var controlInfo = {
    t: 0,  // Control message type
    wC: currentWeaponChangeID,
  };

  // Create tile world object if we have never updated a level before, or if we changed levels.
  // Must come early in loop logic since we need to add and update sprites as children of the level object.
  if (currentLevelName !== currentWorld.l) {
    console.log(`Loading level ${currentWorld.l}`);
    currentLevelName = currentWorld.l;
    levelWorldObj = hexiObj.makeTiledWorld("Levels/" + currentWorld.l + ".json", 'images/LevelTileset.png');
    levelWorldObj.layer = 0;  // Rearmost.
  }

  // Mark all players we are tracking as touched=false to detect removed players.
  // Make changes to player sprites from the current world state sent by the server.
  clearAllMapTouches(playerDatas);
  var myPlayerData  = null;
  var playerDatasToPlayWeaponSound = [];  // To allow playing after myPlayerData is determined
  var playersToPlayOuchSound = [];  // To allow playing after myPlayerData is determined
  for (var i = 0; i < currentWorld.p.length; i++) {
    var player = currentWorld.p[i];

    // Player might be new. If so, create a new sprite.
    var playerData = null;
    if (!playerDatas.hasOwnProperty(player.id)) {
      playerData = {
        id: player.id,
        lastSoundCount: player.sC,  // On reconnect, we don't want a ton of sounds, so use the current server count and play the next ones sent.
        lastWeaponUseCount: player.wC,
        sprite: createNewPlayerSprite(player.w),
        weapon: -1,
      };

      playerDatas[player.id] = playerData;
    }
    else {
      playerData = playerDatas[player.id];
    }
    playerData.touched = true;

    if (myPlayerData == null && player.id === currentPrimusSparkID) {
      myPlayerData = playerData;

      // It's hard to tell the current player amongst all the others.
      // Add a translucent circle centered on the local player. 
      if (!myPlayerData.markedForBetterViewing) {
        var highlightCircle = hexiObj.circle(64);
        highlightCircle.alpha = 0.3;
        highlightCircle.anchor.x = 0.5;
        highlightCircle.anchor.y = 0.5;
        myPlayerData.sprite.addChild(highlightCircle);
        myPlayerData.markedForBetterViewing = true;
      }
    }

    // Update the sprite and playerData with current world information.
    playerData.sprite.x = player.x;
    playerData.sprite.y = player.y;
    playerData.sprite.rotation = player.d;
    playerData.lastHealth = playerData.health;
    playerData.lastAmmo = playerData.ammo;
    playerData.lastDead = playerData.dead;
    playerData.health = player.h;
    if (playerData.weapon !== player.w) {
      playerData.weapon = player.w;
      setPlayerWeaponSprite(playerData.sprite, player.w);
    }
    
    playerData.ammo = player.a;
    playerData.dead = player.dead;

    if (player.sC > playerData.lastSoundCount) {
      playerData.lastSoundCount = player.sC;
      playersToPlayOuchSound.push(player);

      // Create a spark spray using particles.
      hexiObj.createParticles(
        player.x, player.y,
        () => hexiObj.circle(8, "blue"),
        levelWorldObj,
        10,  // Num particles
        0,  // Gravity
        false,  // randomSpacing
        0, 6.28,  // Min/max angle - allow whole circle
        8, 24,  // Min/max size
        1.2, 2.4,  // Min/max speed
        0.01, 0.03,  // Min/max scale speed
        0.05, 0.15,  // Min/max alpha speed
        0, 0);  // Min/max rotation speed
    }

    if (player.wC > playerData.lastWeaponUseCount) {
      playerData.lastWeaponUseCount = player.wC;

      console.log(`P${player.id} using W${playerData.weapon}`);

      // TODO: Animate melee weapons.

      playerDatasToPlayWeaponSound.push(playerData);
    }
  }

  if (myPlayerData.health !== myPlayerData.lastHealth) {
    playerHealthSprite.content = "HEALTH: " + myPlayerData.health;
  }

  if (myPlayerData.ammo !== myPlayerData.lastAmmo) {
    if (myPlayerData.ammo < 0) {
      playerAmmoSprite.visible = false;
    } else {
      playerAmmoSprite.content = "AMMO: " + myPlayerData.ammo;
      playerAmmoSprite.visible = true;
    }
  }

  if (myPlayerData.weapon !== playerWeaponNumber) {
    // console.log("Player weapon in UI changing from", playerWeaponNumber, "to", myPlayerData.weapon);
    createPlayerWeaponUISprite(myPlayerData.weapon);
    playerWeaponNumber = myPlayerData.weapon;
  }

  playersToPlayOuchSound.forEach(player => {
    playSound(characterInfo[player.n].hurtSounds[player.s], myPlayerData.sprite, player);
  });
  playerDatasToPlayWeaponSound.forEach(playerData => {
      // Play the sound related to the weapon.
      var weaponSound = WeaponNumberMap[playerData.weapon].attackSound;
      if (weaponSound) {
        playSound(hexiObj.sound(weaponSound), playerData.sprite, myPlayerData.sprite);
      }
  });

  if (myPlayerData.dead) {
    if (!myPlayerData.lastDead) {  // Just died
      playerDeathStart = currentTime;

      console.log("Player died! Starting fadeout");

      playerDeathSprite = hexiObj.rectangle(
        window.innerWidth,
        window.innerHeight,
        "white",  // <fillColor></fillColor>
        "white",  // lineColor
        0,  // lineWidth 
        0,  // xPosition 
        0);  // yPosition
      playerDeathSprite.alpha = 0;
      playerDeathSprite.layer = 5000;  // In front of all other sprites including user interface.

      var deathMessageSprite = hexiObj.text(
          "You died.\nRefresh to respawn.",
          "40px sans-serif",
          "black",
          0, 0);
      deathMessageSprite.layer = 10000;  // Above the fade-out.
      hexiObj.stage.putCenter(deathMessageSprite);
    } else {
      // Continue fade-out
      var timeSinceDeath = currentTime - playerDeathStart;
      if (timeSinceDeath < 3000) {
        console.log(`${timeSinceDeath} ms since death, still fading out`)
        playerDeathSprite.alpha = timeSinceDeath / 3000;
      } else {
        playerDeathSprite.alpha = 1;
      }
    }
  }

  // Find any playerDatas that were not touched this round and remove -
  // they are gone from the world.
  forEachPlayerData(function(playerData) {
    if (!playerData.touched) {
      console.log(`Removing P${playerData.id} from the world`);
      playerData.sprite.visible = false;
      hexiObj.remove(playerData.sprite);
      playerDatas[playerData.id] = undefined;
    }
  });

  // Mark all weapons we are tracking as touched=false to detect removed weapons.
  // Make changes to weapon sprites from the current world state sent by the server.
  clearAllMapTouches(weaponDatas);
  for (var i = 0; i < currentWorld.w.length; i++) {
    var weapon = currentWorld.w[i];

    // Weapon might be new. If so, create a new sprite.
    var weaponData = null;
    if (!weaponDatas.hasOwnProperty(weapon.id)) {
      weaponData = {
        id: weapon.id,
        sprite: createNewWeaponSprite(weapon),
      };

      weaponDatas[weapon.id] = weaponData;
    }
    else {
      weaponData = weaponDatas[weapon.id];
    }
    weaponData.touched = true;
  }

  // Find any weaponDatas that were not touched this round and remove -
  // they are gone from the world.
  forEachWeaponData(function(weaponData) {
    if (!weaponData.touched) {
      console.log("Removing W", weaponData.id, "from the world");
      weaponData.sprite.visible = false;
      hexiObj.remove(weaponData.sprite);
      weaponDatas[weaponData.id] = undefined;
    }
  });

  // Mark all bullets we are tracking as touched=false to detect removed ones.
  // Process bullet changes sent by the server.
  clearAllMapTouches(bulletDatas);
  for (var i = 0; i < currentWorld.b.length; i++) {
    var bullet = currentWorld.b[i];
    var bulletData = null;
    if (!bulletDatas.hasOwnProperty(bullet.id)) {
      // New bullet
      bulletData = {
        id: bullet.id,
        sprite: createNewBulletSprite(bullet),
        serverBulletInfo: bullet,
      };
      bulletDatas[bullet.id] = bulletData;
    }
    else {
      bulletData = bulletDatas[bullet.id];
    }
    bulletData.touched = true;

    // Update the sprite with current world information.
    bulletData.sprite.x = bullet.x;
    bulletData.sprite.y = bullet.y;
  }

  // Find any bulletDatas that were not touched this round and remove -
  // they are gone from the world.
  forEachBulletData(function(bulletData) {
    if (!bulletData.touched) {
      bulletData.sprite.visible = false;
      hexiObj.remove(bulletData.sprite);
      bulletDatas[bulletData.id] = undefined;
    }
  });

  // Mark all aliens we are tracking as touched=false to detect removed aliens.
  // Process alien changes sent by the server.
  clearAllMapTouches(alienDatas);
  for (var i = 0; i < currentWorld.a.length; i++) {
    var alien = currentWorld.a[i];

    // If new, create a new sprite.
    var alienData = null;
    if (!alienDatas.hasOwnProperty(alien.id)) {
      alienData = {
        id: alien.id,
        sprite: createNewAlienSprite(alien),
        serverAlienInfo: alien,
        lastSoundCount: alien.sC,  // On reconnect, we don't want a ton of sounds, so use the current server count and play the next ones sent.
        lastHealth: alien.h,
      };
      alienDatas[alien.id] = alienData;
    }
    else {
      alienData = alienDatas[alien.id];
    }
    alienData.touched = true;

    // See if the soundCount is newer than our last known update, and if so, start a sound.
    var alienHurt = false;
    if (alien.sC > alienData.lastSoundCount) {
      alienData.lastSoundCount = alien.sC;
      //console.log(`A${alien.id} playing sound ${alien.s}`);
      playSound(alienSounds[alien.s], alien, myPlayerData.sprite);
      if (alien.s >= numAlienSounds) {
        alienHurt = true;
      }
    }

    var damageParticles = 0;
    if (alien.h <= 0) {
      if (!alienData.dead) {
        alienData.dead = true;
        console.log(`A${alien.id} dead`);
        damageParticles = 20;
      }
    } else if (alienHurt) {
      damageParticles = 8; 
    }
    if (damageParticles > 0) {
      // Create a spark spray using particles.
      hexiObj.createParticles(
        alien.x, alien.y,
        () => hexiObj.circle(8, "yellow"),
        levelWorldObj,
        damageParticles,  // Num particles
        0,  // Gravity
        false,  // randomSpacing
        0, 6.28,  // Min/max angle - allow whole circle
        6, 16,  // Min/max size
        0.5, 4,  // Min/max speed
        0.01, 0.03,  // Min/max scale speed
        0.05, 0.14,  // Min/max alpha speed
        0, 0);  // Min/max rotation speed
    }
    
    // Update the sprite with current world information.
    alienData.sprite.x = alien.x;
    alienData.sprite.y = alien.y;
    alienData.sprite.rotation = alien.d;
  }

  // Find any alienDatas that were not touched this round and remove -
  // they are gone from the world.
  forEachAlienData(function(alienData) {
    if (!alienData.touched) {
      console.log(`Removing A${alienData.id} from the world`);
      alienData.sprite.visible = false;
      hexiObj.remove(alienData.sprite);
      alienDatas[alienData.id] = undefined;
    }
  });

  if (scrollingTileCamera === null) {
    scrollingTileCamera = hexiObj.worldCamera(levelWorldObj, currentWorld.lW, currentWorld.lH);
    scrollingTileCamera.centerOver(myPlayerData.sprite);
  }

  // Control keys don't change anything locally, we send to the server and it
  // determines what happens.
  if (keyPressed[KEY_W]) { controlInfo.F = true; }  // Forward
  if (forwardButton.state === "down") { controlInfo.F = true; }  // Forward
  if (keyPressed[KEY_S]) { controlInfo.B = true; }  // Back
  if (backButton.state === "down") { controlInfo.B = true; }  // Backward
  if (keyPressed[KEY_A]) { controlInfo.L = true; }  // Left
  if (leftButton.state === "down") { controlInfo.L = true; }  // Left
  if (keyPressed[KEY_D]) { controlInfo.R = true; }  // Right
  if (rightButton.state === "down") { controlInfo.R = true; }  // Right
  if (keyPressed[KEY_SPACE]) { controlInfo.A = true; }  // Attack
  if (shootButton.state === "down") { controlInfo.A = true; }  // Attack
  for (var i = KEY_1; i <= KEY_9; i++) {
    if (keyPressed[i]) {
      //console.log("Weapon change key:", i - KEY_1);
      controlInfo.w = i - KEY_1;  // Weapon number 0-8
      currentWeaponChangeID++;
      controlInfo.wC = currentWeaponChangeID;
      break;
    }
  }

  // Send the control update to the game server if it's different from the last update.
  // TODO: This should be handled asynchronously instead of in the game
  // loop to avoid slowing down local animation.
  if (!Util.objectsEqual(controlInfo, prevControlInfo)) {
    primus.write(controlInfo);
    prevControlInfo = controlInfo;
  }

  // Keep the local player's sprite centered (approximately) on the screen, and move the level map around the player.
  scrollingTileCamera.follow(myPlayerData.sprite);

  var processingTimeMsec = (new Date()).getTime() - currentTime;
  if (processingTimeMsec > 50) {
    console.log(`Excessive loop processing time: ${processingTimeMsec} ms`);
  }
}

function createPlayerWeaponUISprite(weaponNumber) {
  if (playerWeaponSprite) { hexiObj.remove(playerWeaponSprite); }
  playerWeaponSprite = hexiObj.sprite(WeaponNumberMap[weaponNumber].sprite, 10, 37);
  playerWeaponSprite.scale.x = 1.5;
  playerWeaponSprite.scale.y = 1.5;
  playerWeaponSprite.alpha = 0.4;
  playerWeaponSprite.layer = 1000;  // Foremost
}

function createNewPlayerSprite(weaponNumber) {
  var series = hexiObj.spriteUtilities.frameSeries(0, 1, "player");
  var sprite = hexiObj.sprite(series, 0, 0);

  // Add to the tile world so its position remains relative to that world.
  levelWorldObj.addChild(sprite);

  sprite.fps = 2;
  sprite.playAnimation();
  sprite.anchor.x = 0.5;
  sprite.anchor.y = 0.5;
  sprite.layer = 100;  // In front of the tile map, weapons, aliens, but behind user interface

  var weapon = hexiObj.sprite(WeaponNumberMap[weaponNumber].playerHolding, 0, WeaponNumberMap[weaponNumber].yPos);
  weapon.anchor.x = 0.5;
  weapon.anchor.y = 0.5;
  weapon.layer = 101;
  sprite.addChild(weapon);

  return sprite;
}

function setPlayerWeaponSprite(playerSprite, weaponNumber) {
  playerSprite.children[0].texture = hexiObj.image(WeaponNumberMap[weaponNumber].playerHolding);
  playerSprite.children[0].y = WeaponNumberMap[weaponNumber].yPos;  
}

// Map from alien costume numbers into texture names.
// CODESYNC: Numeric keys are mapped in Alien.js.
var AlienCostumeIDMap = {
  0: "alien1_",
}; 

function createNewBulletSprite(serverBulletInfo) {
  var sprite = hexiObj.sprite("bullet", serverBulletInfo.x, serverBulletInfo.y);

  // Add to the tile world so its position remains relative to that world.
  levelWorldObj.addChild(sprite);

  sprite.anchor.x = 0.5;
  sprite.anchor.y = 0.5;
  sprite.layer = 7;  // Behind player and aliens but in front of map tiles and weapons.

  return sprite;
}

function createNewAlienSprite(serverAlienInfo) {
  var costumeName = AlienCostumeIDMap[serverAlienInfo.c];
  console.log(`Creating A${serverAlienInfo.id} with costume ${costumeName} at (${serverAlienInfo.x},${serverAlienInfo.y})`);
  var sprite = hexiObj.sprite(hexiObj.spriteUtilities.frameSeries(0, 1, costumeName), serverAlienInfo.x, serverAlienInfo.y);

  // Add to the tile world so its position remains relative to that world.
  levelWorldObj.addChild(sprite);

  sprite.fps = 2;
  sprite.playAnimation();
  sprite.anchor.x = 0.5;
  sprite.anchor.y = 0.5;
  sprite.layer = 10;  // Behind player but in front of map tiles.

  return sprite;
}

// Map from weapon numbers into texture names and sounds.
// CODESYNC: Numeric keys are mapped in Weapon.js.
var WeaponNumberMap = {
  0: { sprite: "weapon1",   attackSound: "Sounds/test.mp3", playerHolding: "weapon1", yPos: -14 },
  1: { sprite: "weapon1",   attackSound: "Sounds/test.mp3", playerHolding: "weapon1", yPos: -14 },
  2: { sprite: "weapon1",      attackSound: "Sounds/test.mp3", playerHolding: "weapon1", yPos: -16 },
  3: { sprite: "weapon1",   attackSound: "Sounds/test.mp3", playerHolding: "weapon1", yPos: -14 },
  4: { sprite: "weapon1",     attackSound: "Sounds/test.mp3", playerHolding: "weapon1", yPos: -14},
  5: { sprite: "weapon1",      attackSound: "Sounds/test.mp3", playerHolding: "weapon1", yPos: -14 }, 
  6: { sprite: "weapon1", attackSound: "Sounds/test.mp3", playerHolding: "weapon1", yPos: -14},
  7: { sprite: "weapon1",    attackSound: "Sounds/test.mp3", playerHolding: "weapon1", yPos: -14 },
};

function createNewWeaponSprite(serverWeaponInfo) {
  var costumeName = WeaponNumberMap[serverWeaponInfo.n].sprite;
  console.log("Creating W" + serverWeaponInfo.id + " with costume " + costumeName +
      " at (" + serverWeaponInfo.x + "," + serverWeaponInfo.y + ")");
  var sprite = hexiObj.sprite(costumeName, serverWeaponInfo.x, serverWeaponInfo.y);

  // Add to the tile world so its position remains relative to that world.
  levelWorldObj.addChild(sprite);

  sprite.layer = 5;  // Behind player and aliens but in front of map tiles.

  return sprite;
}

function createEmptyWorldUpdate() {
  return {
    p: [],
    z: [],
    w: [],
    b: [],
  };
}

function clearAllMapTouches(map) {
  Util.forEachInMap(map, function(val) { val.touched = false; });
}

// Plays a sound with attenuation based on distance, and pan effect based on relative position on screen.
// Consider the following 4 quadrants:
//
// Up, left    |    Up, right
//           player 
// Down, left  |    Down, right
//
// Overall sound strength is based on an inverse-linear decay with a base constant
// chosen empirically for best effect. (Real sound falls off as inverse square but
// for gameplay we want to be able to hear aliens further out.)
// Left/right pan strength is chosen as the cosine of the angle between the player
// and the sound emitter: If the emitter is directly right, the pan is fully to the
// right, same for direct left. Directly above or below is zero (center).
// Other locations mix based on the cosine value.
function playSound(soundObj, playerPos, soundPos) {
  var xDist = soundPos.x - playerPos.x;
  var yDist = soundPos.y - playerPos.y;
  var sqrDist = xDist * xDist + yDist * yDist;
  var dist = Math.sqrt(sqrDist);
  var volume;
  var distanceConstant = 256;  // Vol = 1 out to this pixel distance
  if (sqrDist !== 0) {
    volume = distanceConstant / dist;
    if (volume > 1) {
      volume = 1;
    } else if (volume < 0.01) {
      volume = 0.01;
    }
  } else {
    volume = 1;
  }

  // Pan can be from -1 to 1. We want cosine = adjacent / hypotenuse, where adjacent is xDist, hypotenuse calculated from adjacent and opposite (yDist).
  var pan;
  if (xDist !== 0) {
    pan = xDist / dist;
  } else {
    // Directly above or below player.
    pan = 0;
  }

  // If we are reusing the same sound buffer for multiple plays, restart it now to avoid the previous
  // play becoming suddenly attenuated partway through.
  console.log(`Playing sound with volume ${volume} and pan ${pan} for xDist ${xDist} yDist ${yDist}`);
  soundObj.restart();
  soundObj.volume = volume;
  soundObj.pan = pan;
}
