/// <reference path="bower_components/DefinitelyTyped/node/node.d.ts" />
/// <reference path="bower_components/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import path = require('path');
import os = require('os');
import url = require('url');
var DEBS_DOMAIN: string = "http://security.ubuntu.com/ubuntu/pool/main/o/openjdk-6/",
    DEBS: string[] = [
        "openjdk-6-jdk_6b33-1.13.5-1ubuntu0.12.04_i386.deb",
        "openjdk-6-jre-headless_6b33-1.13.5-1ubuntu0.12.04_i386.deb",
        "openjdk-6-jre-lib_6b33-1.13.5-1ubuntu0.12.04_all.deb"
    ],
    TZDATA_DEB: string = "http://security.ubuntu.com/ubuntu/pool/main/t/tzdata/tzdata-java_2014e-0ubuntu0.13.10_all.deb",
    ECJ_URL: string = "http://www.eclipse.org/downloads/download.php?file=/eclipse/downloads/drops/R-3.7.1-201109091335/ecj-3.7.1.jar",
    JAZZLIB_URL: string = "http://downloads.sourceforge.net/project/jazzlib/jazzlib/0.07/jazzlib-binary-0.07-juz.zip",
    DOWNLOAD_URLS: string[] = [];

// Prepare DOWNLOAD_URLS prior to Grunt configuration.
DEBS.forEach(function(e: string) {
  DOWNLOAD_URLS.push(DEBS_DOMAIN + e);
});
DOWNLOAD_URLS.push(TZDATA_DEB);
DOWNLOAD_URLS.push(ECJ_URL);
DOWNLOAD_URLS.push(JAZZLIB_URL);

export function setup(grunt: IGrunt) {
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    // Calls path.resolve with the given arguments. If any argument is a
    // template, it is recursively processed until it no longer contains
    // templates.
    // Why do we need this? See:
    // http://stackoverflow.com/questions/21121239/grunt-how-do-recursive-templates-work
    resolve: function (...segs: string[]): string {
      var fixedSegs: string[] = [];
      segs.forEach(function (seg: string) {
        while (seg.indexOf('<%=') !== -1) {
          seg = <any> grunt.config.process(seg);
        }
        fixedSegs.push(seg);
      });
      return path.resolve.apply(path, fixedSegs);
    },
    // doppio build configuration
    build: {
      git_dir: __dirname, // Root directory for doppio (same as this file)
      java_home_dir: '<%= resolve(build.git_dir, "java_home") %>',
      jcl_dir: '<%= resolve(build.java_home_dir, "classes") %>',
      scratch_dir: path.resolve(os.tmpDir(), "jdk-download" + Math.floor(Math.random() * 100000))
    },
    // Downloads files.
    'curl-dir': {
      long: {
        src: DOWNLOAD_URLS,
        dest: "<%= build.scratch_dir %>"
      }
    },
    // Unzips files.
    unzip: {
      options: {
        dest_dir: '<%= build.jcl_dir %>'
      },
      jcl: {
        files: [{
          expand: true,
          src: "<%= resolve(build.scratch_dir, '**/java-6-openjdk-i386/**/+(rt|tools|resources|rhino|jsse).jar') %>"
        }]
      },
      ecj: {
        // We can't get the pathname from the URL, since it has an argument
        // in it that contains the actual filename.
        files: [{ expand: true, src: "<%= resolve(build.scratch_dir, 'ecj*.jar') %>" }]
      },
      jazzlib: {
        options: {
          dest_dir: "<%= resolve(build.scratch_dir, 'jazzlib') %>"
        },
        files: [{ src: "<%= resolve(build.scratch_dir, '" + path.basename(url.parse(JAZZLIB_URL).pathname) + "') %>" }]
      }
    },
    extract_deb: {
      default: {
        options: {
          dest_dir: "<%= build.scratch_dir %>"
        },
        files: [{
          expand: true,
          cwd: "<%= build.scratch_dir %>",
          src: "*.deb"
        }]
      }
    },
    copy: {
      jazzlib: {
        // Patches Jazzlib.
        files: [{
          expand: true,
          flatten: true,
          src: "<%= resolve(build.scratch_dir, 'jazzlib/java/util/zip/*.class') %>",
          dest: "<%= resolve(build.jcl_dir, 'java/util/zip') %>"
        }]
      },
      java_home: {
        files: [{
          expand: true,
          flatten: false,
          cwd: "<%= resolve(build.scratch_dir, 'usr', 'lib', 'jvm', 'java-6-openjdk-i386', 'jre') %>",
          src: "**/*",
          dest: "<%= build.java_home_dir %>"
        }]
      }
    },
    tslint: {
      options: {
        configuration: grunt.file.readJSON("tslint.json")
      },
      files: {
        src: ['Grunttasks.ts', 'tasks/*.ts']
      }
    },
    clean: {
      java_home: {
        // Remove unneeded JAR files that we have already extracted.
        src: ['java_home/**/+(rt|tools|resources|rhino|jsse).jar']
      },
      project: {
        src: ['java_home']
      }
    },
    compress: {
      java_home: {
        options: {
          archive: 'java_home.tar.gz'
        },
        files: [
          { src: ['java_home/**'], dest: '' }
        ]
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-compress');
  grunt.loadNpmTasks('grunt-curl');
  grunt.loadNpmTasks('grunt-tslint');
  // Load our custom tasks.
  grunt.loadTasks('tasks');

  grunt.registerTask('make_dirs', 'Creates needed directories.', function () {
    grunt.file.mkdir(grunt.config('build.scratch_dir'));
    grunt.file.mkdir(grunt.config('build.java_home_dir'));
  });

  grunt.registerTask('default', ['make_dirs', 'curl-dir', 'extract_deb',
    'unzip:jcl', 'unzip:ecj', 'unzip:jazzlib', 'copy:jazzlib', 'copy:java_home',
    'clean:java_home', 'compress:java_home', 'clean:project']);

  grunt.registerTask('lint', ['tslint']);
};
