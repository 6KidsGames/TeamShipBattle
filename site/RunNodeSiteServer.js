// Main Node.js entry point for TeamShipBattle.

'use strict';

const Level = require('./Level'); 
const Log = require('./Log');
const Physics = require('./Physics');
const Player = require('./Player');
const Util = require('./Util');
const Weapon = require('./Weapon');
const Alien = require('./Alien');
const Bullet = require('./Bullet');
const Telemetry = require('./Telemetry');

Telemetry.init();

// We use Express (http://expressjs.com/) for serving web pages and content.
var express = require('express');
var webApp = express();

// Do NOT enable compression - this will greatly add to the per-message
// latency of high-speed messages during the game.
// Example latencies - 20 aliens in world, WebSockets transport, BinaryPack transform, 5 connected clients:
//   - With compression: 70-85 ms
//   - Compression off: 0-3 ms 
//var compression = require('compression');  // Compress content returned through HTTP.
//webApp.use(compression());

var httpServer = require('http').createServer(webApp);
var network = require('./Network.js');

// Set up static file serving and a default route to serve index.html.
webApp.use('/scripts', express.static(__dirname + '/scripts', { maxAge: '1m' }));
webApp.use('/css', express.static(__dirname + '/css', { maxAge: '1d' }));
webApp.use('/images', express.static(__dirname + '/images', { maxAge: '1h' }));
webApp.use(express.static(__dirname, { maxAge: '10m' }));

// Attach Primus to the HTTP server. We included uws and ws WebSockets
// frameworks in Setup.cmd.
var primus = require('primus');
var primusOptions = {
  // websockets is not the fastest but it Just Works. UWS would be nice but not supported on Windows.
  transformer: 'websockets',
  
  // Wire transport setting - JSON text vs. binary.
  // Binary is used for speed - makes smaller messages over the wire (or wireless), meaning lower latency
  // and better server scalability.
  // Set to 'binary' for smaller and faster messages, which makes for a more scalable server.
  // Set to 'JSON' for debugging using Chrome (F12, Network tab, click the Primus websocket entry, click Frames, and click on any frame).
  //
  // Message size info gathered 9/3/2016 (after message size optimizations added):
  // JSON:
  // - First world msg 83
  // - 1 alien 166
  // - ~70 bytes per additional alien
  //
  // Binary:
  // - First world msg: 55
  // - 1 alien 108
  // - ~45 bytes per additional alien
  parser: 'binary',  // 'JSON',  
};
var primusServer = new primus(httpServer, primusOptions);

// Restart timer
var serverStartTime = (new Date()).getTime();

// Server-side object tracking.
var currentPlayers = { };  // Maps from spark ID (string) to PlayerInfo server data structure..
function forEachPlayer(func) { Util.forEachInMap(currentPlayers, func); }
var currentAliens = [ ];
var currentWeapons = [ ];
let currentBullets = [ ];
var currentLevel = Level.chooseLevel();

primusServer.on('connection', spark => {
  Log.info(spark.id, 'Connected to spark from', spark.address, '- sending first world update');
  Telemetry.onUserConnected();
  spark.write(prevWorldUpdate);

  currentPlayers[spark.id] = Player.spawnPlayer(spark, currentLevel);

  spark.on('data', function received(data) {
    if (data.t === 0) {  // c == control
      // Update our current view of what the player is doing.
      // Our world update loop will use this info to update all players with
      // each other's info.
      currentPlayers[spark.id].latestControlInfo = data;
    }
    else {
      Log.error("Received unknown message type " + data.t)
    }
  });
});

primusServer.on('disconnection', spark => {
  Log.debug(spark.id, 'Spark disconnected from', spark.address);
  Telemetry.onUserDisconnected();
  currentPlayers[spark.id] = undefined;
});

network.DisplayLocalIPAddresses();

let port = process.env.port || 8080;
Log.info(`Opening port for listen: ${port}`);
httpServer.listen(port, function() {
  Log.info('Open http://localhost:8080 in your browser');
});

// Augment Array prototype to remove object from array, removes first matching object only.
Array.prototype.remove = function (v) {
  var index = this.indexOf(v); 
  if (index != -1) {
    this.splice(index, 1);
    return true;
  }
  return false;
}

