mycloud-cli
===========

MyCloud CLI

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/mycloud-cli.svg)](https://npmjs.org/package/mycloud-cli)
[![Downloads/week](https://img.shields.io/npm/dw/mycloud-cli.svg)](https://npmjs.org/package/mycloud-cli)
[![License](https://img.shields.io/npm/l/mycloud-cli.svg)](https://github.com/mdundek/mycloud-cli/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g mc
$ mc COMMAND
running command...
$ mc (-v|--version|version)
mc/0.0.0 darwin-x64 node-v12.14.1
$ mc --help [COMMAND]
USAGE
  $ mc COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`mc bind:volume [NAME]`](#mc-bindvolume-name)
* [`mc config:cluster`](#mc-configcluster)
* [`mc config:kubectl`](#mc-configkubectl)
* [`mc create:organization [ORGNAME]`](#mc-createorganization-orgname)
* [`mc create:volume [NAME]`](#mc-createvolume-name)
* [`mc create:workspace [WSNAME]`](#mc-createworkspace-wsname)
* [`mc delete:organization [ORGNAME]`](#mc-deleteorganization-orgname)
* [`mc delete:workspace [WSNAME]`](#mc-deleteworkspace-wsname)
* [`mc get:organizations`](#mc-getorganizations)
* [`mc get:workspace-nodes`](#mc-getworkspace-nodes)
* [`mc get:workspace-pvs`](#mc-getworkspace-pvs)
* [`mc get:workspaces`](#mc-getworkspaces)
* [`mc help [COMMAND]`](#mc-help-command)
* [`mc join`](#mc-join)
* [`mc login`](#mc-login)
* [`mc logout`](#mc-logout)
* [`mc register`](#mc-register)
* [`mc set:organization [ORGNAME]`](#mc-setorganization-orgname)
* [`mc set:workspace [WSNAME]`](#mc-setworkspace-wsname)
* [`mc status`](#mc-status)
* [`mc unbind:volume [NAME]`](#mc-unbindvolume-name)

## `mc bind:volume [NAME]`

Bind a volume to a resource

```
USAGE
  $ mc bind:volume [NAME]

ARGUMENTS
  NAME  The name of the volume

OPTIONS
  -h, --help                             show CLI help
  -t, --target=k8s|VM (in construction)  Target to bing the volume to
```

_See code: [src/commands/bind/volume.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/bind/volume.ts)_

## `mc config:cluster`

Configure your workspace cluster

```
USAGE
  $ mc config:cluster

OPTIONS
  -h, --help     show CLI help
  --scale=scale  Scale your cluster workers
```

_See code: [src/commands/config/cluster.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/config/cluster.ts)_

## `mc config:kubectl`

Install the workspace kubectl configuration file on your local machine

```
USAGE
  $ mc config:kubectl

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/config/kubectl.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/config/kubectl.ts)_

## `mc create:organization [ORGNAME]`

Create a new organization for your account

```
USAGE
  $ mc create:organization [ORGNAME]

ARGUMENTS
  ORGNAME  The name of the new organization

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/create/organization.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/create/organization.ts)_

## `mc create:volume [NAME]`

Create a new volume for this workspace

```
USAGE
  $ mc create:volume [NAME]

ARGUMENTS
  NAME  The name of the volume

OPTIONS
  -h, --help       show CLI help
  -s, --size=size  Volume size
  -t, --type=type  Type of volume
```

_See code: [src/commands/create/volume.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/create/volume.ts)_

## `mc create:workspace [WSNAME]`

Create a new workspace for your organization

```
USAGE
  $ mc create:workspace [WSNAME]

ARGUMENTS
  WSNAME  The name of the new workspace

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/create/workspace.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/create/workspace.ts)_

## `mc delete:organization [ORGNAME]`

Delete an organization for your account

```
USAGE
  $ mc delete:organization [ORGNAME]

ARGUMENTS
  ORGNAME  The name of the organization to delete

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/delete/organization.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/delete/organization.ts)_

## `mc delete:workspace [WSNAME]`

Delete an workspace for your organization

```
USAGE
  $ mc delete:workspace [WSNAME]

ARGUMENTS
  WSNAME  The name of the workspace to delete

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/delete/workspace.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/delete/workspace.ts)_

## `mc get:organizations`

Get organizations for your account

```
USAGE
  $ mc get:organizations

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/get/organizations.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/get/organizations.ts)_

## `mc get:workspace-nodes`

Get the status of the current workspace cluster

```
USAGE
  $ mc get:workspace-nodes

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/get/workspace-nodes.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/get/workspace-nodes.ts)_

## `mc get:workspace-pvs`

Get the persisted volumes for this workspace k8s cluster

```
USAGE
  $ mc get:workspace-pvs

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/get/workspace-pvs.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/get/workspace-pvs.ts)_

## `mc get:workspaces`

Set the workspaces for the current organization

```
USAGE
  $ mc get:workspaces

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/get/workspaces.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/get/workspaces.ts)_

## `mc help [COMMAND]`

display help for mc

```
USAGE
  $ mc help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.2.3/src/commands/help.ts)_

## `mc join`

Specify a MyCloud API target

```
USAGE
  $ mc join

OPTIONS
  -h, --help       show CLI help
  -h, --host=host  MyCloud API host url
```

_See code: [src/commands/join.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/join.ts)_

## `mc login`

Login to the platform

```
USAGE
  $ mc login

OPTIONS
  -h, --help               show CLI help
  -p, --password=password  Your MyCloud password
  -u, --user=user          Your MyCloud username
```

_See code: [src/commands/login.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/login.ts)_

## `mc logout`

Log out

```
USAGE
  $ mc logout

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/logout.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/logout.ts)_

## `mc register`

Register a new account

```
USAGE
  $ mc register

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/register.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/register.ts)_

## `mc set:organization [ORGNAME]`

Set the current organization for your account

```
USAGE
  $ mc set:organization [ORGNAME]

ARGUMENTS
  ORGNAME  The name of the organization to set

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/set/organization.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/set/organization.ts)_

## `mc set:workspace [WSNAME]`

Set the current workspace for your organization

```
USAGE
  $ mc set:workspace [WSNAME]

ARGUMENTS
  WSNAME  The name of the workspace to set

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/set/workspace.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/set/workspace.ts)_

## `mc status`

Get the current status of your session

```
USAGE
  $ mc status

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/status.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/status.ts)_

## `mc unbind:volume [NAME]`

Unbind a volume from a resource

```
USAGE
  $ mc unbind:volume [NAME]

ARGUMENTS
  NAME  The name of the volume

OPTIONS
  -h, --help                             show CLI help
  -t, --target=k8s|VM (in construction)  Target to unbing the volume from
```

_See code: [src/commands/unbind/volume.ts](https://github.com/mdundek/mc/blob/v0.0.0/src/commands/unbind/volume.ts)_
<!-- commandsstop -->
