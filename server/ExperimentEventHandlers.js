const ICooperativeExperiment = require('./experiment/cooperativeExperiment-base');
const { RemoteClient, RemoteAsset, RemoteText } = require('./net/RPC');

function createText(socket, name, text, pos, settings) {
    const func = (f, p) => socket instanceof RemoteClient ? socket.invoke(f, p) : socket.emit(f, p);
    // const func = 
    return func('exec', {
        func: 'createText',
        param: {
            name: name,
            text: text,
            textSettings: settings,
            pos: pos
        }
    });
}

function finishExperiment(socket) {
    return socket.emit('finishExperiment');
}

function displayWarning(socket, text, windowWidth) {
    return createText(socket, 'centerText', text, { x: 0, y: -0.25 }, {
        color: '#00AFFF',
        fontSize: '100px',
        align: 'center',
        fontStyle: 'bold',
        fixedWidth: windowWidth,
        wordWrap: { width: 0.9 * windowWidth }
    });
}

class ExperimentEventHandlers {
    initialized = undefined
    experiment = undefined;
    wrapper = undefined;
    socket = undefined;

    constructor(experiment, wrapper, initialized) {
        this.initialized = initialized;
        this.experiment = experiment;
        this.socket = wrapper.socket;
        this.wrapper = wrapper;
    }

    static initBasic(experiment, socket) {
        experiment.finishExperiment = () => {
            finishExperiment(socket);
        }

        experiment.displayWarning = (warning) => {
            displayWarning(socket, warning, experiment.WindowInfo.width);
        }
    }

    static initExperiment(wrapper, experiment, initialized) {
        const eventHandlers = new ExperimentEventHandlers(experiment, wrapper, initialized);
        const client = new RemoteClient(wrapper);

        // client private functions
        wrapper.on('startWaiting', eventHandlers.onStartWaiting);
        wrapper.on('orientationchange', eventHandlers.onOrientationchange);
        wrapper.on('addInteractable', eventHandlers.onAddInteractable);
        wrapper.on('addText', eventHandlers.onAddText);
        wrapper.on('windowInfo', eventHandlers.onWindowInfo);

        // used to identify broadcasting capabilities
        const mayBroadcast = experiment instanceof ICooperativeExperiment

        // client response functions
        wrapper.on('enterBox', eventHandlers.onEnterBox, mayBroadcast);
        wrapper.on('sliding', eventHandlers.onSliding);
        wrapper.on('click', eventHandlers.onClick, mayBroadcast);
        wrapper.on('key', eventHandlers.onKey, mayBroadcast);

        // simple test output - can't hurt to have this for debugging
        wrapper.on('info', eventHandlers.onInfo, mayBroadcast);
        wrapper.on('test', eventHandlers.onTest, mayBroadcast);

        // install a finish experiment function
        experiment.finishExperiment = function (redirect) {
            wrapper.status.isFinished = true;
            wrapper.status.save();
            if (redirect) {
                experiment.goto()
            }
            finishExperiment(wrapper);
        }

        experiment.notifyNextTrial = function () {
            wrapper.status.remainingTrials--;
            wrapper.status.save();
        }

        experiment.goto = function (url) {
            wrapper.emit('goto', url)
        }

        experiment.createText = async (name, text, pos, settings) =>
            createText(client, name, text, pos, settings);

        experiment.runOnClient = function (callback) {
            wrapper.enableChaining();
            callback(client);
            return wrapper.commitChain();
        }

        experiment.setQuestionnaireValue = (name, value) => {
            experiment.getExperimentData('questionnaireValues').then(data =>
                experiment.setExperimentData('questionnaireValues', Object.assign(
                    data.questionnaireValues ? data.questionnaireValues : {}, {
                    [name]: value
                }))
            );
        }

        // load data 
        return Promise.all([experiment.loadExperimentData(), experiment.loadQuestionnaireData()]).then(() => {
            try {
                experiment.initialize(experiment.internalData.id);
                return true;
            } catch (error) {
                console.error(error);
                return false
            }
        });
    }

    // event handlers below

    onOrientationchange = (orientation) => {
        this.experiment.WindowInfo.orientation = orientation.includes('portrait') ? 'portrait' : 'landscape';
        this.experiment.orientationChange(this.experiment.WindowInfo.orientation);
    }

    onAddInteractable = (info) => {
        if (this.experiment)
            this.experiment.Assets[info] = new RemoteAsset(this.wrapper, info);
    }

    onAddText = (info) => {
        if (this.experiment) {
            this.experiment.Texts[info] = new RemoteText(this.wrapper, info)
        }
    }

    onClick = (click) => {
        try {
            return this.experiment.onClick(click);
        } catch (error) {
            console.error(error);
        }
    }

    onKey = (keyInfo) => {
        try {
            return this.experiment.onKey(keyInfo);
        } catch (error) {
            console.error(error);
        }
    }

    onSliding = (data) => {
        try {
            return this.experiment.onSliding(data)
        } catch (error) {
            console.error(error);
        }
    }

    onEnterBox = (enterInfo) => {
        if (this.experiment && this.experiment.handleCrossBox) {
            this.experiment.handleCrossBox(enterInfo);
        }
    }

    onWindowInfo = async (winfo) => {
        await this.initialized;
        this.experiment.WindowInfo = winfo;
        this.experiment.WindowInfo.orientation = winfo.orientation.includes('portrait') ? 'portrait' : 'landscape';
        this.experiment.orientationChange(this.experiment.WindowInfo.orientation);
    }

    onStartWaiting = () => {
        if (this.experiment instanceof ICooperativeExperiment) {
            this.experiment.showWaitingForClients("centerText").then(data => {
                data.text.set("Continuing");
                data.text.setVisible(true);
                setTimeout(() => {
                    data.text.setVisible(false);
                    this.socket.emit('interrupt', null)
                }, 1000);
            });
        }
    }

    onInfo = (msg) => {
        console.info(msg)
    }

    onTest = (data) => {
        console.log('test received on socket ' + this.socket.id + " with data " + data)
    }
}

module.exports = ExperimentEventHandlers