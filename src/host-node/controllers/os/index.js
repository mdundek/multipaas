const si = require('systeminformation');
const os = require('os');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const ncp = require('ncp').ncp;
const chmodr = require('chmodr');
const shell = require('shelljs');
const mkdirp = require('mkdirp');
const node_ssh = require('node-ssh');

// Sleep promise for async
let _sleep = (duration) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

class OsController {

	/**
	 * getIp
	 */
    static async getIp() {
		if(this.ip){
			return this.ip;
		}
		// let result = await this.execSilentCommand(`ifconfig ${process.env.DEFAULT_INET_INTERFACE_SHORT} | grep "inet " | awk '{print $2}'`);
		// this.ip = result[0];
		// return this.ip;

		let ifaces = os.networkInterfaces();
        // Iterate over interfaces ...
        for (var dev in ifaces) {
			if(process.env.DEFAULT_INET_INTERFACE_SHORT == dev) {
				for (var i = 0, len = ifaces[dev].length; i < len; i++) {
					var details = ifaces[dev][i];
					if (details.family === 'IPv4') {
						this.ip = details.address;
					}
				}
			}
		}
		return this.ip;
	}
	
	/**
	 * getHostname
	 */
	static getHostname() {
		return os.hostname();
    }

    /**
     * getFreeMemory
     */
    static async getFreeMemory() {
      	let memData = await si.mem();
      	return Math.round(memData.available / 1024 / 1024);
	}

	/**
	 * getVolumeStorageTotalSpace
	 */
	static async getVolumeStorageTotalSpace() {
		let result = await this.execSilentCommand(`df ${process.env.GLUSTER_VOLUME} -h | grep "${process.env.GLUSTER_VOLUME}" | sed -e's/  */ /g' | cut -d' ' -f2`);
		// 916G
		let scale = result[0].substring(result[0].length-1);
		let val = parseFloat(result[0].substring(0, result[0].length-1));
		switch(scale){
			case 'G':
				return val * 1024.0;
			case 'M':
				return val;
			case 'T':
				return val * 1024.0 * 1024.0;
			default:
				throw new Error("Invalide scale " + scale);
		}
	}
	  
	/**
	 * getGlusterVolumeCount
	 */
	static async getGlusterVolumeCount() {
		let result = await this.execSilentCommand(`docker exec gluster-ctl gluster volume list`);
		result = result.filter(o => o != "No volumes present in cluster");
		return result.length;
  	}

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
	 * writeBinaryToFile
	 * @param {*} filePath 
	 * @param {*} binary 
	 */
	static async writeBinaryToFile(filePath, binary) {
		await mkdirp(path.dirname(filePath));
		fs.writeFileSync(filePath, binary, 'base64');
	}

	/**
	 * rmrf
	 * @param {*} dirPath 
	 */
	static rmrf(dirPath) {
		rimraf.sync(dirPath);
	}

	/**
	 * untar
	 * @param {*} tarPath 
	 * @param {*} cleanup 
	 */
	static async untar(tarPath, cleanup) {
		await this.execSilentCommand(`tar -xzvf ${tarPath} -C ${path.dirname(tarPath)}`);
		if(cleanup){
			await this.execSilentCommand(`rm -rf ${tarPath}`);
		}		
	}

	/**
	 * tar
	 * @param {*} dirPath 
	 * @param {*} targetFile 
	 */
	static async tar(dirPath, targetFile) {
		await this.execSilentCommand(`touch ${targetFile}`);
		await this.execSilentCommand(`tar -C ${dirPath} --exclude=${targetFile} -czvf ${targetFile} .`);
	}

	/**
	 * copyDir
	 * @param {*} source 
	 * @param {*} target 
	 */
	static async copyDir(source, destination) {
		return new Promise((resolve, reject) => {
			ncp.limit = 16;
			ncp(source, destination, function (err) {
				if (err) {
					return reject(err);
				}
				resolve();
			});
		});
	}

	/**
	 * copyFile
	 * @param {*} source 
	 * @param {*} target 
	 */
	static copyFile(source, destinationDir) {
		shell.cp(source, destinationDir);
	}

