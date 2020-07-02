const os = require('os');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const chmodr = require('chmodr');
const shell = require('shelljs');
const mkdirp = require('mkdirp');
const { exec } = require("child_process");

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
	 * execSilentCommand
	 * @param {*} command 
	 */
	static async execSilentCommand(command, ignoreErrorCode) {
		console.log(command);
		return new Promise((resolve, reject) => {
			// try {


				exec(command, (error, stdout, stderr) => {
					if (error) {
						reject(error);
						return;
					}
					if (stderr) {
						reject(new Error(stderr));
						return;
					}
					resolve(stdout.split("\n").filter(o => o.length > 0));
				});



				// shell.exec(command, {silent:true}, function(code, stdout, stderr) {
				// 	if((ignoreErrorCode && stderr.trim().length == 0) || code == 0){
				// 		resolve(stdout.split("\n").filter(o => o.length > 0));
				// 	} else {
				// 		reject(new Error(stderr && stderr.trim().length > 0 ? stderr : "An error occured"));
				// 	}
				// });
			// } catch (error) {
			// 	reject(error);
			// }
		});
	}
}

module.exports = OsController;