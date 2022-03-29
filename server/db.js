const exitHandling = require('./exitHandling');
const ShortUUID = require('short-uuid')
const Sequelize = require('sequelize');
const { where } = require('sequelize');

// Creates an array that contains key value objects. 
// If there are futher objects contained in the given one, each level is separated by the objectSeparator value
function objectToKeyValueArray(object, preKey = undefined, objectSeparator = '.') {
    const retVal = []
    const remaining = [{ key: preKey ? preKey + objectSeparator : "", value: object }];
    while (remaining.length > 0) {
        const toHandle = remaining.pop();
        Object.entries(toHandle.value).forEach(([key, value]) => {
            switch (typeof (value)) {
                case 'object':
                    remaining.push({ key: toHandle.key + key + objectSeparator, value: value });
                    break;
                default:
                    retVal.push({ key: toHandle.key + key, value: JSON.stringify(value) });
                    break;
            }
        });
    }

    return retVal;
}


module.exports = {
    connect: async function (experimentId, dataDir) {
        var sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: dataDir + '/db/' + experimentId + '.sqlite',
            logging: false,
        });

        var db = {
            connection: sequelize,
            experiments: [],
            invitation: sequelize.define('invitation', {
                // attributes
                invitationId: {
                    type: Sequelize.STRING,
                    primaryKey: true,
                    allowNull: false,
                    unique: true
                },
                accepted: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                creationTime: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.NOW
                },
                consentFormFilled: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                }, 
                cooperationId : {
                    type: Sequelize.STRING,
                    allowNull: true,
                    defaultValue: null
                }
            }, { /* options*/ }),
            personalizedData: sequelize.define('personalizedData', {
                invitationId: {
                    type: Sequelize.STRING,
                    allowNull: false,
                    primaryKey: true,
                },
                key: {
                    type: Sequelize.STRING,
                    allowNull: false,
                    primaryKey: true,
                },
                value: {
                    type: Sequelize.STRING,
                    allowNull: false,
                }
            }, { /* options*/ }),
            // define experiment table
            experiment: sequelize.define('experiment', {
                // attributes
                experimentId: {
                    type: Sequelize.STRING,
                    allowNull: false,
                    primaryKey: true,
                    unique: true,
                },
                isFinished: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                remainingTrials: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: -1
                },
                creationTime: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.NOW
                }, 
                cooperationId: {
                    type: Sequelize.STRING,
                    allowNull: true,
                    defaultValue: null
                }
            }, { /* options*/ }),
            experimentData: sequelize.define('experimentData', {
                experimentId: {
                    type: Sequelize.STRING,
                    allowNull: false,
                    primaryKey: true,
                },
                key: {
                    type: Sequelize.STRING,
                    allowNull: false,
                    primaryKey: true,
                },
                value: {
                    type: Sequelize.STRING,
                    allowNull: false,
                }
            }, { /* options*/ }),
            cooperativeSockets: sequelize.define('cooperativeSockets', {
                cooperationId: {
                    type: Sequelize.STRING,
                    allowNull: false,                    
                },
                socketId: {
                    type: Sequelize.STRING,                    
                    primaryKey: true,
                    allowNull: false,
                    unique: true
                },
                sessionId: {
                    type: Sequelize.STRING,
                    allowNull: false,
                    unique: true
                }
            }, { /* options */ }),
            // end experiment table
            open: () => {
                return db.connection.authenticate().then(() => console.log('connected'))
            },
            close: () => {
                if (db.connection != null) {
                    return db.connection.connectionManager.close().then(() => {
                        // console.log('closed db connection ' + experimentId);
                        db.connection = null;
                    });
                };
            },
            addInvitation: (cooperationId) => {
                if (cooperationId){
                    return db.invitation.create({ 
                        invitationId: ShortUUID.generate().toString(), 
                        cooperationId: cooperationId
                    });
                } else {
                    return db.invitation.create({ 
                        invitationId: ShortUUID.generate().toString() 
                    });
                }
            },
            getInvitation: id => {
                return db.invitation.findAll({ where: { invitationId: id } }).then(result => result[0]);
            },
            getInvitations: () => {
                return db.invitation.findAll();
            },
            setInvitationData: async (invitationId, key, value) => {
                return db.personalizedData
                    .findAll({ where: { invitationId: invitationId, key: key } })
                    .then(retVal => {
                        switch (retVal.length) {
                            case 0:
                                retVal = db.personalizedData.build({ invitationId: invitationId, key: key, value: value });
                                retVal.save();
                                break;
                            default:
                                retVal = retVal[0];
                                if (value != retVal.value) {
                                    retVal.value = value;
                                    retVal.save();
                                }
                                break;
                            // default:
                            // console.error('there is more than one result for ' + key + ', this must not happen');
                        }
                    });
            },
            getInvitationData: async (invitationId, key) => {
                const retVal = {};
                const whereClause = { where: { invitationId: invitationId } };
                if (key)
                    whereClause.where.key = key;

                const tmp = await db.personalizedData.findAll(whereClause);
                tmp.forEach(entry => { retVal[entry.key] = entry.value; });
                return retVal;
            },
            addExperiment: id => {
                var retVal = db.experiment.build({ experimentId: id });
                db.experiments.push(retVal);
                retVal.save();
                return retVal;
            },
            updateExperimentList: async function () {
                return db.experiment.findAll().then(exps => db.experiments = exps);
            },
            getExperiment: async id => {
                return db.experiment.findAll({ where: { experimentId: id } }).then(result => result[0]);
            },
            getExperimentIds: () => {
                return db.experiment.findAll({ attributes: ['experimentId'] }).map(x => x.experimentId);
            },
            setExperimentData: async (experimentId, key, value) => {
                const retVal = await db.experimentData.findAll({
                    where: { experimentId: experimentId, key: key }
                });
                value = JSON.stringify(value);

                switch (retVal.length) {
                    case 0:
                        return db.experimentData.create({ experimentId: experimentId, key: key, value: value });
                    default:
                        if (retVal.length > 1)
                            console.error('there is more than one result for ' + key + ', this must not happen');

                        const toModify = retVal[0];

                        if (value != toModify.value) {
                            toModify.value = value;
                            return toModify.save();
                        }
                }

                // otherwise return a fulfilled promise containing the return value
                return Promise.resolve(retVal);
            },
            bulkSetExperimentData: (experimentId, object, preKey) => {
                if (typeof (object) != 'object') {
                    return db.setExperimentData(experimentId, preKey, object);
                } else {
                    const mapped = objectToKeyValueArray(object, preKey).map(obj => Object.assign({ experimentId: experimentId }, obj));
                    return db.experimentData.bulkCreate(mapped, { updateOnDuplicate: ['value'] });
                }
            },
            getExperimentData: async (experimentId, key) => {
                const whereClause = { where: { experimentId: experimentId } };
                if (key) {
                    whereClause.where.key = key;
                }
                let retVal = {};
                const tmp = await db.experimentData.findAll(whereClause);
                await tmp.forEach(entry => {
                    retVal[entry.key] = JSON.parse(entry.value);
                })
                return retVal;
            }, 
            getCooperationPartnerCount: async(cooperationId) => {
                const whereClause = { where: { cooperationId: cooperationId } };
                return db.invitation.findAndCountAll(whereClause).then( result => result.count );
            }, 
            getCooperationIndex: async(cooperationId, experimentId) => {
                const whereClause = { where: { cooperationId: cooperationId }, order: [ ['cooperationId', 'ASC'] ] };
                const experiments = await db.experiment.findAll(whereClause);         
                return experiments.findIndex( exp =>  exp.experimentId == experimentId);
            }, 
            enterCooperativeExperiment: async(cooperationId, socketId, sessionId) => {
                return db.cooperativeSockets.create({
                    cooperationId: cooperationId,
                    socketId: socketId,
                    sessionId: sessionId
                }).then(() => {
                    return true;
                }).catch(function(err) {
                    // console.log(err);
                    // return undefined if not connected
                    return false;
                });
            }, 
            leaveCooperativeExperiment: async(socketId) =>{
                return db.cooperativeSockets.findByPk(socketId).then( toDelete => {
                    if (toDelete){
                        return new Promise(resolve => toDelete.destroy().then(() => resolve(toDelete.sessionId)))
                    } else {
                        console.error("could not leave: socket " + socketId + " not found");                        
                    }
                });
            }, 
            getConnectedCooperationPartners: async(cooperationId) => {
                const whereClause = { where: {cooperationId: cooperationId }};
                return db.cooperativeSockets.findAll(whereClause)
                    .then( partners => partners.map(p => p.sessionId) )
            }
        };



        await db.connection.sync();
        // clear connected sockets from before
        db.cooperativeSockets.destroy({where: {}});
        // setup foreign keys
        await db.experiment.belongsTo(db.cooperativeSockets, { foreignKey: 'cooperationId', targetKey: 'cooperationId' });
        await db.experimentData.belongsTo(db.experiment, { foreignKey: 'experimentId', targetKey: 'experimentId' });
        await db.personalizedData.belongsTo(db.invitation, { foreignKey: 'invitationId', targetKey: 'invitationId' });
        await db.experiment.belongsTo(db.invitation, { foreignKey: 'cooperationId', targetKey: 'cooperationId' });
        // initialize experiments list
        await db.updateExperimentList();

        exitHandling.addHandler(db.close);
        return db;
    }
}