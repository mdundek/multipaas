const si = require('systeminformation');
const os = require('os');
const fs = require('fs');
const ncp = require('ncp').ncp;
const chmodr = require('chmodr');
const shell = require('shelljs');

class OsController {

    /**
     * getFreeMemory
     */
    static async getFreeMemory() {
      let memData = await si.mem();
      return Math.round(memData.available / 1024 / 1024);
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
	 * execSilentCommand
	 * @param {*} command 
	 */
	static async execSilentCommand(command) {
		return new Promise((resolve, reject) => {
			try {
				shell.exec(command, {silent:true}, function(code, stdout, stderr) {
					if(code == 0){
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
}

module.exports = OsController;