import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'

const chalk = require('chalk')

export default class WorkspaceNodes extends Command {
	static description = 'get the status of the current workspace cluster'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let result = await this.api("workspace", {
			method: "nodes"
		});
		if(result.code == 200){
			cli.table(result.data, {
				name: {
					header: 'NAME',
					minWidth: 25,
				},
				type: {
					header: 'TYPE',
					minWidth: 15,
				},
				state: {
					header: 'STATE',
					minWidth: 15,
				},
				ip: {
					header: 'IP',
				}
			});			
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
		} else if(result.code == 425){
			this.logError(`The cluster is updating. Please try again in a little while`);
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			// console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}