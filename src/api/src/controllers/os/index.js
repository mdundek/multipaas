const os = require('os');
var ifaces = os.networkInterfaces();
const fs = require('fs');
const shell = require('shelljs');

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
}

module.exports = OsController;