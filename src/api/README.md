# mycloud-api

> 

## About

This project uses [Feathers](http://feathersjs.com). An open source web framework for building modern real-time applications.

## Getting Started

Getting up and running is as easy as 1, 2, 3.

1. Make sure you have [NodeJS](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed.
2. Install your dependencies

    ```
    cd path/to/mycloud-api
    npm install
    ```

3. Start your app

    ```
    npm start
    ```

## Testing

Simply run `npm test` and all your tests in the `test/` directory will be run.

## Scaffolding

Feathers has a powerful command line interface. Here are a few things it can do:

```
$ npm install -g @feathersjs/cli          # Install Feathers CLI

$ feathers generate service               # Generate a new Service
$ feathers generate hook                  # Generate a new Hook
$ feathers help                           # Show all commands
```

## Help

For more information on all the things you can do with Feathers visit [docs.feathersjs.com](http://docs.feathersjs.com).


curl 'http://localhost:3030/accounts/' -H 'Content-Type: application/json' --data-binary '{ "name": "airbus", "email": "mdundek@gmail.com", "password": "airbus" }'
curl 'http://localhost:3030/accounts/' -H 'Content-Type: application/json' --data-binary '{ "name": "mtarget", "email": "bdundek@gmail.com", "password": "airbus" }'



context => {
      const sequelize = context.app.get('sequelizeClient');
      context.params.transaction = sequelize.transaction();
    }

    context => {
      return context.params.transaction.then(t => {
        return t.commit();
      });
    }

    context => {
      return context.params.transaction.then(t => {
        return t.rollback();
      });
    }