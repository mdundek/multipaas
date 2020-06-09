#!/bin/bash

########################################
# Getting command line parameters
########################################
API_SYSADMIN_PASSWORD="$1"
GITLAB_IP="$2"
GITLAB_KC_SECRET="$3"

########################################
# Prepare & install MultiPaaS GitLab
########################################
echo "[TASK 19] Install MultiPaaS GitLab"
touch ./_drun.sh
chmod +rwx ./_drun.sh 
cat > ./_drun.sh << ENDOFFILE
#!/bin/bash
sudo docker run -d \
  --hostname multipaas.gitlab.com \
  --env GITLAB_OMNIBUS_CONFIG="\
  gitlab_rails['gitlab_shell_ssh_port'] = 2289;\
  gitlab_rails['initial_root_password'] = '<API_SYSADMIN_PASSWORD>';\
  gitlab_rails['gitlab_signin_enabled'] = false;\
  external_url 'http://<IP_PLACEHOLDER>:8929';\
  gitlab_rails['omniauth_allow_single_sign_on'] = ['openid_connect'];\
  gitlab_rails['omniauth_sync_email_from_provider'] = 'openid_connect';\
  gitlab_rails['omniauth_sync_profile_from_provider'] = ['openid_connect'];\
  gitlab_rails['omniauth_sync_profile_attributes'] = ['email'];\
  gitlab_rails['omniauth_block_auto_created_users'] = false;\
  gitlab_rails['omniauth_providers'] = [\
    {\
      'name' => 'openid_connect',\
      'label' => 'keycloak',\
      'args' => {\
        'name' => 'openid_connect',\
        'scope' => ['openid','profile'],\
        'response_type' => 'code',\
        'issuer' => 'https://multipaas.keycloak.com/auth/realms/master',\
        'discovery' => true,\
        'client_auth_method' => 'query',\
        'uid_field' => 'email',\
        'send_scope_to_token_endpoint' => 'false',\
        'client_options' => {\
          'identifier' => 'gitlab',\
          'secret' => '<GITLAB_KC_SECRET>',\
          'redirect_uri' => 'https://multipaas.gitlab.com/users/auth/openid_connect/callback',\
          'end_session_endpoint' => 'https://multipaas.keycloak.com/auth/realms/master/protocol/openid-connect/logout'\
        }\
      }\
    }\
  ];\
  "\
  --publish 8929:8929 --publish 2289:22 \
  --name multipaas-gitlab \
  --restart unless-stopped \
  --add-host multipaas.keycloak.com:172.17.0.1 \
  --volume /home/vagrant/.multipaas/gitlab/config:/etc/gitlab \
  --volume /home/vagrant/.multipaas/gitlab/logs:/var/log/gitlab \
  --volume /home/vagrant/.multipaas/gitlab/data:/var/opt/gitlab \
  gitlab/gitlab-ce:12.10.1-ce.0
ENDOFFILE

sed -i "s/<IP_PLACEHOLDER>/$GITLAB_IP/g" ./_drun.sh
sed -i "s/<API_SYSADMIN_PASSWORD>/$API_SYSADMIN_PASSWORD/g" ./_drun.sh
sed -i "s/<GITLAB_KC_SECRET>/$GITLAB_KC_SECRET/g" ./_drun.sh

su - vagrant -c '
./_drun.sh
' > /dev/null 2>&1
rm -rf ./_drun.sh

########################################
# Reconfigure GitLab & restart it
########################################
echo "Waiting for GitLab to be up and running (this can take up to 4 minutes)"
until $(curl --output /dev/null --silent --head --fail http://$GITLAB_IP:8929/users/sign_in); do
    printf '.'
    sleep 5
done

# Copy root CA from NGInx Keycloak to Gitlab container
docker cp /opt/docker/containers/nginx/certs/rootCA.crt multipaas-gitlab:/etc/gitlab/trusted-certs/rootCA.crt

GITLAB_TOKEN=$(date +%s | sha256sum | base64 | head -c 32 ; echo)
docker exec -t -u git multipaas-gitlab gitlab-rails r "token_digest = Gitlab::CryptoHelper.sha256 \"$GITLAB_TOKEN\"; token = PersonalAccessToken.new(user: User.where(id: 1).first, name: 'temp token', token_digest: token_digest, scopes: [:api]); token.save"'!'

# Disable registration
curl --silent --request PUT --header "PRIVATE-TOKEN: $GITLAB_TOKEN" http://$GITLAB_IP:8929/api/v4/application/settings?signup_enabled=false&allow_local_requests_from_hooks_and_services=true&allow_local_requests_from_web_hooks_and_services=true&allow_local_requests_from_system_hooks=true
# after_sign_out_path

docker stop multipaas-gitlab
docker start multipaas-gitlab
echo "Waiting for GitLab to be up and running (this can take up to 4 minutes)"
until $(curl --output /dev/null --silent --head --fail http://$GITLAB_IP:8929/users/sign_in); do
    printf '.'
    sleep 5
done

echo "[DONE]"