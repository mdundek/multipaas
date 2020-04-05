import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

export default class Namespace extends Command {
	static description = 'create a new namespace'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let apiData = {
			name: null
		};

		apiData.name = await cli.prompt(`Please provide a name for the new namespace`);		

		let result = await this.api("namespaces", {
			method: "create",
			data: apiData
		});
		if(this.handleError(result)){
			this.log("Namespace created successfully");
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
			this.logError(`The namespace name already exists`);
			return false;
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
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