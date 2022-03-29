const UUID = require('uuid').v4;

class RPCBase {
    constructor(socket) {
        this.socket = socket;
    }

    invoke(func, param, successCb, rejectCb) {
        const uuid = UUID();
        this.socket.emit('exec', {
            func: func,
            asset: this.name,
            param: param,
            questionId: uuid
        });

        return this.socket.addPromise(uuid, successCb, rejectCb);
    }
}

class RemoteClient extends RPCBase {
    constructor(socket) {
        super(socket, null);
    }

    wait(timeInMs) {
        return this.invoke('wait', timeInMs);
    }

    setCrossBox(params) {
        return this.invoke('setCrossBox', params);
    }

    setBackgroundColor(params) {
        return this.invoke('setBackgroundColor', params);
    }
}

class RemoteVisible extends RPCBase {
    constructor(socket, name) {
        super(socket);
        this.name = name;
    }

    setVisible(boolval) {
        return this.invoke('setVisible', boolval);
    }

    setRotation(degrees) {
        return this.invoke('rotateTo', degrees / 180.0 * Math.PI);
    }

    setScale(scaleX, scaleY) {
        return this.invoke('setScale', { scaleX: scaleX, scaleY: scaleY });
    }
}


class RemoteAsset extends RemoteVisible {
    constructor(socket, name) {
        super(socket, name);
    }

    moveTo(pos) {
        return this.invoke('moveTo', pos);
    }

    getPos() {
        return new Promise((resolve, reject) =>
            this.invoke('getPos', undefined, x => resolve(x.response), reject)
        );
    }

    stopSliding() {
        return this.invoke('stopSliding');
    }

    attachToCursor(options) {
        return this.invoke('attachToCursor', options)
    }

    startSliding(options) {
        return this.invoke('startSliding', options)
    }

    detachFromCursor() {
        return this.invoke('detachFromCursor')
    }

    doIn(time, func, param) {
        const retVal = this.invoke('doIn', { time: time, func: func, param: param });
        return retVal.then(passThrough => passThrough, (error) => { /*console.log("do in was aborted") */ });
    }

    lockBetween(leftAsset, rightAsset, doScale, preScale) {
        return this.invoke('lockBetween', {
            left: leftAsset.name,
            right: rightAsset.name,
            doScale: doScale,
            preScale: preScale
        })
    }
    lockTrail(startPoint, endPoint, preScale, transparency) {
        return this.invoke('lockTrail', {
            startPoint: startPoint,
            endPoint: endPoint,
            preScale: preScale,
            alpha: transparency
        })
    }
}



class RemoteText extends RemoteVisible {
    constructor(socket, name) {
        super(socket, name);
    }

    set(text) {
        return this.invoke('set', text)
    }

    clear() {
        return this.invoke('set', '');
    }
}

module.exports = {
    RemoteClient,
    RemoteAsset,
    RemoteText,
}