'use strict';

var gulp = require('gulp'),
  $ = require('gulp-load-plugins')({
    camelize: true,
    pattern: ['gulp-*', 'imagemin-pngcrush', 'rimraf', 'events', 'map-stream', 'path', 'wiredep', 'conflate']
  });
$.mainBowerFiles = require('main-bower-files');
require('gulp-help')(gulp);
var yaml = require('js-yaml');
var args = require('yargs').argv;

var AUTOPREFIXER_BROWSERS = [
  'ie >= 10',
  'ie_mob >= 10',
  'ff >= 30',
  'chrome >= 34',
  'safari >= 7',
  'opera >= 23',
  'ios >= 7',
  'android >= 4.4',
  'bb >= 10'
];

var config = {
  address: {
    assets: {
      dev: 'http://localhost:8001/',
      prod: 'http://assets.clickbus.com.br/'
    }
  },
  source: {
    fonts: 'app/assets/fonts/*',
    html: 'app/**/*.html',
    images: 'app/assets/images/**/*.{png,jpg,jpeg}',
    js: 'app/system/**/*.js',
    sass: 'app/assets/sass/**/*.sass',
    docs: 'docs/**/*.md'
  },
  build: {
    js: {
      path: 'build/assets/js',
      name: 'app.js'
    },
    css: {
      path: 'build/assets/css'
    },
    images: {
      path: 'build/assets/images'
    },
    fonts: {
      path: 'build/assets/fonts'
    },
    html: {
      path: 'build'
    }
  },
  tests: {
    unit: {
      source: 'tests/unit/**/*.js',
      config: 'tests/karma.config.js'
    }
  }
};

var mode = args.mode || 'dev';
var domain = args.domain || 'clickbus.com.br';
var serveDocs = args.docs || false;

var help = {
  clear: 'Remove the /build folder',
  vagrant: 'Download Vagrantfile and run',
  buildBower: 'Concat bower main files & copty to /build/assets/[type]',
  buildStyles: 'Compile SASS to CSS, minify, GZIP, add vendor prefixes, copy to /build/assets/css/',
  buildScripts: 'Concat app JS, uglify, add sourcemap, GZIP, jslint, copy to /build/assets/js/',
  scriptsLint: 'JS lint app scripts',
  buildHtml: 'Inject stylesheets, minify, copy to /build/',
  buildImages: 'Optimize images, copy to /build/assets/images/',
  buildFonts: 'Copy all fonts to /build/assets/fonts/ (flatten)',
  build: 'Runs buildBower, buildFonts, buildImages, buildStyles, buildScripts, buildHtml',
  unitTests: 'Runs tests defined in /tests/unit/ using karma',
  watch: 'Watch for changes in JS, SASS, fonts, im.jsonages & HTML, and runs build',
  server: 'Start local server, run build & wacth task',
  install: 'Install dependencies listed in bower.json & package',
  deploy: 'Deploy to testing server',
  buildDocs: 'MD to html, up server docs at http://localhost:8002'
}

// Report lint erros on notify
var emmitLint = new $.events.EventEmitter();
var jsHintErrorReporter = $.mapStream(function(file, cb) {
  if (!file.jshint.success) {
    file.jshint.results.forEach(function(err) {
      if (err) {
        var msg = [
          $.path.basename(file.path),
          'Line  : ' + err.error.line,
          'Reason: ' + err.error.reason
        ];
        emmitLint.emit('error', new Error(msg.join('\n')));
      }
    });
  }
  cb(null, file);
});

// Clear public
gulp.task('clear', help.clear, function(cb) {
  $.rimraf('build', cb);
});

gulp.task('vagrant', help.vagrant, $.shell.task([
  'echo Downloading vagrant file',
  'curl -L https://raw.githubusercontent.com/rocketbus/clickbus-vagrant/master/spaweb/Vagrantfile > Vagrantfile',
  'vagrant up'
]));

gulp.task('buildBower', help.buildBower, function() {
  var filterJs = $.filter('*.js')
  var filterCss = $.filter('*.css')
  gulp.src($.mainBowerFiles())
    .pipe(filterJs)
    .pipe($.concat('vendor.js'))
    // .pipe($.uglify())
    // .pipe($.uglify().on('error', function(e) { console.log('\x07',e.message); return this.end(); }))
    .pipe(gulp.dest("build/assets/js"))
    .pipe($.gzip())
    .pipe(gulp.dest("build/assets/js"))
    .pipe($.size())
    .pipe(filterJs.restore())
    .pipe($.filter('*.css'))
    .pipe($.concat('vendor.css'))
    .pipe($.minifyCss({
      keepBreaks: true
    }))
    .pipe(gulp.dest("build/assets/css"))
    .pipe($.gzip())
    .pipe(gulp.dest("build/assets/css"))
    .pipe($.size());
});

