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

          this.mainFolder = '';
          this.basePath = this.destinationPath();

          this.server = this.props.server === 'ML Demo' ? 'mldemo' : 'mldemo2';
          this.prefix = this.props.server === 'ML Demo' ? '' : '/httpdocs';

          // Update base path if main folder exists
          if (fs.existsSync(this.destinationPath('main'))) {
            this.mainFolder = 'main/';
            this.basePath = this.destinationPath('main');
          }

          spinner.stop(true);
          this.log.ok('Cloning git repo...');

          done();
        }
      );
    },
    createLocalXml() {
      var done = this.async();
      var localXml = `${this.basePath}/app/etc/local.xml`;
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
        {
          cwd: this.basePath
        },
        error => {
          if (error) {
            this.log.error(error);
          }

          execFile(
            'ssh',
            [
              this.server,
              `cat ~${this.prefix}/projects/${this.props.repo}/${this.mainFolder}app/etc/local.xml`
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

      // Get media folder size from server
      var response = execFileSync(
        'ssh',
        [
          this.server,
          `du -hs ~${this.prefix}/projects/${this.props.repo}/${this.mainFolder}media | cut -f1`
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
          `${this.server}:~${this.prefix}/projects/${this.props.repo}/${this.mainFolder}media/`,
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
    updateHosts() {
      var done = this.async();
      var hostile = require('hostile');
      var spinner = new Spinner('Updating hosts file...');

      var main = this.mainFolder ? 'main' : '';

      spinner.setSpinnerString(18);
      spinner.start();

      hostile.set(this.props.dbHost, `${this.props.repo}.medialounge${main}.dev`, err => {
        if (err) {
          this.log.error(err);
        }

        spinner.stop(true);
        this.log.ok('Updating hosts file...');

        done();
      });
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
          {
            cwd: this.basePath
          },
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

              var main = this.mainFolder ? 'main' : '';

              execFile(
                'n98-magerun',
                [
                  'sys:store:config:base-url:set',
                  '-b',
                  `http://${this.props.repo}.medialounge${main}.dev/`
                ],
                {
                  cwd: this.basePath
                },
                error => {
                  spinner.stop(true);

                  if (error) {
                    this.log.error('Could not update base URLs, please update manually...');
                  } else {
                    this.log.ok('Updating base URLs...');
                  }

                  process.exit(0);
                }
              );
            } else {
              this.log.error('Database created but no import file found, please import manually...');

              process.exit(0);
            }

            done();
          }
        );
      });
    }
  }
});
