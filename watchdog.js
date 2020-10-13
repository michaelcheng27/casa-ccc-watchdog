const fetch = require('node-fetch');
const RingApi = require('ring-client-api');
const util = require('util');
const fs = require('fs');
const path = require('path');

const UsersDao = require('./user_dao');

class Watchdog {
    constructor(user) {
        //  put user in DDB manually for the first time.
        //  $ node node_modules/ring-client-api/ring-auth-cli.js to get ring token
        //  follow dropbox api to get api token.
        if (user) {
            console.log(`user_token = ${user.token}`);
            this._user = user;
        } else {
            console.error('user is empty');
        }
        this._ringApi = new RingApi.RingApi({
            // Replace with your refresh token
            // refreshToken: "eyJhbGciOiJIUzUxMiIsImprdSI6Ii9vYXV0aC9pbnRlcm5hbC9qd2tzIiwia2lkIjoiZGVmYXVsdCIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE1OTgxMzM2MjMsInJlZnJlc2hfY2lkIjoicmluZ19vZmZpY2lhbF9hbmRyb2lkIiwicmVmcmVzaF9zY29wZXMiOlsiY2xpZW50Il0sInJlZnJlc2hfdXNlcl9pZCI6Mzk5NTI2OCwicm5kIjoiU05zMGRjcW1KbHRIaHciLCJzZXNzaW9uX2lkIjoiMmZjOTM2YjctM2M2Yi00YjZmLTljOTEtYjQ5Y2VkYTQ1ZjUyIiwidHlwZSI6InJlZnJlc2gtdG9rZW4ifQ.pj1ialEC_zFM1AtENvmdvaZtEBV-KoaAlIyg2ri1wToHWXuHsfXdyti43VUib-a1ED6_f8MrlMve-h-7kCLmtg",
            // debug: true,
            refreshToken: user.token,
            cameraDingsPollingSeconds: 2,
        });
        this._recordedDings = new Set();
        this._runningPromises = new Map();
        this._userDao = new UsersDao();
    }

    async asyncOnTokenUpdate({ newRefreshToken, oldRefreshToken }) {
        console.log('Refresh Token Updated: ', newRefreshToken);
        if (!this._user) {
            console.error(`user not exsit, skip update`);
            return;
        }
        this._user.token = newRefreshToken;
        const result = await this._userDao.putUser(
            this._user
        );
        console.log(`update user complete, res = ${util.inspect(result)}`);
    }

    async asyncWatch() {
        this._ringApi.onRefreshTokenUpdated.subscribe(this.asyncOnTokenUpdate);
        const allCameras = await this._ringApi.getCameras();
        console.log(`camera = ${util.inspect(allCameras)}`);


        if (!allCameras) {
            console.log('No cameras found');
            return;
        }

        // clean/create the output directory
        allCameras.forEach((camera) => {
            console.log(`subscribing camera: ${camera.name}`);
            camera.onNewDing.subscribe((ding) => {
                if (camera.id != ding.doorbot_id) {
                    console.log(`camera not matching early return`);
                    return;
                }
                console.log(`recordDings = ${util.inspect(this._recordedDings)}`);
                if (this._recordedDings.has(ding.id_str)) {
                    console.log(`ding ${ding.id_str} is being recorded, early return`);
                    return;
                }
                this._recordedDings.add(ding.id_str);
                this._startRecording(ding, camera);
            });
        });

        console.log(`complete subscribing`);
        console.log(`sleep for 60 s`);
        await this._sleep(60 * 1000);
        while (this._runningPromises.size > 0) {
            await this._sleep(50 * 1);
        }
        console.log(`complete all`);
    }

    _startRecording(ding, camera) {
        if (this._runningPromises.has(camera.id)) {
            console.log(`camera ${camera.id} is recording, skip this ding ${ding.id_str}`);
            return;
        }
        this._runningPromises.set(camera.id, this._asyncRecord(ding, camera));
    }

    async _asyncRecord(ding, camera) {
        const fileName = this._getFileName(camera.name);
        console.log(`start recording, ding = ${util.inspect(ding)}, file = ${fileName}, recordedDings = ${util.inspect(this._recordedDings)}`);
        await camera.recordToFile(path.join('/tmp', fileName), 10);
        await this._uploadToDropbox(fileName);
        this._runningPromises.delete(camera.id);
        console.log(`complete recording ding ${ding.id_str}`);
    }


    async _uploadToDropbox(fileName) {
        const f = fs.readFile(`/tmp/${fileName}`, {}, async (err, data) => {
            try {
                const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
                    "headers": {
                        "Authorization": this._user.dropboxToken,
                        "Content-Type": "application/octet-stream",
                        "Dropbox-API-Arg": `{"path": "/${fileName}","mode": "add","autorename": true,"mute": false,"strict_conflict": false}`
                    },
                    "body": data,
                    "method": "POST",
                    "mode": "cors"
                });
                console.log(`res = ${util.inspect(await res.json())}`);
            }
            catch (e) {
                console.log(`errr = ${e}`);
            }
        });
    }


    async _sleep(ms) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, ms);
        });
    }

    _getFileName(prefix) {
        const now = new Date();
        const nowDate = now.toLocaleDateString([], { timeZone: 'America/Los_Angeles' }).slice(0, -5).replace('/', '');
        const nowTime = now.toLocaleTimeString([], { timeZone: 'America/Los_Angeles' });
        let nowHour = parseInt(nowTime.split(':')[0]);
        if (nowHour == 12 && nowTime.search("AM") != -1) {
            nowHour = 0;
        }
        const nowMinute = now.getMinutes();
        return `${prefix}_${nowDate}d${nowHour}h${nowMinute}m.mp4`;
    }

}

module.exports = Watchdog;