var onError = function(err) {
  $.util.beep([0, 0, 0]);
  $.util.log($.util.colors.green(err));
  this.emit('end');
};

gulp.task('buildStyles', help.buildStyles, function() {
  return gulp.src(config.source.sass)
    .pipe($.changed(config.build.css.path))
    .pipe($.plumber({
      errorHandler: onError
    }))
    .pipe($.rubySass({
      sourcemapPath: '../app/assets/sass',
      style: 'expanded',
      precision: 10
      // require: ['susy', 'breakpoint']
    }))
    .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe($.combineMediaQueries({log:true}))
    .pipe($.minifyCss({
      keepBreaks: true
    }))
    .pipe(gulp.dest(config.build.css.path))
    .pipe($.gzip())
    .pipe(gulp.dest(config.build.css.path))
    .pipe($.size({
      title: 'css'
    }));
});

gulp.task('buildScripts', help.buildScripts, [], function() {
  var params = getParams(domain).merged;
  var configLocale = 'app/vendor/bower_components/angular-i18n/angular-locale_' + params.head.language + '.js';
  return gulp.src([config.source.js, configLocale])
    .pipe($.changed(config.build.js.path))
    .pipe($.sourcemaps.init())
    .pipe($.concat(config.build.js.name))
    .pipe($.replace(/var paramsInject = {};/g, 'paramsInject = ' + JSON.stringify(params) ))
    .pipe($.uglify({
      mangle: false
    }))
    .pipe($.sourcemaps.write('.'))
    .pipe(gulp.dest(config.build.js.path))
    .pipe($.gzip())
    .pipe(gulp.dest(config.build.js.path))
    .pipe($.size());
});

gulp.task('scriptsLint', help.scriptsLint, function() {
  gulp.src(config.source.js)
    .pipe(cache('scriptsLint'))
    // .pipe($.watch())
    .pipe($.plumber())
    .pipe($.jshint('.jshintrc', {
      fail: false
    }))
    .pipe($.jshint.reporter('jshint-stylish'))
    .pipe(jsHintErrorReporter)
    .on('error', $.notify.onError(function(error) {
      return error.message;
    }))
});

gulp.task('buildDocs', help.buildDocs, [], function() {
  gulp.src(config.source.docs)
    .pipe($.markdown())
    .pipe(gulp.dest('build/docs'));
});

function getParams(domain){
  var fs = require('fs');
  var configDomainDefault = yaml.safeLoad(fs.readFileSync('config/domain-default.yaml', 'utf8')).cbApp;
  var configDomain = yaml.safeLoad(fs.readFileSync('config/domains/' + domain + '.yaml', 'utf8')).cbApp;
  var mergedConfigs = $.conflate(configDomainDefault,configDomain);
  return {
    base: configDomainDefault,
    domain: configDomain,
    merged: mergedConfigs
  }
}

