const { AuthenticationService, JWTStrategy, AuthenticationBaseStrategy } = require('@feathersjs/authentication');
const { LocalStrategy } = require('@feathersjs/authentication-local');
const { expressOauth } = require('@feathersjs/authentication-oauth');
const { NotAuthenticated, GeneralError, NotFound } = require('@feathersjs/errors');
const PermissionHelper = require("./lib/permission_helper");
const Keycloak = require("./lib/keycloak");

class KEYCLOAKStrategy extends AuthenticationBaseStrategy {
	/**
	 * authenticate
	 * @param {*} data 
	 */
	async authenticate(data) {
		let usersService = this.app.service('users');

		return new Promise(async (resolve, reject) => {
			const { email, password } = data;
			
			// Authenticate with Keycloak
			var jwtDecoded = null;
			// let adminToken = null;
			try {
				jwtDecoded = await Keycloak.authenticate(email, password, true);
				// adminToken = await Keycloak.adminAuthenticate(this.app); 
			
				// Look for user locally
				let existingUser = await usersService.find({
					paginate: false,
					query: {
						$limit: 1,
						email: jwtDecoded.email
					}
				});
				
				// Does not yet exist
				if(existingUser.length == 0){
					let error = new Error('Unknown user');
					error.statusCode = 401;
					err.code = 401;
				
					return reject(new NotAuthenticated(error));		
				} 
				// User exists, logged in
				else {
					let userOwnedAccounts = await this.app.service('acc-users').find({
						paginate: false,
						query: {
							userId: existingUser[0].id,
							isAccountOwner: true
						}
					});
					resolve({
						authentication: { strategy: this.name },
						user: existingUser[0],
						account: userOwnedAccounts[0].account,
						roles: jwtDecoded.resource_access["kubernetes-cluster"] ? jwtDecoded.resource_access["kubernetes-cluster"].roles : []
					});
				}
			} catch (error) {
				return reject(error);
			}
		});
	}
}

module.exports = app => {
  const authentication = new AuthenticationService(app);

  authentication.register('jwt', new JWTStrategy());
  authentication.register('keycloak', new KEYCLOAKStrategy());
  authentication.register('local', new LocalStrategy());

  app.use('/authentication', authentication);
  app.configure(expressOauth());
};