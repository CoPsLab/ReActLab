const io = require('socket.io-client');

module.exports = class BackChannel {
    socket = undefined;
    config = undefined;
    socketId = undefined;
    parentSocketId = undefined;
    initialized = undefined;
    channelId = undefined;
    eventHandlers = [];

    constructor(port, path, config) {
        if (config.socket) {
            this.parentSocketId = config.socket.id
        }

        if (config) {
            this.channelId = config.channelId;
            this.config = config;
        }

        // start connection
        this.socket = io.connect('http://localhost:' + port, { path: path, reconnect: true })

        // shortcuts for use in listeners
        const self = this;
        const socket = this.socket;

        // Add a connect listener
        this.initialized = new Promise(setInitialized => {
            this.socket.on('connect', function () {
                self.socketId = socket.id;
                setInitialized(true);
                socket.emit('initBackchannel', {
                    parentSocket: self.parentSocketId,
                    room: self.channelId
                });
            });

            this.socket.on('broadcast', function (broadcastEvent) {
                if (!broadcastEvent) {
                    console.error("broadcast data undefined, check this")
                } else if (broadcastEvent.sender != self.parentSocketId) {
                    if (self.eventHandlers[broadcastEvent.event]) {
                        self.eventHandlers[broadcastEvent.event](broadcastEvent.payload);
                    }
                } else {
                    // irgnore data from 'self'                    
                }
            });

            this.socket.on('disconnect', function () {
                console.log('backchannel disconnected');
            });
        });
    }

    on(event, func) {
        this.eventHandlers[event] = func;
    }

    sendBroadcastEvent(sender, event, payload){
        sender.to(this.channelId).emit('broadcast', {
            sender: sender.id,
            payload: payload,
            event: event            
        })
    }

    disconnect() {
        console.log('disconnecting backchannel for socket ' + this.parentSocketId)
        this.socket.disconnect();
    }
}