gulp.task('buildHtml', help.buildHtml, [], function() {
  var mergedConfigs = getParams(domain).merged
  var target = gulp.src('./app/index.html');
  var sources = gulp.src(['./build/assets/css/**/*.css']);
  var views = gulp.src(['./app/system/views/**/*.html']);
  gulp.src(config.source.html)
    .pipe($.changed(config.build.html.path))
    .pipe($.filter(['*', '!vendor', '!_*.html']))
    .pipe($.template(mergedConfigs))
    .pipe($.inject(sources))
    .pipe($.replace(/\/build/g, ''))
    .pipe($.replace(/\/assets\//g, config.address.assets[mode]))
    .pipe($.inject(gulp.src(['./app/system/views/**/*.html']), {
      starttag: '<!-- inject:angular:{{ext}} -->',
      transform: function(filePath, file) {
        return '<script type="text/ng-template" id="' + filePath.split('_')[1] + '">' + file.contents.toString('utf8') + '</script>';
      }
    }))
    .pipe($.fileInclude({
      prefix: '@@',
      basepath: './app/partials'
    }))
    .pipe($.minifyHtml({
      empty: true,
      spare: true,
      quotes: true
    }))
    .pipe(gulp.dest('build/' + domain))
    .pipe($.size({
      title: 'Build ' + domain
    }));
});

gulp.task('buildDomains', help.buildHtml, [], function() {
  var fs = require('fs');
  var configDomainDefault = yaml.safeLoad(fs.readFileSync('config/domain-default.yaml', 'utf8'));
  gulp.src('./config/domains/*.yaml')
    .pipe($.tap(function(file) {
      var domainFolder = file.relative.split('.yaml')[0]
      var json = yaml.load(String(file.contents.toString('utf8'))),
        configDomain = json.cbApp;
      // var mergedConfigs = $.conflate(configDomainDefault.cbApp, json.cbApp);
      var mergedConfigs = configDomain;
      var target = gulp.src('./app/index.html');
      var sources = gulp.src(['./build/assets/css/**/*.css']);
      var views = gulp.src(['./app/system/views/**/*.html']);
    }));
});

gulp.task('buildImagesSVG', help.buildImages, function() {
  return gulp.src('./app/assets/images/**/*.svg')
    .pipe($.newer('./app/assets/images/**/*.svg'))
    .pipe(gulp.dest(config.build.images.path))
});

gulp.task('buildImages', help.buildImages, function() {
  return gulp.src(config.source.images)
    // .pipe($.filter('**/*.{png,jpg,jpeg}'))
    .pipe($.newer(config.source.images))
    .pipe($.changed(config.build.images.path))
    .pipe($.imagemin({
      optimizationLevel: 3,
      progressive: true,
      interlaced: true,
      use: [$.imageminPngcrush()]
    }))
    .pipe(gulp.dest(config.build.images.path))
    .pipe($.size());
});

gulp.task('buildFonts', help.buildFonts, function() {
  return gulp.src(config.source.fonts)
    .pipe($.newer(config.source.fonts))
    .pipe($.changed(config.build.fonts.path))
    .pipe($.filter('**/*.{eot,svg,ttf,woff}'))
    .pipe($.flatten())
    .pipe(gulp.dest(config.build.fonts.path))
    .pipe($.size());
});

// Build All
gulp.task('build', help.build, ['buildBower', 'buildFonts', 'buildImages', 'buildImagesSVG', 'buildStyles', 'buildScripts', 'buildHtml']);

// Unit Tests
gulp.task('unitTests', help.unitTests, function() {
  var bowerDependencies = $.wiredep({
    directory: 'app/vendor/bower_components',
    exclude: [],
    dependencies: true,
    devDependencies: true
  });
  var testFiles = bowerDependencies.js.concat([
    config.source.js,
    config.tests.unit.source
  ]);
  return gulp.src(testFiles)
    .pipe($.karma({
      configFile: config.tests.unit.config,
      action: 'run' // watch
    }))
    .on('error', function(err) {
      throw err;
    });
});

// Watch changes
gulp.task('watch', help.watch, ['build'], function() {
  gulp.watch(config.source.fonts, ['buildFonts']);
  gulp.watch(config.source.sass, ['buildStyles']);
  gulp.watch(config.source.images, ['buildImages']);
  gulp.watch(config.source.js, ['buildScripts']);
  gulp.watch(config.source.html, ['buildHtml']);
  if( serveDocs ){
    gulp.watch(config.source.docs, ['buildDocs']);
  }
});

// Server
gulp.task('server', help.server, ['watch'], function() {
  gulp.src('build/assets/')
    .pipe($.notify("Assets server up!"))
    .pipe($.webserver({
      host: 'localhost',
      port: 8001,
      livereload: true,
      directoryListing: true,
      open: false
    }));

  gulp.src('build/' + domain + '/')
    .pipe($.notify("Domain Server up!"))
    .pipe($.webserver({
      host: 'localhost',
      port: 8000,
      livereload: true,
      directoryListing: false,
      open: true
    }));

    if( serveDocs ){
      gulp.src('build/docs/')
        .pipe($.notify("Domain Docs up!"))
        .pipe($.webserver({
          host: 'localhost',
          port: 8911,
          livereload: false,
          directoryListing: true,
          open: true
        }));
    }
});

// Install
gulp.task('install', help.install, [], function() {
  gulp.src(['./bower.json', './package.json'])
    .pipe($.install());
});

// Deploy test
gulp.task('deploy', help.deploy, [], function() {
  // https://www.npmjs.org/package/gulp-s3
});
