/// <reference path="bower_components/DefinitelyTyped/node/node.d.ts" />
/// <reference path="bower_components/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/**
 * Contains all of doppio's grunt build tasks in TypeScript.
 */
import path = require('path');
import fs = require('fs');
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
    make_build_dir: {
      options: { build_dir: "<%= build.java_home_dir %>" },
      // It's a multi-task, so you need a default target.
      default: {}
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
          src: "<%= resolve(build.scratch_dir, '**/+(rt|tools|resources|rhino|jsse).jar') %>"
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
    }
  });

  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-curl');
  // Load our custom tasks.
  grunt.loadTasks('tasks');

  grunt.registerTask('default', "Sets up doppio's environment prior to building.", function() {
    var needJCL: boolean, needECJ: boolean, needJazzLib: boolean,
      needJavaHome: boolean, tasks: string[] = [];
    needJCL = !fs.existsSync('java_home/classes/java/lang/Object.class');
    needECJ = !fs.existsSync('java_home/classes/org/eclipse/jdt/internal/compiler/batch/Main.class');
    needJazzLib = !fs.existsSync('java_home/classes/java/util/zip/DeflaterEngine.class');
    // Check for java_home *AND* time zone data.
    needJavaHome = !(fs.existsSync('java_home/lib/zi/ZoneInfoMappings'));
    if (needJCL || needECJ || needJazzLib || needJavaHome) {
      // Create download folder. It shouldn't exist, as it is randomly generated.
      fs.mkdirSync(grunt.config('build.scratch_dir'));
      // Schedule download task.
      tasks.push('curl-dir');
    }
    if (needJCL || needJavaHome) {
      tasks.push('extract_deb');
    }
    if (needJCL) {
      tasks.push('unzip:jcl');
    }
    if (needECJ) {
      tasks.push('unzip:ecj');
    }
    if (needJazzLib) {
      tasks.push('unzip:jazzlib');
      tasks.push('copy:jazzlib');
    }
    if (needJavaHome) {
      tasks.push('copy:java_home');
    }
    grunt.task.run(tasks);
  });

  grunt.registerTask('clean', 'Deletes built files.', function () {
    grunt.file.delete('java_home');
  });
};