	/**
	 * chmodr
	 * @param {*} dirPath 
	 * @param {*} mode 
	 */
	static async chmodr(dirPath, mode) {
		return new Promise((resolve, reject) => {
			chmodr(dirPath, mode, (err) => {
				if (err) {
				  reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	/**
     * execMultiPaaSScript
     * @param {*} path 
     * @param {*} logCb 
     */
	static async execMultiPaaSScript(path, logCb) {
		return new Promise((resolve, reject) => {
			try {
				const OUTPUT_TASK_REGEX = /\[TASK [a-zA-Z0-9_\.-]+\]/g;
				const OUTPUT_ERROR_REGEX = /\[ERROR\]/g;
				const OUTPUT_DONE_REGEX = /\[DONE\]/g;

				var child = shell.exec(path, {async:true, silent:true});
				let errors = [];
				child.stdout.on('data', (output) => {
					console.log(output);
					output.split("\n").map(l => l.trim()).forEach(l => {
						if(l.match(OUTPUT_ERROR_REGEX)){
							errors.push(l);
						}
						else if(l.match(OUTPUT_DONE_REGEX)){
							if(errors.length > 0){
								console.log("ERROR LINES => ", errors);
								reject(errors.map(s => new Error(s)));
							} else {
								resolve();
							}
						} 
						else if(l.match(OUTPUT_TASK_REGEX)){
                            if(logCb) {
                                let taskStepLog = l.substring(l.indexOf("]")+1).trim();
                                logCb(taskStepLog);
                            }
						}
					});
				});
			} catch (error) {
				reject([error]);
			}
		});
	}

	/**
	 * execSilentCommand
	 * @param {*} command 
	 */
	static async execSilentCommand(command, ignoreErrorCode) {
		console.log(command);
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
     * pushFileSsh
     * @param {*} ip 
     * @param {*} localPath 
     * @param {*} targetPath 
     */
    static pushFileSsh(ip, localPath, targetPath) {
        return new Promise((resolve, reject) => {
            let ssh = new node_ssh();
        
            ssh.connect({
                host: ip,
                username: 'root',
                password: 'vagrant'
            }).then(function() {
                ssh.putFile(localPath, targetPath).then(function() {
                    ssh.dispose();
                    resolve();
                }, function(error) {
                    console.log("err", error);
                    ssh.dispose();
                    reject(error);
                })
            });
        });
    }

    /**
     * fetchFileSsh
     * @param {*} ip 
     * @param {*} localPath 
     * @param {*} targetPath 
     */
    static fetchFileSsh(ip, localPath, targetPath) {
        return new Promise((resolve, reject) => {
            let ssh = new node_ssh();
        
            ssh.connect({
                host: ip,
                username: 'root',
                password: 'vagrant'
            }).then(function() {
                ssh.getFile(localPath, targetPath).then(function() {
                    ssh.dispose();
                    resolve();
                }, function(error) {
                    console.log("err", error);
                    ssh.dispose();
                    reject(error);
                })
            });
        });
    }

    /**
     * feedbackSshExec
     * @param {*} ip 
     * @param {*} command 
     */
    static feedbackSshExec(ip, command, cb) {
        console.log(`SSH Command (${ip}): ", ${command}`);
        return new Promise((resolve, reject) => {
            let ssh = new node_ssh();
        
            ssh.connect({
                host: ip,
                username: 'root',
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
                username: 'mdk',
                password: 'li14ebe14'
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

    /**
     * sshExec
     * @param {*} ip 
     * @param {*} command 
     */
    static sshExec(ip, command, inline, ignoreStderr) {
        console.log(`SSH Command (${ip}): ", ${command}`);
        return new Promise((resolve, reject) => {
            let ssh = new node_ssh();
        
            ssh.connect({
                host: ip,
                username: 'root',
                password: 'vagrant'
            }).then(function() {
                try {
                    if(Array.isArray(command)){
                        let _cmdAsync = (_cmd) => {
                            return new Promise((_resolve, _reject) => {
                                ssh.execCommand(_cmd, {}).then(function(result) {
                                    _resolve(result);
                                })
                            });
                        }
                        (async() => {
                            let result = [];
                            for(let i=0; i<command.length; i++){
                                let _r = await _cmdAsync(command[i]);
                                result.push(_r);
                                if(!ignoreStderr && _r.stderr && _r.stderr.length > 0){
                                    i = command.length; // Jump out
                                }
                            }
                            ssh.dispose();
                            resolve(result);
                        })();
                    } else {
                        if(!inline){
                            let sploit = command.split(' ');
                            let cmd = sploit.shift();
                            ssh.exec(cmd, sploit, { stream: 'stdout', options: { pty: true } }).then((result) => {
                                ssh.dispose();
                                resolve(result);
                            });
                        } else {
                            ssh.execCommand(command, {}).then(function(result) {
                                ssh.dispose();
                                resolve(result);
                            })
                        }
                    }
                } catch (error) {
                    ssh.dispose();
                    reject(error);
                }
            }).catch((error) => {
                reject(error);
            });
        });
    }

    /**
     * waitUntilUp
     * @param {*} ip 
     */
    static async waitUntilUp(ip) {
        // Wait untill VM is back up and running
        let isOnline = false;
        let attempts = 0;
        
        while(!isOnline && attempts <= 20){
            await _sleep(1000 * 5);
            try {
                let r = await this.sshExec(ip, `ls -l`, true);
                if(r.code == 0) {
                    isOnline = true;
                } else {
                    attempts++;
                }
            } catch (_e) {
                attempts++;
            }
        }
        return isOnline;
    }
}

module.exports = OsController;