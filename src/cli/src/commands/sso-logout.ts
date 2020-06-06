import {flags} from '@oclif/command'
import Command from '../base'
import cli from 'cli-ux'

export default class SSOLogout extends Command {
    static description = 'Logout from browser SSO session'

	/**
	 * run
	 */
	async run() {		
		await cli.open('https://multipaas.keycloak.com/auth/realms/master/protocol/openid-connect/logout')
	}
}
