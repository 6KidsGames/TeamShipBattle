// Alien-related code.

const Physics = require('./Physics');
const Util = require('./Util');
const Log = require('./Log');
const Level = require('./Level');

// We have to limit the number of aliens in the world at one time to avoid excessive costs in
// sending world state updates.
const MaxAliens = 20;

// Reduce transmission sizes by sending only integers over the wire, mapped to costume names.
// CODESYNC: Numeric values are mapped in index.html back to costume names.
const AlienCostumeIDs = {
  "crawler_": 0,
  "vcrawleralien": 1,
  "calien_": 2,
  "vnormalalien": 3,
};

// Alien information by type, including attributes like speed and costume.
const AlienTypes = [
  { type: "Crawler", probability: 10, hitPoints: 5, speedPxFrame: 1, costumes: [ "crawler_", "vcrawleralien" ] },
  { type: "Shambler", probability: 10,  hitPoints: 7, speedPxFrame: 3, costumes: [ "calien_", "vnormalalien" ] },
  { type: "Walker", probability: 10, hitPoints: 10, speedPxFrame: 5, costumes: [ "calien_", "vnormalalien" ] },
  { type: "Runner", probability: 10, hitPoints: 15, speedPxFrame: 10, costumes: [ "calien_", "vnormalalien" ] },
];

// Sound file references for growls. On the client a common
// sound array has growls followed by hurt sounds.
// CODESYNC: index.html keeps the list.
const numGrowlSounds = 2;
const numHurtSounds = 1;

const alienMaxTurnPerFrameRadians = 0.4;
const alienHurtPauseMsec = 500;
const alienDeadLingerMsec = 300;

// Creates a map from a number in the range of 0..totalAlienProbability to the alien type
// to use if that number is chosen randomly.
let totalAlienProbability = 0;
function createAlienProbabilityNap() {
  let probMap = { };
  let currentProb = 0;
  AlienTypes.forEach(alienType => {
    totalAlienProbability += alienType.probability;
    for (let i = 0; i < alienType.probability; i++) {
      probMap[currentProb] = alienType;
      currentProb++;
    }
  });
  return probMap;
}
const alienProbabilityMap = createAlienProbabilityNap();

const alienMinTimeMsecBetweenGrowls = 12 * 1000;
const alienGrowlProbabilityPerSec = 0.05;
const maxOutstandingGrowls = 1;
const outstandingGrowlTimeWindowMsec = 6000;
let previousGrowlTimes = createInitialGrowlTimes();
let nextAlienNumber = 0;

function spawnAlien(level, currentTime) {
  let alienID = nextAlienNumber;
  nextAlienNumber++;

  let x = Util.getRandomInt(32, level.widthPx - 32);
  let y = Util.getRandomInt(32, level.heightPx - 32);

  let randomAlienNumber = Util.getRandomInt(0, totalAlienProbability);
  let alienType = alienProbabilityMap[randomAlienNumber];

  // A AlienInfo is the server-side data structure containing all needed server tracking information.
  // Only a subset of this information is passed to the clients, to minimize wire traffic.
  let alienInfo = {
    modelCircle: Physics.circle(x, y, 16),
    lastGrowlTime: currentTime,
    lastBiteTime: currentTime,
    lastHurtTime: 0,
    dead : false,
    deadAt: 0,
    type: alienType,

    // The portion of the data structure we send to the clients.
    alien: {
      id: alienID,

      // Place the alien in a random location on the map.
      // TODO: Account for the contents of the underlying tile - only place aliens into locations that
      // make sense, or at map-specific spawn points.
      x: x,
      y: y,
      d: Util.getRandomFloat(0, 2 * Math.PI),
      h: alienType.hitPoints,
      c: AlienCostumeIDs[alienType.costumes[Util.getRandomInt(0, alienType.costumes.length)]],
      s: 0,  // When sC (soundCount) is increased, this is the sound index to play.
      sC: 0,  // Incremented whenever the alien growls or is hurt. Used by the client to know when to play a sound.
    }
  };

  return alienInfo;
}

