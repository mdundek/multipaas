import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

const fs = require("fs");

export default class certificate extends Command {
	static description = 'create a new certificate for your account'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	static args = [
	  	{	
			name: 'crtName',
			description: 'The name of the new certificate'
		}
	]

	/**
	 * run
	 */
	async run() {
		const {args} = this.parse(certificate)
		if(!args.crtName){
			return this.logError("Missing certificate name.");
		}

		let result = await this.api("domains", {
			method: "get-domains",
			data: {}
		});
		if(this.handleError(result, args.crtName)){
			if(result.data.length == 0){
				return this.logError("There are no domains to upload a certificate for");
			}
			// Select target domain
			let domainChoice: any = await inquirer.prompt([{
				name: 'domain',
				message: 'What domain is this certificate for:',
				type: 'list',
				choices: result.data.map((o: { name: any, id: any }) => {
					return {
						name: o.name,
						value: o.id
					}
				})
			}]);
			let domainId = domainChoice.domain;

			let key = await cli.prompt('Path to the certificate key file');
			try {
				key = fs.readFileSync(key, 'utf8');
			} catch (error) {
				return this.logError("Could not read file. Make sure the path is correct");
			}
			
			let crt = await cli.prompt('Path to the certificate crt file');
			try {
				crt = fs.readFileSync(crt, 'utf8');
			} catch (error) {
				return this.logError("Could not read file. Make sure the path is correct");
			}

			result = await this.api("certificates", {
				method: "create",
				data: {
					"name": args.crtName,
					"domainId": domainId,
					"key": key,
					"crt": crt
				}
			});

			if(this.handleError(result, args.crtName)){
				this.log("Certificate created successfully");
			}
		}
	}

	/**
	 * handleError
	 * @param result 
	 */
	handleError(result: { code: number }, name: string) {
		if(result.code == 401){
			this.logError(`You are not logged in`);
			return false;
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to create new certificates`);
			return false;
		} else if(result.code == 409){
			this.logError(`The certificate '${name}' already exists`);
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