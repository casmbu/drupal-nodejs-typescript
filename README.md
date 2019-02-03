# Node.js Integration for Drupal Modified for Typescript

Server app for the Node.js Integration Drupal module.
https://www.drupal.org/project/nodejs

## Prerequisites

* [Node.js](https://nodejs.org) version 8+
* [pm2](https://github.com/Unitech/pm2) (optional)

## Installation

Use the following method to download the app:

* Download the
  [latest release](https://github.com/casmbu/drupal-nodejs-typescript/releases) from
  GitHub. Unzip, and run `npm install` in the app's directory to install the
  dependencies.

* Git clone this repository. Go to the root directory of the repo and run
  `npm install` followed by `npm run build` (without the example extension) or
  `npm run build_all` (with the example extension). The dist folder will contain
  the production ready files. Copy the contents of the dist folder to your
  server and then run `npm install` inside that directory.

In both cases, be sure the install the app outside of Drupal's root directory
structure. No files in the running node server need to be served to the client
via Drupal, the node server will handle serving socket.io. You may need to
modify your .htaccess (or equivalent configuration) file to proxy traffic to
your node server. I personally run the node server on a completely separate
machine from the Drupal site. You can see this
[DigitalOcean](https://www.digitalocean.com/community/tutorials/how-to-use-pm2-to-setup-a-node-js-production-environment-on-an-ubuntu-vps)
documentation for a general idea of how to do this.

## Configuration

Copy the example configuration file (`nodejs.config.js.example`) to
`nodejs.config.js`. Edit that file and make any necessary configuration changes.
See [nodejs.config.js.example](https://github.com/casmbu/drupal-nodejs-typescript/blob/master/nodejs.config.js.example)
for details on the configuration values. As a minimum, you will need to set the
`serviceKey`, and specify the location of your Drupal site in the `backend`
property. The service key can be any arbitrary string, but be sure to enter the
same service key in Drupal.

## Running the server app

Start the app using the `npm start`.

```
npm start
```

This will run the app in the foreground. For production use, it is more
practical to run the app in the background. One way to achieve this is starting
the app with [pm2](https://github.com/Unitech/pm2).

```
pm2 start app.js
```

Not only will pm2 start the app in the background, but it will monitor it and
automatically restart it if the app quits. See the
[pm2](https://github.com/Unitech/pm2) documentation for more information.

Visit the status report on your Drupal site to verify if Drupal is able to
communicate with the server app.
