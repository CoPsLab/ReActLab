const IO = require('socket.io');

const BackChannel = require('./backchannel');
const SocketWrapper = require('./net/SocketWrapper')
const ExperimentEventHandlers = require('./ExperimentEventHandlers');
const ICooperativeExperiment = require('./experiment/cooperativeExperiment-base');

class LateFullfillable {
    setTo = undefined;

    constructor() {
        this.promise = new Promise(done => this.setTo = done);
    }

    then(resultHanlder) {
        return this.promise.then(resultHanlder);
    }
}

module.exports = function (server, baseURL, ExperimentClass) {
    // Connections between server and client, i.e. socket io stuff, below
    const socketIOPath = baseURL + '/socket.io';
    const io = IO.listen(server, { path: socketIOPath, cookie: false });
    const createBackchannel = (config) => new BackChannel(server.address().port, socketIOPath, config);
    io.on('connection', socket => {
        // console.log("got connection from " + socket.id) 

        // handling backChannel connection
        socket.on('initBackchannel', (config) => {
            // console.log("initializing backchannel " + socket.id + " for parent "+ JSON.stringify(config))
            socket.isBackchannel = true;
            if (config.room) {
                socket.join(config.room)
            }
        })

        // normal handling of connection
        socket.on('register', async (sessionId) => {
            // console.log("registering " + socket.id)
            const wrapper = new SocketWrapper(socket);
            const initialized = new LateFullfillable();
            const experimentStatus = await ExperimentClass.getExperiment(sessionId)
            const experiment = experimentStatus ?
                new ExperimentClass(sessionId, ExperimentClass.db, ExperimentClass.dataFolder, ExperimentClass.numTrials) :
                {
                    WindowInfo: {},
                    onDisconnect: () => { }
                };

            ExperimentEventHandlers.initBasic(experiment, socket)

            if (experimentStatus) {
                wrapper.status = experimentStatus;
                if (experimentStatus.cooperationId) {
                    const cooperationId = experimentStatus.cooperationId;
                    if (await experiment.enterCooperativeExperiment(cooperationId, socket.id, sessionId)) {
                        socket.join(cooperationId);
                        wrapper.addBroadcastInfo({ participantNumber: experiment.participantNumber });
                        wrapper.setBackChannel(createBackchannel({
                            channelId: cooperationId + '_backchannel',
                            socket: socket
                        }));
                    } else {
                        wrapper.status.sessionInUse = true;
                        initialized.setTo(false);
                        return;
                    }
                }

                // possibly set number of trials here
                if (experimentStatus.remainingTrials < 0 && !experimentStatus.isFinished) {
                    experimentStatus.remainingTrials = ExperimentClass.numTrials;
                    experimentStatus.save();
                }

                // do full initialization here
                initialized.setTo(ExperimentEventHandlers.initExperiment(wrapper, experiment, initialized.promise))
                initialized.then(success => {
                    if (success) socket.emit('registerAck', sessionId)
                })
            } else {
                initialized.setTo(false);
                console.error('no experiment found for ' + sessionId);
            }


            // start the experiment (if everything is ok)
            socket.on('start', async () => {
                const success = await initialized.promise;
                if (!success) {
                    if (wrapper.status && wrapper.status.sessionInUse) {
                        experiment.displayWarning(['Error:', 'Already joined experiment']);
                    } else {
                        experiment.displayWarning(['Error:', 'Unknown Experiment ID']);
                    }
                    experiment.finishExperiment();
                } else if (wrapper.status.isFinished) {
                    experiment.displayWarning('Experiment Finished!');
                    experiment.finishExperiment();
                    // close the socket, to avoid any further communication (better safe than sorry)
                    socket.disconnect();
                } else {
                    try {
                        return experiment.start(experiment.numTrials - wrapper.status.remainingTrials + 1);
                    } catch (error) {
                        console.error(error);
                    }
                }
            })

            // handle disconnects
            socket.on('disconnect', async () => {
                try {
                    initialized.then((wasInitialized) => {
                        if (wasInitialized) {
                            const cooperationId = wrapper.status.cooperationId;
                            if (cooperationId) {
                                socket.to(cooperationId).emit('interrupt', {
                                    reason: "cooperation partner disconnected"
                                });
                            }
                            if (experiment instanceof ICooperativeExperiment)
                                ExperimentClass.db.leaveCooperativeExperiment(socket.id)
                        }
                    });

                    if (wrapper) {
                        wrapper.disconnect();
                    }

                    if (experiment) {
                        return experiment.onDisconnect();
                    }
                } catch (error) {
                    console.log(error);
                }
            });
        });
    });
}