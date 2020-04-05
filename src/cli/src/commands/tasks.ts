import {flags} from '@oclif/command'
import Command from '../base'
import {cli} from 'cli-ux'

const chalk = require('chalk')

export default class Tasks extends Command {
	static description = 'list your current workspace tasks'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let result = await this.api("workspace", {
			method: "get-tasks",
			data: {}
		});
		if(result.code == 200){
			// console.log(JSON.stringify(result.data, null, 4));
			
			if(result.data.length > 0){

				if(result.data.length == 10){
					this.log(chalk.bold.grey("Last 10 tasks for this workspace:"));
					this.log("");
				}

				cli.table(result.data, {
					taskType: {
						header: 'TASK',
						minWidth: 28,
					},
					status: {
						header: 'STATUS',
						minWidth: 15,
					},
					createdAt: {
						header: 'DATE',
						minWidth: 20,
					},
					details: {
						header: 'INFO'
					}
				});	
			} else {
				this.log("No tasks found for this workspace");
			}				
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}