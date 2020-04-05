import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'
const EventsController = require('../../controllers/events/index.js');
const chalk = require('chalk')
const archiver = require('archiver');
const glob = require("glob");
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

export default class Push extends Command {
	static description = 'build a new image of your application and deploy it to your private registry'
	
	validImageRegEx = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/g
	validTagRegEx = /^(?:[\dx]{1,3}\.){0,3}[\dx]{1,3}$/g

	static flags = {
		help: flags.help({char: 'h'}),
		image: flags.string({
			char: 'n',
			description: 'Docker image name'
		}),
		version: flags.string({
			char: 'v',
			description: 'Image version'
		}),
	}

	/**
	 * run
	 */
	async run() {	
		const {flags} = this.parse(Push)
		if(!flags.image){
			flags.image = await cli.prompt('Name of the image');
		}
		if(!this.validImageRegEx.test(flags.image)){
			return this.logError("The image name must consist of lower case alphanumeric characters, '-' or '_', and must start and end with an alphanumeric character");
		}
		if(!flags.version){
			flags.version = await cli.prompt('Version of the image');
		}
		if(flags.version != "latest" && !this.validTagRegEx.test(flags.version)){
			return this.logError("The tag name format is invalide. Example of valide tags are 'x', 'x.y.z', or 'latest'");
		}
		
		let currentPath = path.resolve('.');
		if (!fs.existsSync(path.join(currentPath, "Dockerfile"))) {
			return this.logError("There is no Dockerfile in this directory");
		}
		
		let hash = null;
        while(hash == null){
            hash = shortid.generate().toLowerCase();
            if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                hash = null;
            }
		}

		let targetZip = path.join(require('os').homedir(), `.mycloud/${hash}.zip`);
		try {
			if(fs.existsSync(".mcignore")){
				let ignorePatterns = fs.readFileSync(".mcignore", "utf8");
				ignorePatterns = ignorePatterns.split("\n").filter((o: { trim: () => { (): any; new(): any; length: number; }; }) => o.trim().length > 0);
				await this.zipDirectory(targetZip, ignorePatterns);
			} else {
				await this.zipDirectory(targetZip);
			}
		} catch (error) {
			return this.logError("Could not package application");
		}

		let result = await this.api("image", {
			method: "push",
			targetZip: targetZip,
			image: flags.image,
			version: flags.version
		}, (event: any) => {
			if(event.error){
				cli.action.stop();
				cli.action.start(chalk.red(event.value));
			} else {
				this.log(event.value);
			}
		}, () => {
			cli.action.stop();
		});

		if(result.code != 200){
			EventsController.close();
		}

		fs.unlinkSync(targetZip);

		if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
		} else if(result.code == 425){
			this.logError(`Your cluster is in the process of being updated. Please wait a bit until all tasks are finished to perform further configurations.`);
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else if(result.code != 200){
			console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}

	/**
	 * zipDirectory
	 * @param source 
	 * @param out 
	 */
	zipDirectory(out: any, ignorePatterns?: any) {
		const archive = archiver('zip', { zlib: { level: 9 }});
		const stream = fs.createWriteStream(out);
	  
		return new Promise((resolve, reject) => {
			archive.pipe(stream);
			archive.glob('**/*', { ignore: ignorePatterns ? ignorePatterns : [] , dot: true });
			stream.on('close', () => resolve());
			archive.finalize();
		});
	  }
}
