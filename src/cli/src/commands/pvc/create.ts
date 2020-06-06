import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

export default class Pvc extends Command {
	static description = 'create a new persistant volume claim for your account'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let apiData = {
			ns: null,
			name: null,
			volumeName: null,
			pvcSize: -1
		};

		let session = await this.api("status");
		if(!session.namespace) {
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
				message: 'In what namespace do you wish to create this PVC?',
				type: 'list',
				choices: resultNs.data.map((o: { NAME: string }) => {
					return {
						name: o.NAME
					}
				})
			}]);
			apiData.ns = nsChoice.name;
		} else {
			apiData.ns = session.namespace;
		}
		
		let resultVol = await this.api("volume", {
			method: "list"
		});
		if(!this.handleError(resultVol)){
			return;
		}
		
		let valideVolumes = resultVol.data.filter((volume: any) => volume.bindings.length == 0 || volume.bindings.find((o: { target: string }) => o.target != "k8s") ? false : true);
		valideVolumes = valideVolumes.map((volume : any) => {
			if(volume.bindings[0].services.length == 0 && volume.bindings[0].applications.length == 0) {
				volume.remainingCapacity = volume.size;
			} else {
				let usedServiceSize = volume.bindings[0].services.map((o:any) => o.pvcSize).reduce((a: any, b: any) => a + b, 0);
				let usedAppsSize = volume.bindings[0].applications.map((o:any) => o.pvcSize).reduce((a: any, b: any) => a + b, 0);
				volume.remainingCapacity = volume.size - usedServiceSize - usedAppsSize;
			}
			return volume;
		}).filter((volume: any) => volume.remainingCapacity > 1);

		if(valideVolumes.length == 0){
			return this.logError("You do not have any volumes provisioned with sufficient remaining space. Please provision and bind a new volume to your cluster first and try again.");
		}

		apiData.name = await cli.prompt(`Please provide a name for this PVC`);		

		// Select target service version
		let volChoice: any = await inquirer.prompt([{
			name: 'name',
			message: 'Which volume do you wish to use?',
			type: 'list',
			choices: valideVolumes.map((o: { name: string }) => {
				return {
					name: o.name
				}
			})
		}]);
		apiData.volumeName = volChoice.name;
				
		let totalCapacity = valideVolumes.find((o:any) => o.name == apiData.volumeName).remainingCapacity;				
		const pvcSizeString = await cli.prompt(`What size in MB do you want to assign to this service (Maximum ${totalCapacity} MB)`);		
		apiData.pvcSize = parseInt(pvcSizeString);
		
		cli.action.start('Creating PVC and mounting volume');
		let result = await this.api("pvc", {
			method: "create",
			data: apiData
		});
		cli.action.stop();
		if(this.handleError(result)){
			this.logMessage("PVC created");
			this.logMessage("Mount path: " + result.data);
			this.logMessage("");
			this.logMessage("Please note: If you wish to access the mounted PV folders, simply SSH into your cluster hosts.\nTo find out the cluster hosts IP addresses, run 'mp cluster:list-nodes'.");
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
		} else if(result.code == 409){
			this.logError(`The PVC name already exists`);
			return false;
		} else if(result.code == 417){
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