import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'
const EventsController = require('../../controllers/events/index.js');
import * as inquirer from 'inquirer'
const chalk = require('chalk')

export default class Volume extends Command {
	static description = 'create a new volume for this workspace'

	validVolNameRegEx = /^[a-z0-9]([-a-z0-9]+)[a-z0-9]$/g
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	static args = [
	  	{	
			name: 'name',
			description: 'The name of the volume'
		}
	]

	/**
	 * run
	 */
	async run() {
		const {args} = this.parse(Volume)
		if(!args.name){
			return this.logError("Missing volume name.");
		}

		if(!this.validVolNameRegEx.test(args.name)){
			return this.logError("The volume name must consist of lower case alphanumeric characters, '-', and must start and end with an alphanumeric character");
		}

		let params = {
			size: 0,
			type: "gluster",
			name: args.name
		}

		let val = await cli.prompt('What volume size (MB)?');
		params.size = parseInt(val)

		let responses: any = await inquirer.prompt([{
			name: 'type',
			message: 'What volume type?',
			type: 'list',
			choices: [{name: 'GlusterFS - Distributed storage volume', value: 'gluster'}, {name: 'Local persistant volume', value: 'local'}],
		}]);
		params.type = responses.type;
		
		let result = await this.api("volume", {
			method: "create",
			data: params
		}, (event: any) => {
			if(event.error){
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
			this.logError(`You do not have sufficient permissions to create new volumes`);
		} else if(result.code == 409){
			this.logError(`The volume '${args.name}' already exists`);
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
		} else if(result.code == 425){
			this.logError(`Your cluster is in the process of being updated. Please wait a bit until all tasks are finished to perform further configurations.`);
		} else if(result.code == 503){
			this.logError(`MultiPaaS is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else if(result.code != 200){
			// console.log(result);
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}