const UUID = require('uuid').v4;

// class for additional socket operations
module.exports = class SocketWrapper {
    openQuestions = {};
    chaining = false;
    funcChain = [];
    broadcastChain = [];
    backchannel = undefined;
    eventHandlers = [];
    broadcastInfo = { isBroadcast: true } 
    status = undefined;

    // wrap the socket
    constructor(socket) {
        this.socket = socket;

        this.on('done', (answer) => this.keepPromise(answer.id, answer), false)
        this.on('aborted', (answer) => this.breakPromise(answer.id, answer), false)
    }

    addBroadcastInfo(toAdd){
        if (toAdd && typeof toAdd == 'object'){
            this.broadcastInfo = Object.assign(this.broadcastInfo, toAdd)
        }
    }

    setBackChannel(backchannel) {
        this.backchannel = backchannel;
        for (let event in this.eventHandlers) {
            backchannel.on(event, this.eventHandlers[event]);
        }
    }

    on(event, handler, doBroadcast) {
        if (doBroadcast) {
            // register handler on backchannel
            if (this.backchannel) {
                this.backchannel.on(event, handler)
            } else {
                this.eventHandlers[event] = handler;
            }

            // intercept to broadcast
            this.socket.on(event, (payload) => {
                // insert broadcast info
                this.syncMsg(event, Object.assign({}, payload, this.broadcastInfo));
                // do normal eventHandling
                handler(payload);
            });
        } else {
            // no broadcast, simply install on socket
            this.socket.on(event, handler);
        }

    }

    // proxy function for communicating via proxy
    emit(func, params) {
        // in chaining mode: store the function
        if (this.chaining)
            this.funcChain.push(params);
        // in normal mode: directly forward via the proxy
        else
            this.socket.emit(func, params);
    }

    // same as emit, but sending to other cooperation ids
    broadcast(func, params) {
        if (this.chaining) {
            // this.broadcastChain.push(params);
            console.error('chaining is not possible for broadcasting at the moment, directly sending data');
        }// else 
        if (this.status && this.status.cooperationId) {
            this.socket.to(this.status.cooperationId).emit(func, params);
        } else {
            console.error("cannot broadcast, since no cooperation id was set");
        }
    }

    // direct broadcast to other backchannels ids
    syncMsg(func, params) {
        if (this.backchannel) {
            this.backchannel.sendBroadcastEvent(this.socket, func, params);
        } else {
            console.error("cannot syncMsg, since no cooperation id was set");
        }
    }

    // helper function for adding a new promise and
    // installing success and rejection callbacks
    addPromise(uuid, successCB, failureCB) {
        return new Promise((resolve, reject) => {
            this.openQuestions[uuid] = {
                //resolve part
                resolve(answer) {
                    if (successCB) try {
                        successCB(answer)
                    } catch (error) {
                        console.error(error);
                    }
                    resolve(answer)
                },
                // reject part
                reject(error) {
                    if (failureCB) try {
                        failureCB(error)
                    } catch (error) {
                        console.error(error);
                    }
                    reject(error);
                }
            };
        })
    }

    // helper function to mark a promise as kept and invoking
    // the installed success handler function
    keepPromise(uuid, answer) {
        var promise = this.openQuestions[uuid];
        if (promise) {
            promise.resolve(answer);
            delete this.openQuestions[uuid];
        }
    }

    // helper function to mark a promise as broken and invoking
    // the installed reject handler function
    breakPromise(uuid, error) {
        var promise = this.openQuestions[uuid];
        if (promise) {
            promise.reject(error);
            delete this.openQuestions[uuid];
        }
    }

    // enable chaining mode (use commitChain() to end chaining)
    enableChaining() {
        this.chaining = true;
    }

    // exits chaining mode. If no functions were added via the emit function, 
    // this simply sets the chaining variable to false. Otherwise, it sends
    // the queued functions and parameters via the socket
    // returns a thenable, i.e. you can use .then(handler) to add a handler
    // that is executed after the socket received a success signal
    commitChain() {
        this.chaining = false;
        if (this.funcChain.length > 0) {
            var uuid = UUID();
            this.funcChain.push({ func: 'endChain', param: uuid });
            this.socket.emit('chain', this.funcChain);
            this.funcChain = [];
            return this.addPromise(uuid);
        }
    }

    disconnect() {
        if (this.status && this.status.cooperationId) {
            this.socket.leave(this.status.cooperationId);
        } if (this.backchannel) {
            this.backchannel.disconnect();
        }
    }
}