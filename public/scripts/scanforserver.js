/*
 * Copyright 2014, Gregg Tavares.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Gregg Tavares. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

"use strict";

var main = function(Cookie, IO, IPUtils, ProgressBar) {
  var $ = function(id) {
    return document.getElementById(id);
  };

  var debug = window.location.href.indexOf("debug") > -1;
  var local = window.location.href.indexOf("local") > -1;
  var log = debug ? console.log.bind(console) : function() { };

  var getGamesUrl = "http://happyfuntimes.net/api/getgames";
  if (debug) {
    getGamesUrl = "http://localhost:1337/api/getgames";
  }
  if (local) {
    getGamesUrl = "http://local.happyfuntimes.net/api/getgames";
  }
  var nameCookie = new Cookie("name");
  var startingAddress = 1;
  var endingAddress = debug ? 5 : 254;
  var numRequestsInProgress = 0;
  var maxSimultaneousRequests = 4;
  var timeout = 400; // in ms
  var port = 8080;
  var found = false;

  var fastScanAddresses = [];
  var fullScanAddresses = [];
  var totalThingsToDo = 0;
  var totalThingsDone = 0;

  var progressBar = new ProgressBar($("scan-progress"));

  /**
   * should call this after every request as it not only updates
   * the progress bar but also accounting of requests.
   */
  var updateProgress = function() {
    ++totalThingsDone;
    --numRequestsInProgress;
    progressBar.set(totalThingsDone / totalThingsToDo);

    if (!found && totalThingsDone >= totalThingsToDo) {
      var elements = document.querySelectorAll(".hidden");
      for (var ii = 0; ii < elements.length; ++ii) {
        var elem = elements[ii];
        elem.style.display = "block";
      }
    }
  };

  /**
   * Deal with response from hft.net
   */
  var checkHFTResponse = function(err, obj) {
    log("hft response: " + JSON.stringify(obj));
    // It was bad
    if (err) {
      console.error(err);
      // start scanning
      IPUtils.getLocalIpAddresses(scan);
      return;
    }

    checkGamesRunning(obj);
  };

  /**
   * HFT send back the list of games running on a certain network.
   * Check if they all respond. If there's only one go to it.
   * If there's more than one let the user select. If zero then
   * scan.
   */
  var checkGamesRunning = function(ipAddresses) {
    // Check each ipAddress returned.
    var runningHFTs = [];
    var numChecked = 0;

    var checkNextHFT = function() {
      if (numChecked == ipAddresses.length) {
        if (runningHFTs.length == 0) {
          // There was nothing, start scanning
          IPUtils.getLocalIpAddresses(scan);
        } else if (runningHFTs.length == 1) {
          goToUrl("http://" + runningHFTs[0]);
        } else {
          askPlayerWhichHFT(runningHFTs);
        }
        return;
      }

      var ipAddress = ipAddresses[numChecked++];
      makeHFTPingRequest(ipAddress, function(ipAddress) {
        log("ping hft: " + ipAddress);
        return function(err, obj) {
          if (!err) {
            runningHFTs.push(ipAddress);
          }
          checkNextHFT();
        };
      }(ipAddress));
    };
    checkNextHFT();
  };

  var askPlayerWhichHFT = function(runningHFTs) {
    log("ask player to choose hft: " + runningHFTs);
  };

  log("checking: " + getGamesUrl);
  IO.sendJSON(getGamesUrl, {}, checkHFTResponse, { timeout: 5000 });

  var scan = function(ipAddresses) {
    if (ipAddresses) {
      addFullScans(ipAddresses);
    }

    addFastScans()
  };

  // Check the most common home class C ip addresses.
  var commonIpAddresses = [
    "192.168.0.0",    // D-Link, Linksys, Netgear, Senao, Trendtech,
    "192.168.1.0",    // 3com, Asus, Dell, D-Link, Linksys, MSI, Speedtouch, Trendtech, US Robotics, Zytel,
    "192.168.2.0",    // Belkin, Microsoft, Trendtech, US Robotics, Zyxel,
    "192.168.10.0",   // Motorola, Trendtech, Zyxel
    "192.168.11.0",   // Buffalo
    "10.0.0.0",       // Speedtouch, Zyxel,
    "10.0.1.0",       // Apple, Belkin, D-Link

    "192.168.20.0",   // Motorola
    "192.168.30.0",   // Motorola
    "192.168.50.0",   // Motorola
    "192.168.62.0",   // Motorola
    "192.168.100.0",  // Motorola
    "192.168.101.0",  // Motorola
    "192.168.4.0",    // Zyxel
    "192.168.8.0",    // Zyxel
    "192.168.123.0",  // US Robotics
    "192.168.254.0",  // Flowpoint
  ];

  if (debug) {
    commonIpAddresses = [
      "192.168.0.0",
      "10.0.0.0",
      "192.168.123.0",
    ];
  }

  var addFastScans = function() {
    // Check these addresses first
    var commonCClassParts = [1, 2, 3, 10, 11, 12, 20, 21, 22, 50, 51, 52, 100, 101, 102, 150, 151, 152, 200, 201, 202];

    commonIpAddresses.forEach(function(ipAddress) {
      commonCClassParts.forEach(function(cClassPart) {
        fastScanAddresses.push(ipAddress.replace(/\d+$/, cClassPart));
        ++totalThingsToDo;
      });
    });
    doNextThing();
  };

  var addFullScans = function(ipAddresses) {
    log("addFullScan: " + ipAddresses);
    ipAddresses.forEach(function(ipAddress) {
      for (var ii = startingAddress; ii <= endingAddress; ++ii) {
        fullScanAddresses.push(ipAddress.replace(/\d+$/, ii));
        ++totalThingsToDo;
      }
    });
    doNextThing();
  };

  var goToUrl = function(baseUrl) {
    found = true;
    var name = nameCookie.get() || "";
    var url = baseUrl + "/enter-name.html?fromHFTNet=true&name=" + encodeURIComponent(name);
    log("**GOTO** url: " + url);
    if (!debug) {
      window.location.href = url;
    }
  };

  var checkGoodResponse = function(url, obj) {
    goToUrl(url);
  };

  var fastScanCheckAddress = function(url, ipAddress) {
    var timeSent = Date.now();
    return function(err, obj) {
      updateProgress();

      if (found) {
        return;
      }

      if (err) {
        // it wasn't the correct place BUT did we timeout?
        var now = Date.now();
        var elapsedTime = now - timeSent;
        if (elapsedTime < timeout * 0.8) {
          log("fastScan: " + ipAddress + " got fast response");
          // We didn't timeout which means we probably got a rejected from some machine
          // So do a fullscan of this network

          // Remove all pending fastScans for this ip
          var prefix = ipAddress.replace(/\.\d+$/, '.');
          fastScanAddresses = fastScanAddresses.filter(function(address) {
            var keep = address.substring(0, prefix.length) != prefix;
            if (!keep) {
              updateProgress();
            }
            return keep;
          });

          addFullScans([ipAddress]);
        } else {
          doNextThing();
        }
      } else {
        checkGoodResponse(url, obj);
      }
    };
  };

  var fullScanCheckAddress = function(url, ipAddress) {
    return function(err, obj) {
      updateProgress();

      if (found) {
        return;
      }

      if (err) {
        log("fullScan: " + ipAddress + " failed");
        doNextThing();
      } else {
        checkGoodResponse(url, obj);
      }
    };
  };

  var makeHFTPingRequest = function(ipAndPort, fn) {
    var url = "http://" + ipAndPort;
    IO.sendJSON(url, {cmd: 'happyFunTimesPing'}, function(err, obj) {
      if (!err) {
        if (obj.version != "0.0.0") {
          err = "bad api version: " + obj.version;
        } else if (obj.id != "HappyFunTimes") {
          err = "bad id: " + obj.id;
        }
      }

      fn(err, obj);
    }, { timeout: timeout });
  };

  var startScan = function(ipAddress, fn) {
    ++numRequestsInProgress;
    makeHFTPingRequest(ipAddress + ":" + port, fn(url, ipAddress));
  };

  var doNextThing = function() {
    // If there are fullScan things do those
    if (fullScanAddresses.length) {
      log("fullScan: " + fullScanAddresses[0]);
      startScan(fullScanAddresses.shift(), fullScanCheckAddress);
    } else if (fastScanAddresses.length) {
      // If there are fastScan things do those
      log("fastScan: " + fastScanAddresses[0]);
      startScan(fastScanAddresses.shift(), fastScanCheckAddress);
    }

    if (numRequestsInProgress < maxSimultaneousRequests &&
        (fastScanAddresses.length || fullScanAddresses.length)) {
      doNextThing();
    }
  };
};

// Start the main app logic.
requirejs(
  [ './cookies',
    './io',
    './iputils',
    './progress',
  ],
  main
);


