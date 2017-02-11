'use strict';

var Generator = require('yeoman-generator');
var chalk = require('chalk');
var Spinner = require('cli-spinner').Spinner;
var execFile = require('child_process').execFile;
var execFileSync = require('child_process').execFileSync;
var fs = require('extfs');

module.exports = Generator.extend({
  initializing: function () {
    var done = this.async();

    // Make sure current directory is empty
    fs.isEmpty(this.destinationRoot(), empty => {
      if (!empty) {
        this.env.error('Make sure current directory is empty before running generator');
      }
      done();
    });
  },
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
      name: 'dbName',
      message: 'Database name?',
      default: `mg_${this.appname}`
    }, {
      type: 'list',
      name: 'server',
      message: 'Source server?',
      choices: [
        'ML Demo',
        'ML Demo 2'
      ]
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
      var done = this.async();
      var localXml = this.destinationPath('app/etc/local.xml');
      var spinner = new Spinner('Generating local.xml file...');

      spinner.setSpinnerString(18);
      spinner.start();

      if (fs.existsSync(localXml)) {
        fs.removeSync(localXml);
      }

      execFile(
        'n98-magerun',
        [
          'local-config:generate',
          this.props.dbHost,
          'root',
          'root',
          this.props.dbName,
          'files',
          'admin'
        ],
        error => {
          if (error) {
            this.log.error(error);
          }

          var server = this.props.server === 'ML Demo' ? 'mldemo' : 'mldemo2';
          var prefix = this.props.server === 'ML Demo' ? '' : '/httpdocs';

          execFile(
            'ssh',
            [
              server,
              `cat ~${prefix}/projects/${this.props.repo}/app/etc/local.xml`
            ],
            (error, stdout) => {
              if (error) {
                this.log.error(error);
              }

              // Get table prefix if exists
              var xml = stdout;
              var match = xml.match(/<table_prefix>(.+?)<\/table_prefix>/);
              var tablePrefix = match[1] ? match[1] : '<![CDATA[]]>';

              // Get generated local.xml file
              var data = fs.readFileSync(localXml, 'utf8');

              // Replace table_prefix node and overwrite local.xml file
              var newXml = data.replace(
                '<table_prefix></table_prefix>',
                `<table_prefix>${tablePrefix}</table_prefix>`
              );

              fs.writeFileSync(localXml, newXml, 'utf8');

              spinner.stop(true);
              this.log.ok('Generating local.xml file...');

              done();
            }
          );
        }
      );
    },
    downloadMedia() {
      var done = this.async();

      var server = this.props.server === 'ML Demo' ? 'mldemo' : 'mldemo2';
      var prefix = this.props.server === 'ML Demo' ? '' : '/httpdocs';

      var response = execFileSync(
        'ssh',
        [
          server,
          `du -hs ~${prefix}/projects/${this.props.repo}/media | cut -f1`
        ]
      );

      var mediaSize = response.toString().trim();
      var spinner = new Spinner(`Downloading media folder (${mediaSize})...`);

      spinner.setSpinnerString(18);
      spinner.start();

      execFile(
        'rsync',
        [
          '-az',
          '--ignore-existing',
          '--exclude=*cache*',
          `${server}:~${prefix}/projects/${this.props.repo}/media/`,
          `${this.destinationRoot()}/media`
        ],
        error => {
          if (error) {
            this.log.error(error);
          }

          spinner.stop(true);
          this.log.ok(`Downloading media folder (${mediaSize})...`);

          done();
        }
      );
    },
    importDatabase() {
      var done = this.async();
      var spinner = new Spinner('Creating and importing database...');
      var mysql = require('mysql');

      spinner.setSpinnerString(18);
      spinner.start();

      var connection = mysql.createConnection({
        host: this.props.dbHost,
        user: 'root',
        password: 'root'
      });

      connection.query(`CREATE DATABASE IF NOT EXISTS ${this.props.dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, err => {
        if (err) {
          this.log.error(err);
        }

        execFile(
          'magedbm',
          [
            'get',
            this.props.repo,
            '-f'
          ],
          (error, stdout) => {
            spinner.stop(true);

            if (error) {
              this.log.error(error);
            }

            if (stdout.includes('Finished')) {
              this.log.ok('Creating and importing database...');

              spinner = new Spinner('Updating base URLs...');

              spinner.setSpinnerString(18);
              spinner.start();

              execFile(
                'n98-magerun',
                [
                  'sys:store:config:base-url:set',
                  '-b',
                  `http://${this.props.repo}.medialounge.dev/`
                ],
                error => {
                  spinner.stop(true);

                  if (error) {
                    this.log.error('Could not update base URLs, please update manually...');
                  } else {
                    this.log.ok('Updating base URLs...');
                  }

                  done();
                }
              );
            } else {
              this.log.error('Database created but no import file found, please import manually...');
            }

            done();
          }
        );
      });
    },
    updateHosts() {
      var done = this.async();
      var hostile = require('hostile');
      var spinner = new Spinner('Updating hosts file...');

      spinner.setSpinnerString(18);
      spinner.start();

      hostile.set(this.props.dbHost, `${this.props.repo}.medialounge.dev`, err => {
        if (err) {
          this.log.error(err);
        }

        spinner.stop(true);
        this.log.ok('Updating hosts file...');

        done();
      });
    }
  }
});