// Called on the world update loop.
// currentTime is the current Unix epoch time (milliseconds since Jan 1, 1970).
// Returns false if the alien remains in the world, or true if the alien is dead
// and should be removed.
function updateAlien(alienInfo, currentTime, level) {
  if (alienInfo.dead) {
    if (currentTime - alienInfo.deadAt >= alienDeadLingerMsec) {
      return true;
    }
    return false;
  }
  
  if ((currentTime - alienInfo.lastHurtTime) < alienHurtPauseMsec) {
    // Alien paused for a moment since it got hurt. It does not move or growl for a little while.
    return false;
  }

  let alien = alienInfo.alien;

  // AI: Random walk. Turn some amount each frame, and go that way to the maximum possible distance allowed
  // (based on the alien's speed).
  let angleChange = Util.getRandomFloat(-alienMaxTurnPerFrameRadians, alienMaxTurnPerFrameRadians);
  alien.d += angleChange;

  let speedPxPerFrame = alienInfo.type.speedPxFrame;
  alien.x -= speedPxPerFrame * Math.sin(alien.d);
  alien.y += speedPxPerFrame * Math.cos(alien.d);
  Level.clampPositionToLevel(level, alien);
  alienInfo.modelCircle.centerX = alien.x;
  alienInfo.modelCircle.centerY = alien.y;

  // Occasional growls. We tell all the clients to use the same growl sound to get a nice
  // echo effect if people are playing in the same room.
  // We also limit to at most a couple of growls started in a sliding time window, to
  // avoid speaker and CPU overload at the client, and excessive updates across the network. 
  let msecSinceLastGrowl = currentTime - alienInfo.lastGrowlTime; 
  if (msecSinceLastGrowl > alienMinTimeMsecBetweenGrowls) {
    let growlProbabilityInMsec = msecSinceLastGrowl * alienGrowlProbabilityPerSec;
    if (Util.getRandomInt(0, msecSinceLastGrowl) < growlProbabilityInMsec) {
      if (registerGrowl(currentTime)) {
        let alien = alienInfo.alien;
        alien.s = Util.getRandomInt(0, numGrowlSounds);  // Growl sounds are at the head of the client's sound array
        alien.sC++;
        alienInfo.lastGrowlTime = currentTime;
      } 
    }
  }

  return false;
}

function hitByPlayer(alienInfo, weaponStats, currentTime) {
  let alien = alienInfo.alien;
  alien.h -= weaponStats.damage;
  Log.debug(`A${alien.id} hit, ${weaponStats.damage} damage, ${alien.h} hp remaining`)
  if (alien.h <= 0) {
    alienInfo.dead = true;
    alienInfo.deadAt = currentTime;
  } else {
    alienInfo.lastHurtTime = currentTime;
    
    // Pick a hurt sound to play. Hurt sounds come after growls in the client's sound array.
    alien.s = numGrowlSounds + Util.getRandomInt(0, numHurtSounds);
    alien.sC++;
  }
}

// Returns true and registers the current time in the global sliding time window if we are able to
// emit a growl at this time, based on the sliding time window and max outstanding growls.
function registerGrowl(currentTime) {
  // Latest growl times are at the end of the array. Check the last time in the array and see if we can pop it.
  if ((currentTime - previousGrowlTimes[previousGrowlTimes.length - 1]) >= outstandingGrowlTimeWindowMsec) {
    previousGrowlTimes.pop();  // Remove old entry at end.
    previousGrowlTimes.unshift(currentTime);  // Add new entry at beginning.
    return true;
  }
  return false;
}

function isBiting(alienInfo, playerInfo, currentTime) {
  if (alienInfo.dead) {
    return false;
  }
  let msecSinceLastBite = currentTime - alienInfo.lastBiteTime;
  if (msecSinceLastBite >= 1000) {
    if (Physics.hitTestCircles(playerInfo.modelCircle, alienInfo.modelCircle)) {
      // Log.debug(`A${alienInfo.alien.id}: Biting ${playerInfo.player.id}`);
      alienInfo.lastBiteTime = currentTime;
      return true;
    }
  }
  return false;
}

function createInitialGrowlTimes() {
  let a = [];
  for (let i = 0; i < maxOutstandingGrowls; i++) {
    a.push(0);
  }
  return a;
}

// Returns true if the bullet hit the alien, indicating that the bullet
// disappears from the world, the alien takes damage, and a hit sound is played.
function checkBulletHit(alienInfo, bulletInfo, currentTime) {
  if (alienInfo.dead) {
    return false;
  }
  if (Physics.hitTestCircles(bulletInfo.modelCircle, alienInfo.modelCircle)) {
    Log.debug(`B${bulletInfo.bullet.id} hit A${alienInfo.alien.id}`);
    hitByPlayer(alienInfo, bulletInfo.weaponStats, currentTime);
    return true;
  }
  return false;
}


// --------------------------------------------------------------------
// Exports
module.exports.spawnAlien = spawnAlien;
module.exports.updateAlien = updateAlien;
module.exports.isBiting = isBiting;
module.exports.hitByPlayer = hitByPlayer;
module.exports.checkBulletHit = checkBulletHit;
module.exports.MaxAliens = MaxAliens;
