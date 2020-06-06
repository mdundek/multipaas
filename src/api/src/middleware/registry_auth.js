const DBController = require("../controllers/db/index");
const crypto = require('crypto');

let accounts = [];
let orgs = [];

let key = Buffer.from(process.env.CRYPTO_KEY, 'base64');
let decrypt = (encryptedVal, salt) => {
	let iv = Buffer.from(salt, 'base64');
	let encryptedText = Buffer.from(encryptedVal, 'hex');
	let decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
	let decrypted = decipher.update(encryptedText);
	decrypted = Buffer.concat([decrypted, decipher.final()]);
	return decrypted.toString();
}
	
module.exports = () => {
	return function registryAuth(req, res, next) {
		(async() => {
			try {
				if(req.headers.authorization) {
					// console.log("HEADERS =>", JSON.stringify(req.headers, null, 4));
					
					// --------------- PULL -------------
					// HEADERS => {
					// 	    "registry-call": "GET /v2/airbus/oasis/qsdfqsdf/manifests/1.0 HTTP/1.1",
					// 	}

					//      "registry-call": "GET /v2/1.0/airbus/oasis/aaa/oasis/manifests/airbus HTTP/1.1",
					// --------------- PUSH -------------
					// HEADERS => {
					// 	    "registry-call": "POST /v2/airbus/oasis/qsdfqsdf/blobs/uploads/ HTTP/1.1",
					// 	}

					// HEADERS => {
					// 	    "registry-call": "PATCH /v2/airbus/oasis/qsdfqsdf/blobs/uploads/1687474e-c016-42b3-ae95-9ed9b61318cc?_state=Ddu5MT2pcpRnZOqQZo8q61j8PAGrL41jgR0mUqpgCpZ7Ik5hbWUiOiJhaXJidXMvb2FzaXMvcXNkZnFzZGYiLCJVVUlEIjoiMTY4NzQ3NGUtYzAxNi00MmIzLWFlOTUtOWVkOWI2MTMxOGNjIiwiT2Zmc2V0IjowLCJTdGFydGVkQXQiOiIyMDIwLTAzLTE3VDExOjA2OjU1LjA2MTAyMjQzNFoifQ%3D%3D HTTP/1.1",
					// 	}

					// 	HEADERS => {
					// 	    "registry-call": "PUT /v2/airbus/oasis/qsdfqsdf/blobs/uploads/1687474e-c016-42b3-ae95-9ed9b61318cc?_state=ChRKZiTc7_sdBCv66lTpZ4lPMfJikMgi_7qFZVtbz0J7Ik5hbWUiOiJhaXJidXMvb2FzaXMvcXNkZnFzZGYiLCJVVUlEIjoiMTY4NzQ3NGUtYzAxNi00MmIzLWFlOTUtOWVkOWI2MTMxOGNjIiwiT2Zmc2V0Ijo4OTU1LCJTdGFydGVkQXQiOiIyMDIwLTAzLTE3VDExOjA2OjU1WiJ9&digest=sha256%3A531d795cac46ebb791989dcd290beec06816d020d7be854c72527441032cc3c2 HTTP/1.1",
					// 	}

					// HEADERS => {
					// 	    "registry-call": "PUT /v2/airbus/oasis/qsdfqsdf/manifests/1.0 HTTP/1.1",
					// 	    "content-type": "application/vnd.docker.distribution.manifest.v2+json"
					// 	}

					let buff = Buffer.from(req.headers["authorization"].substring(6), 'base64');
					let userCredentials = buff.toString('ascii').split(":");
			
					// TODO: If credentials belong to super user, then authorize everything

					let uriRequest = req.headers["registry-call"];
					let uriArray = uriRequest.split(" ");
					let uri = uriArray.find(o => o.indexOf("/v2/") == 0);
					let uriSplit = uri.split("/").filter(o => o.length > 0);

					if(uriArray[0] == "GET" && (uri == "/v2/_catalog" || uri == "/v2/" || uri.indexOf("/list") == (uri.length - 5) || uri.indexOf("/manifests/") != -1 )) {
						res.status(200);
						res.send('ok');
					} else if(uriSplit.length < 4 || (uriSplit[4] != "blobs" && uriSplit[4] != "manifests")) {
						throw new Error("Unauthorized");
					} else {
						let existingAcc = accounts.find(o => o.name == uriSplit[1]);
						if(!existingAcc){
							existingAcc = await DBController.getAccountByName(uriSplit[1]);
							if(!existingAcc){
								throw new Error("Unauthorized");
							}
							if(!accounts.find(o => o.name == uriSplit[1])){
								accounts.push(existingAcc);
							}
						}
						let existingOrg = orgs.find(o => o.name == uriSplit[2]);
						if(!existingOrg){
							existingOrg = await DBController.getOrgByName(uriSplit[2]);
							if(!existingOrg){
								throw new Error("Unauthorized");
							}
							if(!orgs.find(o => o.name == uriSplit[2])){
								orgs.push(existingOrg);
							}
						}

						if(	existingOrg.accountId != existingAcc.id || 
							existingOrg.registryUser != userCredentials[0] || 
							decrypt(existingOrg.registryPass, existingOrg.bcryptSalt) != userCredentials[1]
						){
							throw new Error("Unauthorized");
						}
						res.status(200);
						res.send('ok');
					}
				} else {
					throw new Error("Unauthorized");
				}
			} catch (error) {
				console.log(error);
				res.status(401);
				res.send('ko');
			}
		})();
	};
};









// curl -k -sSL -I -H "Accept: application/vnd.docker.distribution.manifest.v2+json" "https://${registry}/v2/${name}/manifests/1.0"

// curl -k -v -sSL -X DELETE "https://${registry}/v2/${name}/manifests/sha256:180e81d030f6e899c2b6fd28f7badb9bb43af4ca8cacf5cdd9e4dba17fff3204"