import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'
const EventsController = require('../../controllers/events/index.js');
const chalk = require('chalk')

export default class AddRunner extends Command {
	static description = 'Adds a Gitlab runner for a project'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let apiData = {
			type: null,
			token: null
		};

		// Select namespace
		let runnerChoice: any = await inquirer.prompt([{
			name: 'type',
			message: 'What type of runner do you wish to add to your workspace',
			type: 'list',
			choices: [{
				"name": "Shell runner that can talk to my local registry",
				"value": "local-registry-runner"
			}]
		}]);
		apiData.type = runnerChoice.type;
		apiData.token = await cli.prompt(`Enter the project registration token`);		

		let result = await this.api("workspace", {
			method: "add-runner",
			data: apiData
		});
		
		if(this.handleError(result)){
			this.logMessage("Runner created");
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
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to create a persistant volume claim`);
			return false;
		} 
		// else if(result.code == 409){
		// 	this.logError(`The PVC name already exists`);
		// 	return false;
		// } 
		else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
			return false;
		} else if(result.code == 503){
			this.logError(`MultiPaaS is not accessible. Please make sure that you are connected to the right network and try again.`);
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