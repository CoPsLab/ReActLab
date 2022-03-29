import * as util from './util.js'

function initializeClient(game) {
    const defaultTextSettings = {
        color: '#00AFFF',
        fontSize: '50px',
        align: 'center',
        fontStyle: 'bold',
        fixedWidth: game.scale.width,
        wordWrap: { width: 0.9 * game.scale.width }
    }

    let setInitialized = null;
    const initialized = new Promise(resolve => setInitialized = resolve);

    // using the current path also for socket.io connections
    const baseName = window.location.pathname.substr(0, window.location.pathname.lastIndexOf('/'));

    var Client = {
        socket: io.connect({ path: baseName + '/socket.io' }),
        registry: {},
        phaser: null,
        timers: [],
        clickTriggers: [],
        keyTriggers: { any: [] },
        cursorTriggers: {},
        slidingAssets: {},
        lockedAssets: {},
        trailedAsset: {},
        lastDisplaySize: {
            width: undefined,
            height: undefined
        },
        crossbox: undefined,
        interactablesToPublish: [],

        updatePositions(width, height) {
            const factorW = width / (this.lastDisplaySize.width || width);
            const factorH = height / (this.lastDisplaySize.height || height);
            this.info(factorW + " " + factorH);

            Object.values(this.registry).forEach(entry => {
                if (entry.text) {
                    // entry.text.setScale(entry.text.scale * factorW);
                    entry.text.x *= factorW;
                    entry.text.y *= factorH;
                }
            })

            this.lastDisplaySize.width = width;
            this.lastDisplaySize.height = height;
        },

        lastUpdate: -1,
        update(time) {
            if (Client.lastUpdate < 0) {
                this.lastUpdate = time;
            } else {
                var deltaT = time - this.lastUpdate;
                if (deltaT > 10) {
                    this.lastUpdate = time;
                    Object.entries(this.slidingAssets).forEach(kv => {
                        var obj = kv[1];
                        var pos = obj.asset.sprite;
                        var posDiff = ({
                            x: obj.dir.x * deltaT / 1000.0,// /vectorLength,// * deltaT, 
                            y: obj.dir.y * deltaT / 1000.0 ///vectorLength// * deltaT/1000.0
                        })
                        var nPos = util.toNormSpace(pos);
                        nPos.x += posDiff.x
                        nPos.y += posDiff.y;
                        obj.asset.moveTo(nPos);
                        if (obj.stopAtBorders && (Math.abs(nPos.x) > 0.5 || Math.abs(nPos.y) > 0.5)) {
                            obj.asset.stopSliding()
                        }
                        else if (nPos.y > obj.stopAt.maxY || nPos.y < obj.stopAt.minY) {
                            obj.asset.stopSliding();
                        }
                        else if (nPos.x > obj.stopAt.maxX || nPos.x < obj.stopAt.minX) {
                            obj.asset.stopSliding();
                        }
                    })

                    Object.entries(this.lockedAssets).forEach(kv => {
                        var objName = kv[0]
                        var left = kv[1].left
                        var right = kv[1].right
                        var preScale = kv[1].preScale
                        var x = (left.sprite.x + right.sprite.x) / 2
                        var y = (left.sprite.y + right.sprite.y) / 2
                        var diffX = Math.abs(right.sprite.x - left.sprite.x);
                        var diffY = Math.abs(right.sprite.y - left.sprite.y);
                        var len = Math.sqrt(diffX * diffX + diffY * diffY)
                        var obj = this.registry[objName]
                        obj.sprite.x = x
                        obj.sprite.y = y
                        var angle = Math.acos((right.sprite.x - left.sprite.x) / len);
                        obj.rotateTo(angle)
                        if (kv[1].doScale) {
                            obj.sprite.setScale(preScale.x * len, preScale.y)
                        }
                    })
                }
            }
        },

        createInteractable(params) {
            const created = this.phaser.add.sprite(params.pos.x, params.pos.y, params.name);
            created.setOrigin(0.5);
            return this.registry[params.name] = {
                sprite: created,
                timedEvent: null,
                getPos() {
                    return util.toNormSpace({ x: this.sprite.x, y: this.sprite.y })
                },
                moveTo(pos) {
                    var npos = util.toScreenSpace(pos);
                    this.sprite.x = npos.x;
                    this.sprite.y = npos.y;
                    if (pos.z)
                        this.sprite.depth = pos.z;
                    return this;
                },
                rotateTo(radians) {
                    this.sprite.setOrigin(0.5);
                    this.sprite.rotation = radians;
                    return this;
                },
                setScale(scale) {
                    this.sprite.setScale(scale.scaleX, scale.scaleY);
                    return this;
                },
                setVisible(boolval) {
                    this.sprite.setVisible(boolval);
                    return this;
                },
                attachToCursor(options) {
                    Client.cursorTriggers[params.name] = (pos, isDown) => {
                        if (!isDown && options.detachOnMouseUp) {
                            this.detachFromCursor()
                            var timeDiff = new Date().getTime() - this.startTime;

                            var angleDir = Math.atan2(pos.y - this.startPos.y, pos.x - this.startPos.x)
                            var dir = {
                                x: (Math.cos(angleDir)), //(pos.x - this.startPos.x)
                                y: (Math.sin(angleDir))
                            }
                            if (options.slideOnRelease && (!options.slideTimeout || options.slideTimeout >= timeDiff)) {
                                Client.slidingAssets[params.name] = {
                                    stopAtBorders: options.stopAtBorders,
                                    asset: this,
                                    dir: dir,
                                }
                                Client.socket.emit('sliding', {
                                    startPos: this.startPos,
                                    name: params.name,
                                    state: 'started',
                                    dir: dir,
                                    pos: pos
                                });
                            } else if (options.slideTimeout && options.slideTimeout < timeDiff) {
                                Client.socket.emit('sliding', {
                                    startPos: this.startPos,
                                    name: params.name,
                                    state: 'timeout'
                                })
                                delete this.startPos
                                delete this.startTime
                            } else {
                                delete this.startPos
                                delete this.startTime
                            }
                        } else {
                            if (!this.startPos) this.startPos = pos
                            if (!this.startTime) this.startTime = new Date().getTime()
                            if (options.limitX) {
                                if (pos.x > options.limitX.max)
                                    pos.x = options.limitX.max;
                                else if (pos.x < options.limitX.min)
                                    pos.x = options.limitX.min;
                            }
                            if (options.limitY) {
                                if (pos.y > options.limitY.max)
                                    pos.y = options.limitY.max;
                                else if (pos.y < options.limitY.min)
                                    pos.y = options.limitY.min;
                            }
                            var npos = util.toScreenSpace(pos)
                            if (options.limitAxis == "x")
                                this.sprite.x = npos.x;
                            else if (options.limitAxis == "y")
                                this.sprite.y = npos.y;
                            else
                                this.moveTo(pos)
                        }
                    }
                },
                detachFromCursor() {
                    delete Client.cursorTriggers[params.name]
                    Client.socket.emit('detachedFromCursor', { name: params.name, pos: this.getPos() })
                    return this.getPos()
                },
                startSliding(options) {
                    Client.slidingAssets[params.name] = {
                        stopAtBorders: options.stopAtBorders,
                        asset: this,
                        dir: { x: options.x, y: options.y },
                        stopAt: options.stopAt
                    }
                },
                stopSliding() {
                    Client.socket.emit('sliding', {
                        startPos: this.startPos,
                        name: params.name,
                        state: 'stopped',
                    })
                    delete Client.slidingAssets[params.name]
                    delete this.startPos
                    delete this.startTime
                },
                lockBetween(options) {
                    var left = Client.registry[options.left];
                    var right = Client.registry[options.right];
                    if (left && right) {
                        if (options.doScale && !options.preScale)
                            options.preScale = { x: 1, y: 1 }
                        Client.lockedAssets[params.name] = {
                            left: left,
                            right: right,
                            doScale: options.doScale,
                            preScale: options.preScale
                        }
                        return true
                    }
                    return false
                },
                stopLock() {
                    delete Client.lockedAssets[params.name]
                },
                lockTrail(options) {
                    var screenPosStart = util.toScreenSpace(options.startPoint)
                    var screenPosEnd = util.toScreenSpace(options.endPoint)
                    var x = (screenPosStart.x + screenPosEnd.x) / 2
                    var y = (screenPosStart.y + screenPosEnd.y) / 2
                    
                    var diffX = Math.abs(screenPosStart.x - screenPosEnd.x);
                    var diffY = Math.abs(screenPosStart.y - screenPosEnd.y);
                    var len = Math.sqrt(diffX * diffX + diffY * diffY);
                    var angle = Math.acos((screenPosStart.x - screenPosEnd.x) / Math.sqrt(diffX * diffX + diffY * diffY));
                    var obj = this
                    obj.sprite.x = x
                    obj.sprite.y = y
                    obj.rotateTo(angle)
                    obj.sprite.setScale(options.preScale.x * len, options.preScale.y)
                    console.log("length: " + len)
                },
                doIn(params, successCb, abortCb) {
                    if (this.timedEvent != null) {
                        if (this.timedEvent.onAbort != null)
                            this.timedEvent.onAbort();
                        clearTimeout(this.timedEvent.to);
                        this.timedEvent = null;
                    }

                    // check for callback
                    if (successCb == null) {
                        this.timedEvent = {
                            to: setTimeout(this[params.func], params.time, params.param)
                        }
                    } else {
                        this.timedEvent = {
                            to: setTimeout(this.doWithCB, params.time, this, params.func, params.param, successCb)
                        }
                        if (abortCb != null)
                            this.timedEvent.onAbort = abortCb;
                    }
                },
                doWithCB(self, func, params, cb) {
                    const result = self[func](params);
                    if (cb != null) cb(result);
                },
            }
        },

        createTimeResponse(id, response) {
            return {
                id: id,
                time: Client.phaser.game.getTime(),
                response: response
            }
        },

        createText(params) {
            this.socket.emit('addText', params.name)
            var textPos = util.toScreenSpace(params.pos);
            const created = this.phaser.add.text(textPos.x, textPos.y, params.text, params.textSettings);
            created.setOrigin(0.5);
            return this.registry[params.name] = {
                text: created,
                set: function (text) {
                    this.text.setText(text)
                },
                setVisible: function (boolval) {
                    this.text.setVisible(boolval);
                },
                moveTo(pos) {
                    var npos = util.toScreenSpace(pos);
                    this.text.x = npos.x;
                    this.text.y = npos.y;
                    if (pos.z)
                        this.text.depth = pos.z;
                    return this;
                },
                rotateTo(radians) {
                    this.text.setRotation(radians);
                    return this;
                },
                setScale(scale) {
                    this.text.setScale(scale.scaleX, scale.scaleY);
                    return this;
                }
            }
        },

        get(name) {
            return this.registry[name];
        },

        // used to send the click xy coordinates to the server
        sendClick(x, y, timeStamp, isDown, button) {
            Client.clickTriggers.forEach(trigger => trigger());
            Client.clickTriggers = [];

            var normClick = util.toNormSpace({ x: x, y: y });
            normClick.timeStamp = timeStamp;
            normClick.isDown = isDown;
            normClick.button = button;
            this.socket.emit('click', normClick);
        },

        sendKey(keyCode, timeStamp, isDown) {
            const key = String.fromCharCode(keyCode);
            if (Client.keyTriggers.any)
                Client.keyTriggers.any.forEach(trigger => trigger());
            if (Client.keyTriggers[key])
                Client.keyTriggers[key].forEach(trigger => trigger());
            Client.keyTriggers[key] = [];
            Client.keyTriggers.any = [];
            this.socket.emit('key', { keyCode: keyCode, timeStamp: timeStamp, isDown: isDown });
        },

        setReaction(name, cb) {
            this.socket.on(name, cb);
            return this;
        },

        start(interactableParams) {
            setInitialized(interactableParams.map(param => {
                this.createInteractable(param).setVisible(false)
                return param.name
            }));
        },

        runChain: function (chain, uuidResponse) {
            if (uuidResponse)
                Client.socket.emit('done', Client.createTimeResponse(uuidResponse))
            while (chain && chain.length > 0) {
                const func = chain.shift();
                if (func.func == 'wait') {
                    // timing mode
                    // check for plain wait
                    if (typeof (func.param) == 'number') {
                        Client.timers.push(setTimeout(Client.runChain, func.param, chain, func.questionId))
                    }
                    // wait for click
                    else {
                        const contFunc = () => Client.runChain(chain, func.questionId);
                        if (func.param == 'click') {
                            Client.clickTriggers.push(contFunc);
                        }
                        // wait for keypress
                        else if (func.param.startsWith('key')) {
                            const split = func.param.split('_');
                            // any key
                            if (split.length == 1)
                                Client.keyTriggers.any.push(contFunc);
                            // specific key
                            else if (split[1].length > 0) {
                                const key = split[1];
                                // add or create 
                                if (Client.keyTriggers[key])
                                    Client.keyTriggers[key].push(contFunc)
                                else
                                    Client.keyTriggers[key] = [contFunc];

                            }
                        }
                    }
                    break;
                } else {
                    Client.exec(func);
                }
            }
        },

        endChain: function (param) {
            this.socket.emit('done', Client.createTimeResponse(param));
        },

        exec: function (rpc) {
            var asset = null
            if (rpc.asset != null)
                asset = Client.registry[rpc.asset];
            else
                asset = Client;

            // answering mode
            if (rpc.func == 'doIn' && rpc.questionId != null) {
                asset[rpc.func](
                    rpc.param,
                    function (result) { Client.socket.emit('done', Client.createTimeResponse(rpc.questionId, result)) },
                    function () { Client.socket.emit('aborted', Client.createTimeResponse(rpc.questionId)) }
                );
            }
            // normal mode
            else if (asset && asset[rpc.func]) {
                const result = asset[rpc.func](rpc.param);
                Client.socket.emit('done', Client.createTimeResponse(rpc.questionId, result))
            }
        },

        setCrossBox(params) {
            Client.crossbox = params;
        },

        setBackgroundColor(params) {
            this.phaser.cameras.main.setBackgroundColor(params.color);
            document.body.style.backgroundColor = params.color;
        },

        handleMousePos(xy, isDown) {
            Object.values(Client.cursorTriggers).forEach(trigger => trigger(xy, isDown))

            if (Client.crossbox) {
                if (xy.x > Client.crossbox.x &&
                    xy.x < Client.crossbox.x + Client.crossbox.width &&
                    xy.y > Client.crossbox.y &&
                    xy.y < Client.crossbox.y + Client.crossbox.height) {
                    // inside
                    if (!Client.crossbox.inside) {
                        Client.crossbox.inside = true
                        Client.socket.emit('enterBox', { pos: xy, inside: true });
                    }
                }
                else {
                    // outside
                    if (Client.crossbox.inside) {
                        Client.crossbox.inside = false;
                        Client.socket.emit('enterBox', { pos: xy, inside: false });
                    }
                }
            }
        },

        info(msg) {
            Client.socket.emit('info', msg);
        },

        sendTest() {
            this.socket.emit('test');
        }
    }

    // lookup session id or create and store new one 
    Client.socket.on('connect', async function () {
        // if we already have set a client id, we should reload (because we were disconnected before)
        if (Client.disconnectMessage) {
            const text = Client.disconnectMessage;
            text.set("reconnecting .  ");
            const timeToReconnect = 400;
            window.setTimeout(() => text.set("reconnecting .. "), timeToReconnect);
            window.setTimeout(() => text.set("reconnecting ..."), 2 * timeToReconnect);
            return window.setTimeout(() => window.location.reload(), 3 * timeToReconnect);
        }
        // experimentId is a global variable (which might be null or undefined)
        Client.id = experimentId;
        if (!Client.id || Client.id == null || Client.id.length == 0)
            Client.id = util.getCookie('sessionId');

        // register action to be executed after registering succeded
        Client.socket.on('registerAck', success => {
            if (success) {
                initialized.then(interactables => {
                    // send window information
                    Client.socket.emit('windowInfo', {
                        width: game.scale.width,
                        height: game.scale.height,
                        orientation: game.scale.orientation
                    });
                    interactables.forEach(interactable => Client.socket.emit('addInteractable', interactable));
                    Client.socket.emit('start');
                });
            }
        });
        // register client id
        Client.socket.emit('register', Client.id);
    });

    Client.socket.on('finishExperiment', () => {
        Client.disconnectMessage = "none";
        game.experimentIsFinished = true;
        util.removeCookie('sessionId')
        game.scale.stopFullscreen();
        Client.socket.disconnect();
    });

    Client.socket.on('chain', Client.runChain);

    Client.socket.on('exec', Client.exec);

    Client.socket.on('goto', (url) => {
        Client.disconnectMessage = "none";
        Client.socket.disconnect();
        if (!url)
            window.location.reload();
        else
            window.location.href = url;
    });

    Client.socket.on('info', (msg => {
        console.log(msg);
    }))

    Client.socket.on('interrupt', (data) => {
        if (!data || !data.reason) {
            if (Client.interruptMessage) {
                Client.interruptMessage.setVisible(false);
            }
        }
        else {
            if (!Client.interruptMessage) {
                Client.interruptMessage = Client.createText({
                    textSettings: defaultTextSettings,
                    pos: { x: 0, y: -0.4 },
                    text: data.reason
                });
            }
            Client.interruptMessage.set(data.reason);
            Client.interruptMessage.setVisible(true);
            Client.socket.emit('startWaiting');
        }
    })


    Client.socket.on('disconnect', () => {
        if (!Client.disconnectMessage) {
            setTimeout(() => {
                Client.disconnectMessage = Client.createText({
                    textSettings: defaultTextSettings,
                    pos: { x: 0, y: -0.2 },
                    text: "disconnected"
                })
            }, 500);
        }
    })

    return Client;
}


export default initializeClient;