// We keep the last world update message sent, to reduce updates from the
// server when there have been no changes.
var prevWorldUpdate = createEmptyWorldUpdateMessage();

// World update loop.
const worldUpdateHz = 20;
setInterval(worldUpdateLoop, 1000 / worldUpdateHz /*msec*/);
function worldUpdateLoop() {
  let currentDateTime = new Date();
  let currentTime = currentDateTime.getTime();
  
  // We need to restart at night to avoid the Node process getting gummed up with a fragmented heap and other
  // problems that make it eventually unresponsive. In the Kudu/Azure hosting environment we are running inside IIS
  // and cannot set the periodic restart setting to less than 29 hours. So we orchestrate our own
  // process exit to allow recycling in IIS.
  const minRunTimeMsec = 60 * 60 * 1000;  // 1 hour in milliseconds
  if ((currentTime - serverStartTime) >= minRunTimeMsec && 
      currentDateTime.getUTCHours() === 10) {  // 2:00a Pacific during winter, 3:00a during Daylight Savings
    Log.info("Exiting the server process on restart timer");
    process.exit();
  }
  
  let worldUpdateMessage = createEmptyWorldUpdateMessage();
  let numConnectedPlayers = Math.max(1, Object.keys(currentPlayers).length);

  if (Util.getRandomInt(0, 200 / numConnectedPlayers) === 0) {
    currentWeapons.push(Weapon.spawnWeapon(currentLevel, currentTime));
  }

  if (currentAliens.length < Alien.MaxAliens &&
      Util.getRandomInt(0, 250 / numConnectedPlayers) === 0) {
    // TODO: Don't spawn within easy reach of players' current positions.
    currentAliens.push(Alien.spawnAlien(currentLevel, currentTime));
  }

  let aliensToRemove = [];
  currentAliens.forEach(alienInfo => {
    if (Alien.updateAlien(alienInfo, currentTime, currentLevel)) {
      aliensToRemove.push(alienInfo);
    }
    else {
      worldUpdateMessage.a.push(alienInfo.alien);  // Send only the client-side data structure.
    }
  });
  aliensToRemove.forEach(deadAlienInfo => currentAliens.remove(deadAlienInfo));

  let bulletsToRemove = [];
  currentBullets.forEach(bulletInfo => {
    if (!Bullet.updateBullet(bulletInfo, currentTime, currentLevel)) {
      bulletsToRemove.push(bulletInfo);
    } else {
      let bulletHitAAlien = currentAliens.some(alienInfo => Alien.checkBulletHit(alienInfo, bulletInfo, currentTime, currentLevel));
      if (bulletHitAAlien) {
        bulletsToRemove.push(bulletInfo);
      } else {
        worldUpdateMessage.b.push(bulletInfo.bullet);  // Send only the client-side data structure.
      }
    }
  });
  bulletsToRemove.forEach(deadBulletInfo => currentBullets.remove(deadBulletInfo));

  forEachPlayer(playerInfo => {
    let player = playerInfo.player;
    if (player.dead) {
      // We are waiting for respawn and cannot interact with the world.
    } else {
      let controlInfo = playerInfo.latestControlInfo;

      Player.updatePlayerFromClientControls(playerInfo, currentLevel);

      if (controlInfo.A) {  // Attack
        let weaponTracker = playerInfo.currentWeapon;
        let weaponStats = weaponTracker.weaponType;
        if ((currentTime - playerInfo.lastWeaponUse) >= weaponStats.rechargeMsec) {
          let ammo = weaponTracker.currentAmmo;
          if (ammo < 0) {
            // Melee weapon
            playerInfo.lastWeaponUse = currentTime;
            player.wC++;  // Increment so client knows that current weapon is being used.

            // Melee weapons differ from ranged weapons - strike nearest alien if close enough.
            let alienDistances = [];
            currentAliens.forEach(alienInfo => {
              if (!alienInfo.dead) {
                alienDistances.push({ alienInfo: alienInfo, sqrDist: Physics.sqrDistanceCircles(alienInfo.modelCircle, playerInfo.modelCircle) });
              }
            });
            if (alienDistances.length > 0) {
              alienDistances.sort((a, b) => a.sqrDist - b.sqrDist);
              let closestAlien = alienDistances[0];
              let sqrWeaponRange = weaponStats.rangePx * weaponStats.rangePx;
              Log.debug(`Melee: Closest A ${closestAlien.sqrDist}, we can hit out to ${sqrWeaponRange}`);
              if (closestAlien.sqrDist <= sqrWeaponRange) {
                // TODO - add in logic to only hit in front of player instead of in any direction.
                //let angle = Math.atan2(closestAlien.alien.modelCircle.y - playerInfo.modelCircle.y,
                //  closestAlien.alien.modelCircle.x - playerInfo.modelCircle.x);
                //const halfFrontalArc = Math.PI / 3;
                //if (angle >= -halfFrontalArc && angle <= halfFrontalArc) {
                  Alien.hitByPlayer(closestAlien.alienInfo, weaponStats, currentTime);
                  Log.debug(`A${closestAlien.alienInfo.alien.id} hit, remainingHealth ${closestAlien.alienInfo.alien.h}`);
                //}
              }
            } 
          } else if (ammo > 0) {
            // Distance weapon with enough ammo to fire.
            playerInfo.lastWeaponUse = currentTime;
            player.wC++;  // Increment so client knows that current weapon is being used.
            currentBullets.push(Bullet.spawnBullet(player.x, player.y, player.d, weaponStats));
            
            ammo--;
            if (ammo > 0) {
              weaponTracker.currentAmmo = ammo;
            } else {
              Player.dropWeapon(playerInfo, weaponTracker);
            }
          }
        }
      }

      let weaponsToRemove = [];
      currentWeapons.forEach(weaponInfo => {
        if (Weapon.isTimedOut(weaponInfo, currentTime)) {
          weaponsToRemove.push(weaponInfo);
        } else if (Weapon.isPickedUp(weaponInfo, playerInfo)) {
          Log.debug(`Player ${playerInfo.player.id} touching weapon ${weaponInfo.type.name} id ${weaponInfo.weapon.id}`);
          if (Player.pickedUpWeapon(playerInfo, weaponInfo, currentTime)) {
            weaponsToRemove.push(weaponInfo);
          } else {
            Log.debug(`Player ${playerInfo.player.id} did not pick up weapon ${weaponInfo.weapon.id}`);
          }
        }
      });
      weaponsToRemove.forEach(w => currentWeapons.remove(w));

      // Must be last action in player update.
      Player.updatePlayer(playerInfo, currentTime);
    }

    currentAliens.forEach(alienInfo => {
      if (Alien.isBiting(alienInfo, playerInfo, currentTime)) {
        Player.hitByAlien(playerInfo, currentTime);
      }
    });
    
    worldUpdateMessage.p.push(player);  // Player object, never playerInfo.
  });

  currentWeapons.forEach(weaponInfo => {
    worldUpdateMessage.w.push(weaponInfo.weapon);  // Send only the client-side data structure.
  });

  // Send world update to all clients, as long as the world has changed
  // from the last time we sent.
  if (!Util.objectsEqual(prevWorldUpdate, worldUpdateMessage)) {
    //Log.debug("Sending world update");
    let sendSW = Telemetry.startStopwatch();
    primusServer.write(worldUpdateMessage);  // Broadcasts message to all sparks
    Telemetry.sendStopwatch(sendSW, "sendWorldUpdateMsec");

    // Deep clone the original message so we can get new player objects created
    // in order to get a valid comparison in object_equals().
    let cloneSW = Telemetry.startStopwatch();
    prevWorldUpdate = JSON.parse(JSON.stringify(worldUpdateMessage));
    Telemetry.sendStopwatch(cloneSW, "cloneWorldMsec");
  }

  let processingTimeMsec = (new Date()).getTime() - currentTime;
  Telemetry.sendServerLoopStats(processingTimeMsec, currentAliens.length);
  if (processingTimeMsec > 50) {
    Log.warning(`Excessive loop processing time: ${processingTimeMsec} ms`);
  }
}

function createEmptyWorldUpdateMessage() {
  // Property names deliberately kept short to reduce space on the network.
  return {
    t: 0,  // Message type (world update)
    l: currentLevel.name,
    lW: currentLevel.widthPx,
    lH: currentLevel.heightPx,
    p: [],  // Players
    a: [],  // Aliens
    w: [],  // Weapons
    b: [],  // Bullets
  };
}
