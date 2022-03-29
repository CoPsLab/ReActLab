const IExperiment = require("./experiment-base");
const ShortUUID = require("short-uuid");

function waitForElements(targetLength, update, statusFn, resolve){
    update().then(elements => {
        elements = elements.filter((x, i) => i === elements.indexOf(x));
        if (statusFn){
            statusFn(targetLength - elements.length);
        }
        if (elements.length == targetLength){
            resolve(elements.length);
        } else {
            setTimeout(() => waitForElements(targetLength, update, statusFn, resolve), 100);
        }
    })
}


class ICooperativeExperiment extends IExperiment {
    participantNumber = undefined;    

    enterCooperativeExperiment(cooperationId, id, sessionId){
        return this.getNumParticipants().then( x => {this.numParticipants = x 
            this.internalData.cooperationId = cooperationId;
        
            return this.db.enterCooperativeExperiment(cooperationId, id, sessionId).then(
                success =>  !success ? success : this.getCooperationIndex().then(idx => {
                    this.participantNumber = idx;
                    return success;
                })
            );
        });
    }

    async waitForClients(statusFn){
        return new Promise(resolve => 
            waitForElements(this.numParticipants, () => this.getConnectedParticipants(), statusFn, resolve)            
        );
    }

    wasMe(msg){
        return msg.participantNumber == undefined || this.participantNumber == msg.participantNumber
    }

    showWaitingForClients(textname){
        let p = Promise.resolve(this.Texts[textname]);
        if (!this.Texts[textname] ){
            p = new Promise(resolve => {
                this.Texts[textname] = this.createText(textname, "", { x: 0.0, y: 0.0 }, {
                    color: 'white',
                    fontSize: '28px',
                    fontFamily: 'Arial',
                    align: 'left',
                    fixedWidth: this.WindowInfo.width,
                    wordWrap: { width: 0.9 * this.WindowInfo.width }
                }).then(() => {
                    resolve(this.Texts[textname]);
                });
            });
        }

        return p.then(text => {
            let prevNumber = 0;
            text.setVisible(true);
            return this.waitForClients(number => {
                if (number != prevNumber){
                    prevNumber = number;
                    if (number > 0){
                        text.set("Waiting for " + number + " participant(s)");                    
                    }
                }
            }).then(number => { 
                return { number: number, text: text };
            });
        })
    }

    getCooperationIndex(){
        return this.db.getCooperationIndex(this.internalData.cooperationId, this.internalData.id);
    }
    
    static createInstance(id, cooperationId) {
        let retVal = this.db.addExperiment(id);
        retVal.cooperationId = cooperationId;
        retVal.save();
        return retVal;
    }

    static generateCooperationId() {
        return ShortUUID.generate();
    }

    static addInvitation() {
        throw "cooperative experiments need to be initialized via email!";
    }

    static createInvitations(receipientList) {
        if (this.numParticipants) {
            return new Promise(async(resolve) => {
                let retVal = [];
                for (let i = 0; i < receipientList.length;) {
                    let remaining = receipientList.length - i;
                    console.log(remaining)
                    if (remaining >= this.numParticipants) {
                        let cooperationId = this.generateCooperationId();
                        for (let j = 0; j < this.numParticipants; ++i, ++j) {
                            let invitation = await this.db.addInvitation(cooperationId);
                            let invite = {
                                email: receipientList[i],
                                invitationId: invitation.invitationId
                            }
                            retVal.push(invite);
                        }
                    } else {
                        throw "not enough participants left to fill the experiment"
                        break;
                    }
                }
                resolve(retVal);
            });
        } else {
            return super.createInvitations(receipientList);
        }
    }
}

module.exports = ICooperativeExperiment;