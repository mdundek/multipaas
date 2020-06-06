import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'
import * as inquirer from 'inquirer'

const chalk = require('chalk')

export default class WorkspacePvs extends Command {
	static description = 'get the persisted volumes for this workspace k8s cluster'
	
	static flags = {
		help: flags.help({char: 'h'}),
		ns: flags.string(),
	}

	/**
	 * run
	 */
	async run() {
		const {flags} = this.parse(WorkspacePvs);

		let apiParams = {
			"ns": null
		};

		let session = await this.api("status");
		if(flags.ns) {
			apiParams.ns = flags.ns;
		} else if(!session.namespace) {
			let resultNs = await this.api("namespaces", {
				method: "get-namespaces",
				data: {}
			});
			
			if(!this.handleError(resultNs)){
				return;
			}
			if(resultNs.data.length == 0) {
				return this.logError("There are no namespaces configured on your cluster. Namespaces are like separate isolated environements on your cluster that you can deploy resources on. Start by creating a namespace using the command 'mp create:ns', then try again.");
			}
			
			// Select namespace
			let nsChoice: any = await inquirer.prompt([{
				name: 'name',
				message: 'For what namespace do you wish to get the PVCs for?',
				type: 'list',
				choices: resultNs.data.map((o: { NAME: string }) => {
					return {
						name: o.NAME
					}
				})
			}]);
			apiParams.ns = nsChoice.name;
		} else {
			apiParams.ns = session.namespace;
		}

		let result = await this.api("pvc", {
			method: "get-pvcs",
			data: apiParams
		});
		if(!this.handleError(result)){
			return;
		}
		if(result.data.length > 0){
			cli.table(result.data, {
				NAME: {
					header: 'NAME',
					minWidth: 25,
				},
				CAPACITY: {
					header: 'CAPACITY',
					minWidth: 15,
				},
				STATUS: {
					header: 'STATUS',
					minWidth: 15,
				},
				MOUNT_PATH: {
					header: 'MOUNT_PATH'
				}
			});	
		} else {
			this.logMessage("No PVCs found for this namespace");
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
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
			return false;
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
			return false;
		} else if(result.code == 425){
			this.logError(`The cluster is updating. Please try again in a little while`);
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