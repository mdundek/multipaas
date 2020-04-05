import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'
let fs = require("fs");

export default class ServiceConfigFile extends Command {
    static description = 'get the base config file for a specific service'

	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		// Get all available services
		let result = await this.api("services", {
			method: "available"
		});
		let allServices = result.data;

		if(this.handleError(result)){
			let apiData = {
				service: "",
				chartVersion: ""
			}

			let choices = [];
			for(let s in allServices){
				choices.push({
					name: `${s} - ${allServices[s].description}`,
					value: s
				});
			}

			// Select target service
			let serviceChoice: any = await inquirer.prompt([{
				name: 'serviceName',
				message: 'Choose the service you wish to fetch the base config file:',
				type: 'list',
				choices: choices,
			}]);
			apiData.service = serviceChoice.serviceName;

			// Select target service version
			let serviceVersionChoice: any = await inquirer.prompt([{
				name: 'serviceVersion',
				message: 'Select a version:',
				type: 'list',
				choices: allServices[serviceChoice.serviceName].versions.map((o: { appVersion: any, version: any }) => {
					return {
						name: `v${o.appVersion}`,
						value: o.version
					}
				})
			}]);
			apiData.chartVersion = serviceVersionChoice.serviceVersion;

			// Now make the call
			result = await this.api("services", {
				method: "fetchConfig",
				data: apiData
			});

			if(this.handleError(result)){
				let fileName = `${apiData.service}.${apiData.chartVersion}-config.yaml`;
				fs.writeFileSync(fileName, result.config);
				this.log(`Service config file "${fileName}" downloaded`);
			}
		}
	}

	/**
	 * handleError
	 * @param result 
	 */
	handleError(result: { code: number }) {
		if(result.code == 401){
			this.logError(`You are not logged in`);
			return false;
		} else if(result.code == 409){
			this.logError(`This service name is already in use`);
			return false;
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
			return false;
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
			return false;
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to create new service`);
			return false;
		} else if(result.code == 425){
			this.logError(`Your cluster is in the process of being updated. Please wait a bit until all tasks are finished to perform further configurations.`);
			return false;
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
			return false;
		} else if(result.code != 200){
			// console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
			return false;
		} else {
			return true;
		}
	}
}
