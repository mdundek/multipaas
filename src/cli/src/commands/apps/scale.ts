import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'
import * as inquirer from 'inquirer'
const EventsController = require('../../controllers/events/index.js');
const chalk = require('chalk')

export default class Scale extends Command {
	static description = 'Scale your application deployments'

	validNameRegEx = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/g

	static flags = {
		help: flags.help({char: 'h'}),
		ns: flags.string({
			description: 'target namespace'
		}),
		name: flags.string({
			description: 'application name'
		}),
		version: flags.string({
			description: 'application image version name'
		}),
		instances: flags.integer({
			description: 'application instances to scale to'
		})
	}

	/**
	 * run
	 */
	async run() {
		const {flags} = this.parse(Scale)
		let apiData = {
			appId: "",
			appVersionId: "",
			ns: "",
			replicaCount: 1
		};

		let session = await this.api("status");
		let resultNs = null;
		if(flags.ns) {
			apiData.ns = flags.ns;
		} else if(session.namespace) {
			apiData.ns = session.namespace;
		} else {
			resultNs = await this.api("namespaces", {
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
				message: 'Select a namespace',
				type: 'list',
				choices: resultNs.data.map((o: { NAME: string }) => {
					return {
						name: o.NAME
					}
				})
			}]);
			apiData.ns = nsChoice.name;
		}

		let result = await this.api("applications", {
			method: "get-applications",
			data: {}
		});
		if(!this.handleError(result)){
			process.exit(1);
		}
		result.data = result.data.filter((o: { namespace: null; }) => o.namespace == apiData.ns);
		if(result.data.length == 0){
			return this.logError("no applications found");
		}

		if(flags.name) {
			let _tmp = result.data.find((o: { name: string | undefined; }) => o.name == flags.name);
			if(!_tmp) {
				return this.logError("application name not found");
			}
			apiData.appId = _tmp.id;
		} else {
			let appChoice: any = await inquirer.prompt([{
				name: 'response',
				message: 'What application do you want to scale:',
				type: 'list',
				choices: result.data.map((o: { name: any, id: any }) => {
					return {
						name: o.name,
						value: o.id
					}
				})
			}]);
			apiData.appId = appChoice.response;
		}

		let targetApp = result.data.find((o: { id: any; }) => o.id == apiData.appId);
		if(flags.version) {
			let _tmp = targetApp.application_versions.find((o: { registry: any; image: any; tag: any; }) => `${o.registry}/${o.image}/${o.tag}` == flags.version);
			if(!_tmp) {
				return this.logError("application image version not found");
			}
			apiData.appVersionId = _tmp.id;
		} else {
			let imageSelect: any = await inquirer.prompt([{
				name: 'response',
				message: 'Select a image version to scale',
				type: 'list',
				choices: targetApp.application_versions.map((version: { registry: any; image: any; tag: any; id: any; }) => {
					return {
						"name": `${version.registry}/${version.image}/${version.tag}`,
						"value": version.id
					};
				})
			}]);
			apiData.appVersionId = imageSelect.response;
		}

		if(flags.instances) {
			apiData.replicaCount = flags.instances;
		} else {
			apiData.replicaCount = await cli.prompt('How many instances');
		}

		await this.api("applications", {
			method: "scale",
			data: apiData
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
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
			return false;
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to create new service`);
			return false;
		} else if(result.code == 425){
			this.logError(`Your cluster is in the process of being updated. Please wait a bit until all tasks are finished to perform further configurations.`);
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