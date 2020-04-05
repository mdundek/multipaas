const si = require('systeminformation');
const os = require('os');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const ncp = require('ncp').ncp;
const chmodr = require('chmodr');
const shell = require('shelljs');
const mkdirp = require('mkdirp');
var targz = require('targz');



class OsController {

	/**
	 * getGatewayIp
	 */
	static async getGatewayIp() {
		let result = null;
		if(await this.supportsCommand("netstat")){
			result = await this.execSilentCommand(`netstat -nr | grep "${process.env.DEFAULT_INET_INTERFACE_SHORT}" | awk '{print $2}' | grep -E -o "(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"`);
		} else if(await this.supportsCommand("ip")){
			result = await this.execSilentCommand(`ip route | grep "${process.env.DEFAULT_INET_INTERFACE_SHORT}" | grep -E -o "(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"`);
		}
		return result ? result[0] : null;
	}

	/**
	 * getIp
	 */
    static async getIp() {
		if(this.ip){
			return this.ip;
		}
		let result = null;
		let gatewayIp = await this.getGatewayIp();
		if(gatewayIp){
			result = await this.execSilentCommand(`ifconfig ${process.env.DEFAULT_INET_INTERFACE_SHORT} | grep "${gatewayIp.substring(0, gatewayIp.lastIndexOf("."))}" | awk '{print $2}'`);
			this.ip = result[0];
		}
		return result ? result[0] : null;
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
	 * path
	 * @param {*} path 
	 */
	static async execMyCloudScript(path) {
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
							let taskStepLog = l.substring(l.indexOf("]")+1).trim();
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