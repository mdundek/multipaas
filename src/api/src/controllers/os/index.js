const os = require('os');
var ifaces = os.networkInterfaces();
const fs = require('fs');
const shell = require('shelljs');

const node_ssh = require('node-ssh');

class OsController {
	
	/**
	 * readFileToArray
	 * @param {*} path 
	 */
	static readFileToArray(path) {
		return fs.readFileSync(path, 'utf8').split('\n');
	}

	/**
	 * writeArrayToFileToArray
	 * @param {*} path 
	 */
	static writeArrayToFile(path, stringArray) {
		fs.writeFileSync(path, stringArray.join("\n"));
	}

	/**
	 * execSilentCommand
	 * @param {*} command 
	 */
	static async execSilentCommand(command, ignoreErrorCode) {
		return new Promise((resolve, reject) => {
			try {
				shell.exec(command, {silent:true}, function(code, stdout, stderr) {
					if((ignoreErrorCode && stderr.trim().length == 0) || code == 0){
						resolve(stdout.split("\n").filter(o => o.length > 0));
					} else {
						reject(new Error(stderr && stderr.trim().length > 0 ? stderr : "An error occured"));
					}
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * supportsCommand
	 * @param {*} command 
	 */
	static async supportsCommand(command) {
		return new Promise((resolve, reject) => {
			try {
				shell.exec(`command -v ${command}`, {silent:true}, function(code, stdout, stderr) {
					resolve(code == 0);
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
     * hostFeedbackSshExec
     * @param {*} ip 
     * @param {*} command 
     */
    static hostFeedbackSshExec(ip, command, cb) {
        console.log(`SSH Command (${ip}): ", ${command}`);
        return new Promise((resolve, reject) => {
            let ssh = new node_ssh();
        
            ssh.connect({
                host: ip,
                username: 'vagrant',
                password: 'vagrant'
            }).then(function() {
                try {
                    let sploit = command.split(' ');
                    let cmd = sploit.shift();
                    ssh.exec(cmd, sploit, {
                        onStdout(chunk) {
                            cb(chunk.toString('utf8'));
                        },
                        onStderr(chunk) {
                            cb(null, chunk.toString('utf8'));
                            ssh.dispose();
                            reject(new Error(chunk.toString('utf8')));
                        }
                    }).then(function(result) {
                        resolve();
                    });
                } catch (error) {
                    ssh.dispose();
                    reject(error);
                }
            }).catch((error) => {
                reject(error);
            });
        });
    }
}

module.exports = OsController;