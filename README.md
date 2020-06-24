# MultiPaaS - A private, multi-tenant cloud PaaS platform

![MultiPaaS Banner](./resources/banner.png)


## What is MultiPaaS

MultiPaaS is a open source, truely multi-tenant cloud platform that can be installed on any Intel/AMD 64 bit based hardware components. It is based on Kubernetes at it's core, providing organizations and teams with isolated clusters and a collection of managed services to be deployed. Some of MultiPaaS's features are:

- From the ground up multi-tenant private cloud PaaS solution (Accounts => Organizations => Workspaces (1 workspace = 1 dedicated K8S cluster))
- Provision managed core services such as various databases, messaging brokers and other services for each tenant
- Easily scale your tenant cluster for HA use cases
- Manage your images with a private docker registry
- Manage your source code and devops pipelines with a private GitLab instance
- Manage storage and volumes independantly for each tenant
- Provides a distributed storage solution based on GlusterFS
- Self service using CLI command line 
- Centralized user-management and SSO using Keycloak
- Load-balancer for your kubernetes applications
- Abstracted deployments of applications and services on a Kubernetes cluster 

## When would I use MultiPaaS

- If you cant / dont want to host your data and applications on public cloud infrastructures
- If you want the convenience of a public cloud environement for your teams & projects, but as a self hosted private cloud native platform.
  
Depending on your requirements, there are two specific ways to operate MultiPaaS. 

1. `MultiPaaS mode` => Automated provision and scaling K8S MultiPaaS clusters (dependant on VirtualBox)
2. `UniPaaS mode` => Install K8S MultiPaaS clusters directly on your VMs or bare metal servers

Think of MultiPaaS as something that resembles RedHat Openshift (less mature of course given the amount of work that went into the latter), but with multi-tenancy / multi-cluster philosophy as it's core, and no vendor lockin using vanilla K8S. 

> IMPORTANT NOTE  
> `MultiPaaS` is a standalone multi-tenant Kubernetes management platform, in other words it is __NOT__ designed to use public cloud kubernetes implementations such as Amazon EKS, Google GKE or Azure AKS. MultiPaaS uses the official Kuberenetes open-source implementation to provision, manage and run clusters on an independant network that you are in control of.  
> The documentation is work in progress. Whatever you might see on this repo at the moment is subject to change until the repo is stabalized.

### When would I use the _MultiPaaS_ Mode

- If you own and control your datacenter and network
- If you want to fully automate cluster provisionning and scaling for your teams and projects

### When would I use the _UniPaaS_ Mode

- If you want to install MultiPaaS anywhere, on your own data centers but also on public clouds
- If you are ok with provisionning your clusters to your VMs and servers using the UniPaaS installation script

## Motivations

One could ask why go through the hassle of building such a complex solution if one could use something like OpenShift, or simply create an account on AWS, Microsoft, GCP or any other cloud provider out there? First off, this project started with the intention for me to learn a bunch of things as far as building a PaaS platform is concerned.  
In the company that I currently work for, it was decided to build a private cloud platform (IaaS & PaaS) that is 100% hosted on the company intranet, completely disconnected from the internet and from the ground up. This is mainly because of the very high demand in safeguarding company data, but building something like this is far more complex than one might think, which got me wondering why that is. So I decided to find out for myself, and my curiosity drove me down that rabbit whole, which so far was an amazing learning experience.  

I starder working with CloudFoundry in 2014, and really enjoyed the efficiency of it when it came to deploying an application on a cloud native environement. CloudFoundry has some amazing concepts that make the job of a developer very easy and convenient (suffise to say "cf push" for those who know what I am talking about). But the sheer capabilities and freedom of architecturing applications provided by Kubernetes is something that CloudFoundry can not rival with (at least not at the time of writing this documentation). Kubernetes is a fantastic platform, but comes with quite a learning curve and complicated concepts to master, if you wish to deploy well architectured, cloud native applications on it. Also, Kubernetes is not multi-tenant, yes it has the concept of namespaces to share a cluster with different tenants, but true multi-tenancy means that you have a dedicated cluster for each tenant. CloudFoundry also has the concept of services such as databases, messaging engines, AI... that can be deployed into a workspace, where applications running in that workspace automatically gain access to the service credentials through environement variables. That is a very convenient concept, especially when you are using multiple environements for your applications.  

So I was thinking, would it not be great to bring the convenience of CloudFoundry to Kubernetes? I now have realized that I reached a point in my learning endavour that could actually have value to other people. This is why today I am opening up this work to the opensource community, as a source of insiration, or as a base to build their own private PaaS cloud platform.  
The code base is still very fragile in terms of stability, there are currently no tests written (remember, this started as a learning experience, tests were not my priority given the time at my disposal), and there are still alot of features that need to be implemented. That said, I think there is currently enougth here to bring this to you guys as a preview. At some point, it would be great if other people could join the project, and contribute to it's developement to get things to move forward quicker. If you are interested, please drop me an email (mdundek@gmail.com).

## Please note

As mentioned above, this is a work in progress and is by no means ready for production at this point. The foundation is there, but it is lacking security features and code stabilization.  
Also, there is no Web UI at the moment to manage MultiPaaS, everything is done with the MultiPaaS (mp) command line interface. A WebUI will come later once the CLI is stable and complete.

## Documentation TOC

* [Installation](documentation/INSTALL.md#installation)
  * [MultiPaaS Mode]()
    * [Some notes about DHCP](documentation/INSTALL.md#some-notes-about-dhcp)
    * [Prepare the environement before the installation](documentation/INSTALL.md#prepare-the-environement-before-the-installation)
      * [A script to prepare for deployment](documentation/INSTALL.md#a-script-to-prepare-for-deployment)
    * [Install the Control-Plane environement](documentation/INSTALL.md#install-the-control-plane-environement)
    * [Install the Host-Node services](documentation/INSTALL.md#install-the-host-node-services)
  * [UniPaaS Mode]()
    * [Internet access vs no internet access]()
    * [Prepare the environement before the installation (only if target has no internet access)]()
    * [Install the Control-Plane environement](documentation/INSTALL.md#install-the-control-plane-environement)
    * [Install the Host-Node services](documentation/INSTALL.md#install-the-host-node-services)
  * [Install the CLI](documentation/INSTALL.md#install-the-cli)
* [Getting Started](documentation/GETTING-STARTED.md)
  * [Prerequisite](https://github.com/mdundek/multipaas/blob/master/documentation/GETTING-STARTED.md#prerequisite)
  * [Register an account and scale my first cluster (MultiPaaS mode only)](https://github.com/mdundek/multipaas/blob/master/documentation/GETTING-STARTED.md#register-an-account-set-up--scale-my-first-cluster)
  * [Deploying services and applications](https://github.com/mdundek/multipaas/blob/master/documentation/GETTING-STARTED.md#deploying-services--applications)
  * [Canary & blue / green deployments, domains & SSL](https://github.com/mdundek/multipaas/blob/master/documentation/GETTING-STARTED.md#canary-deployments-blue--green-deployment-domain-names--ssl)
