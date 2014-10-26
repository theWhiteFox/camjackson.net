var gulp = require('gulp');
var mocha = require('gulp-mocha');
var spawn = require('child_process').spawn;
var exec = require('child-process-promise').exec;
var Q = require('q');
var confirm = require('./lib/helpers').confirm;

gulp.task('seed', seed);
gulp.task('test', test);
gulp.task('test:unit', testUnit);
gulp.task('test:integration', testIntegration);

gulp.task('docker:build', dockerBuild);
gulp.task('docker:install', ['docker:build'], dockerInstall);
gulp.task('docker:run', ['docker:build'], dockerRun);
gulp.task('docker:test', dockerTest);

function test() {
  return testUnit().then(function() {
    return testIntegration();
  });
}

function testUnit() {
  return Q.Promise(function(resolve, reject) {
    var stream = gulp.src(['spec/unit/**/*.js'], {read: false})
      .pipe(mocha({
        reporter: 'dot'
      }));
    stream.on('end', function() {
      resolve();
    });
    stream.on('error', function(err) {
      reject(err);
    })
  });
}

function testIntegration() {
  var mongoProcess = spawn('mongod');

  return Q.Promise(function(resolve, reject) {
    var stream = gulp.src(['spec/integration/**/*.js'], {read: false})
      .pipe(mocha({
        reporter: 'dot'
      }));
    stream.on('end', function () {
      mongoProcess.kill();
      resolve();
    });
    stream.on('error', function(err) {
      mongoProcess.kill();
      reject(err);
    });
  });
}

function seed() {
  var mongoose = require('mongoose');
  var models = require('./lib/models');
  var Config = models.Config;
  var Post = models.Post;
  var db_host = process.env.DB_HOST ? process.env.DB_HOST : 'localhost';
  var connection;

  var prompt = '\n\n***WARNING: THIS OPERATION WILL DESTROY DATA!***\nAre you sure you want to seed the database at ' + db_host + '/writeitdown?';
  return confirm(prompt).then(function() {
    connection = mongoose.connect('mongodb://'+ db_host +'/writeitdown');
    return Config.remove({}).exec();
  }, function() {
    console.log('Aborting database seed.');
  }).then(function() {
    return Config.create({
      title: 'Site Title',
      heading: 'Site Heading',
      domain: 'example.com' //TODO
    });
  }).then(function() {
    return Post.remove({}).exec();
  }).then(function() {
    mongoose.disconnect();
  });
}

//TODO: REVIEW EVERYTHING BELOW THIS

var dockerHost = '192.168.59.103';
var dockerEnv = 'DOCKER_HOST=tcp://' + dockerHost + ':2375 ';

function dockerBuild() {
  return exec('boot2docker start').then(function(result) {
    printExecResult(result);
    return exec(dockerEnv + 'docker build -t camjackson/writeitdown .');
  }).then(function(result) {
    printExecResult(result);
  });
}

function dockerInstall() {
  return exec(dockerEnv + 'docker stop camjackson/writeitdown || :').then(function() {
    return exec(dockerEnv + 'docker rm camjackson/writeitdown || :');
  }).then(function() {
    return dockerMongo();
  }).then(function() {
    return exec(dockerEnv + 'docker run -d -p 8080:8080 --link mongo:database --name writeitdown camjackson/writeitdown gulp install')
  });
}

function dockerRun() {
  return exec(dockerEnv + 'docker stop camjackson/writeitdown || :').then(function() {
    return exec(dockerEnv + 'docker rm camjackson/writeitdown || :');
  }).then(function() {
    return dockerMongo();
  }).then(function() {
    return exec(dockerEnv + 'docker run -d -p 8080:8080 --link mongo:database --name writeitdown camjackson/writeitdown')
  });
}

function dockerTest() {
  return dockerBuildTest().then(function() {
    return dockerTestUnit()
  }).then(function() {
    return dockerMongo();
  }).then(function() {
    return dockerTestIntegration();
  });
}

function dockerMongo() {
  return exec(dockerEnv + 'docker stop mongo || :').then(function() {
    return exec(dockerEnv + 'docker rm mongo || :');
  }).then(function() {
    return exec(dockerEnv + 'docker run -d --name mongo mongo')
  }).then(function(result) {
    printExecResult(result);
  });
}

function dockerBuildTest() {
  return exec('boot2docker start').then(function(result) {
    printExecResult(result);
    return exec(dockerEnv + 'docker build -t writeitdown-test .');
  }).then(function(result) {
    printExecResult(result);
  });
}

var mochaBaseCommand = 'node ./node_modules/mocha/bin/mocha --reporter dot --recursive';

function dockerTestUnit() {
  var mochaCommand = mochaBaseCommand + ' spec/unit';
  var dockerCommand = dockerEnv + 'docker run --rm writeitdown-test ' + mochaCommand;
  return exec(dockerCommand).then(function(result) {
    printExecResult(result);
  });
}

function dockerTestIntegration() {
  var mochaCommand = mochaBaseCommand + ' spec/integration';
  var dockerCommand = dockerEnv + 'docker run --rm --link mongo:database writeitdown-test ' + mochaCommand;
  return exec(dockerCommand).then(function(result) {
    printExecResult(result);
  });
}

function printExecResult(result, ignoreErr) {
  console.log(result.stdout);
  if (!ignoreErr) {
    console.log(result.stderr);
  }
}
