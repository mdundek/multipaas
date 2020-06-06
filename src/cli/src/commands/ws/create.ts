import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'
const EventsController = require('../../controllers/events/index.js');
const chalk = require('chalk')

export default class Workspace extends Command {
	static description = 'create a new workspace for your organization'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	static args = [
	  	{	
			name: 'wsName',
			description: 'The name of the new workspace'
		}
	]

	/**
	 * run
	 */
	async run() {
		const {args} = this.parse(Workspace)
		if(!args.wsName){
			return this.logError("Missing workspace name.");
		}
		
		// Now make the call
		let result = await this.api("workspace", {
			method: "create",
			data: {
				"name": args.wsName
			}
		}, (event: any) => {
			if(event.error){
				this.deleteSessionWorkspace();
				cli.action.stop();
				cli.action.start(chalk.red(event.value));
			} else {
				cli.action.stop();
				cli.action.start(event.value);
			}
		}, () => {
			cli.action.stop();
		});

		if(result.code != 200){
			EventsController.close();
		}

		if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to create new workspaces`);
		} else if(result.code == 409){
			this.logError(`The workspace '${args.wsName}' already exists`);
		} else if(result.code == 412){
			this.logError(`You need to select an organization first`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
		} else if(result.code == 503){
			this.logError(`MultiPaaS is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else if(result.code != 200){
			// console.log(result);
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}