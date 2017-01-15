'use strict';

var Generator = require('yeoman-generator');
var chalk = require('chalk');
var Spinner = require('cli-spinner').Spinner;
var execFile = require('child_process').execFile;
var fs = require('fs-extra');

module.exports = Generator.extend({
  prompting: function () {
    var ml = [
      '',
      chalk.red('     .\'\'-`'),
      chalk.red('    ...\'\'\'.'),
      chalk.red('   .`  `\'\'\'-     `......``'),
      chalk.red('  .`    .\'\'\'\'..\'\'\'\'\'\'\'.`..\'.`'),
      chalk.red(' ..      `\'\'\'\'\'\'\'\'\'.`       `..`'),
      chalk.red('`.         `.....`              ``'),
      ''
    ].join('\n');

    this.log(ml);

    var prompts = [{
      type: 'input',
      name: 'repo',
      message: `Project name? https://bitbucket.org/medialounge_repo/${chalk.red('name')}`,
      default: this.appname
    }, {
      type: 'input',
      name: 'dbHost',
      message: 'Database host?',
      default: '192.168.56.101'
    }, {
      type: 'input',
      name: 'dbUsername',
      message: 'Database username?',
      default: 'root'
    }, {
      type: 'password',
      name: 'dbPassword',
      message: 'Database password?',
      default: 'root'
    }, {
      type: 'input',
      name: 'dbName',
      message: 'Database name?',
      default: `mg_${this.appname}`
    }];

    return this.prompt(prompts).then(props => {
      this.props = props;
    });
  },

  writing: {
    cloneRepo() {
      var done = this.async();
      var spinner = new Spinner('Cloning git repo...');

      spinner.setSpinnerString(18);
      spinner.start();

      // Make sure current directory is empty
      fs.emptyDirSync(this.destinationRoot());

      execFile(
        'git',
        [
          'clone',
          `git@bitbucket.org:medialounge_repo/${this.props.repo}.git`,
          this.destinationRoot()
        ],
        error => {
          if (error) {
            this.log.error(error);
          }

          spinner.stop(true);
          this.log.ok('Cloning git repo...');

          done();
        }
      );
    },
    createLocalXml() {
      var localXml = this.destinationPath('app/etc/local.xml');
      var spinner = new Spinner('Generating local.xml file...');

      spinner.setSpinnerString(18);
      spinner.start();

      fs.removeSync(localXml);

      execFile(
        'n98-magerun',
        [
          'local-config:generate',
          this.props.dbHost,
          this.props.dbUsername,
          this.props.dbPassword,
          this.props.dbName,
          'files',
          'admin'
        ],
        error => {
          if (error) {
            this.log.error(error);
          }

          spinner.stop(true);
          this.log.ok('Generating local.xml file...');
        }
      );
    }
  }
});
