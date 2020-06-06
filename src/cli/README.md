multipaas-cli
===========

MultiPaaS CLI

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/multipaas-cli.svg)](https://npmjs.org/package/multipaas-cli)
[![Downloads/week](https://img.shields.io/npm/dw/multipaas-cli.svg)](https://npmjs.org/package/multipaas-cli)
[![License](https://img.shields.io/npm/l/multipaas-cli.svg)](https://github.com/mdundek/multipaas-cli/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g mp
$ mp COMMAND
running command...
$ mp (-v|--version|version)
mp/0.0.0 darwin-x64 node-v12.14.1
$ mp --help [COMMAND]
USAGE
  $ mp COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`mp bind:volume [NAME]`](#mp-bindvolume-name)
* [`mp config:cluster`](#mp-configcluster)
* [`mp config:kubectl`](#mp-configkubectl)
* [`mp create:organization [ORGNAME]`](#mp-createorganization-orgname)
* [`mp create:volume [NAME]`](#mp-createvolume-name)
* [`mp create:workspace [WSNAME]`](#mp-createworkspace-wsname)
* [`mp delete:organization [ORGNAME]`](#mp-deleteorganization-orgname)
* [`mp delete:workspace [WSNAME]`](#mp-deleteworkspace-wsname)
* [`mp get:organizations`](#mp-getorganizations)
* [`mp get:workspace-nodes`](#mp-getworkspace-nodes)
* [`mp get:workspace-pvs`](#mp-getworkspace-pvs)
* [`mp get:workspaces`](#mp-getworkspaces)
* [`mp help [COMMAND]`](#mp-help-command)
* [`mp join`](#mp-join)
* [`mp login`](#mp-login)
* [`mp logout`](#mp-logout)
* [`mp register`](#mp-register)
* [`mp set:organization [ORGNAME]`](#mp-setorganization-orgname)
* [`mp set:workspace [WSNAME]`](#mp-setworkspace-wsname)
* [`mp status`](#mp-status)
* [`mp unbind:volume [NAME]`](#mp-unbindvolume-name)

## `mp bind:volume [NAME]`

Bind a volume to a resource

```
USAGE
  $ mp bind:volume [NAME]

ARGUMENTS
  NAME  The name of the volume

OPTIONS
  -h, --help                             show CLI help
  -t, --target=k8s|VM (in construction)  Target to bing the volume to
```

_See code: [src/commands/bind/volume.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/bind/volume.ts)_

## `mp config:cluster`

Configure your workspace cluster

```
USAGE
  $ mp config:cluster

OPTIONS
  -h, --help     show CLI help
  --scale=scale  Scale your cluster workers
```

_See code: [src/commands/config/cluster.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/config/cluster.ts)_

## `mp config:kubectl`

Install the workspace kubectl configuration file on your local machine

```
USAGE
  $ mp config:kubectl

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/config/kubectl.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/config/kubectl.ts)_

## `mp create:organization [ORGNAME]`

Create a new organization for your account

```
USAGE
  $ mp create:organization [ORGNAME]

ARGUMENTS
  ORGNAME  The name of the new organization

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/create/organization.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/create/organization.ts)_

## `mp create:volume [NAME]`

Create a new volume for this workspace

```
USAGE
  $ mp create:volume [NAME]

ARGUMENTS
  NAME  The name of the volume

OPTIONS
  -h, --help       show CLI help
  -s, --size=size  Volume size
  -t, --type=type  Type of volume
```

_See code: [src/commands/create/volume.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/create/volume.ts)_

## `mp create:workspace [WSNAME]`

Create a new workspace for your organization

```
USAGE
  $ mp create:workspace [WSNAME]

ARGUMENTS
  WSNAME  The name of the new workspace

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/create/workspace.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/create/workspace.ts)_

## `mp delete:organization [ORGNAME]`

Delete an organization for your account

```
USAGE
  $ mp delete:organization [ORGNAME]

ARGUMENTS
  ORGNAME  The name of the organization to delete

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/delete/organization.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/delete/organization.ts)_

## `mp delete:workspace [WSNAME]`

Delete an workspace for your organization

```
USAGE
  $ mp delete:workspace [WSNAME]

ARGUMENTS
  WSNAME  The name of the workspace to delete

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/delete/workspace.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/delete/workspace.ts)_

## `mp get:organizations`

Get organizations for your account

```
USAGE
  $ mp get:organizations

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/get/organizations.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/get/organizations.ts)_

## `mp get:workspace-nodes`

Get the status of the current workspace cluster

```
USAGE
  $ mp get:workspace-nodes

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/get/workspace-nodes.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/get/workspace-nodes.ts)_

## `mp get:workspace-pvs`

Get the persisted volumes for this workspace k8s cluster

```
USAGE
  $ mp get:workspace-pvs

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/get/workspace-pvs.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/get/workspace-pvs.ts)_

## `mp get:workspaces`

Set the workspaces for the current organization

```
USAGE
  $ mp get:workspaces

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/get/workspaces.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/get/workspaces.ts)_

## `mp help [COMMAND]`

display help for mp

```
USAGE
  $ mp help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.2.3/src/commands/help.ts)_

## `mp join`

Specify a MultiPaaS API target

```
USAGE
  $ mp join

OPTIONS
  -h, --help       show CLI help
  -h, --host=host  MultiPaaS API host url
```

_See code: [src/commands/join.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/join.ts)_

## `mp login`

Login to the platform

```
USAGE
  $ mp login

OPTIONS
  -h, --help               show CLI help
  -p, --password=password  Your MultiPaaS password
  -u, --user=user          Your MultiPaaS username
```

_See code: [src/commands/login.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/login.ts)_

## `mp logout`

Log out

```
USAGE
  $ mp logout

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/logout.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/logout.ts)_

## `mp register`

Register a new account

```
USAGE
  $ mp register

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/register.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/register.ts)_

## `mp set:organization [ORGNAME]`

Set the current organization for your account

```
USAGE
  $ mp set:organization [ORGNAME]

ARGUMENTS
  ORGNAME  The name of the organization to set

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/set/organization.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/set/organization.ts)_

## `mp set:workspace [WSNAME]`

Set the current workspace for your organization

```
USAGE
  $ mp set:workspace [WSNAME]

ARGUMENTS
  WSNAME  The name of the workspace to set

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/set/workspace.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/set/workspace.ts)_

## `mp status`

Get the current status of your session

```
USAGE
  $ mp status

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/status.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/status.ts)_

## `mp unbind:volume [NAME]`

Unbind a volume from a resource

```
USAGE
  $ mp unbind:volume [NAME]

ARGUMENTS
  NAME  The name of the volume

OPTIONS
  -h, --help                             show CLI help
  -t, --target=k8s|VM (in construction)  Target to unbing the volume from
```

_See code: [src/commands/unbind/volume.ts](https://github.com/mdundek/mp/blob/v0.0.0/src/commands/unbind/volume.ts)_
<!-- commandsstop -->
