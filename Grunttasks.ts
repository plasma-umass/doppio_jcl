/// <reference path="typings/tsd.d.ts" />
import path = require('path');
import os = require('os');
import url = require('url');
var DEBS_DOMAIN: string = "http://security.ubuntu.com/ubuntu/pool/universe/o/openjdk-8/",
    DEBS: string[] = [
        "openjdk-8-jdk_8u72-b05-1ubuntu1_i386.deb",
        "openjdk-8-jre-headless_8u72-b05-1ubuntu1_i386.deb",
        "openjdk-8-jre_8u72-b05-1ubuntu1_i386.deb"
    ],
    TZDATA_DEB: string = "http://security.ubuntu.com/ubuntu/pool/main/t/tzdata/tzdata-java_2015g-0ubuntu0.15.04_all.deb",
    DOWNLOAD_URLS: string[] = [];

// Prepare DOWNLOAD_URLS prior to Grunt configuration.
DEBS.forEach(function(e: string) {
  DOWNLOAD_URLS.push(DEBS_DOMAIN + e);
});
DOWNLOAD_URLS.push(TZDATA_DEB);

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
      scratch_dir: path.resolve(os.tmpdir(), "jdk-download" + Math.floor(Math.random() * 100000)),
      java: '',
      javac: '',
      javap: ''
    },
    // Downloads files.
    'curl-dir': {
      long: {
        src: DOWNLOAD_URLS,
        dest: "<%= build.scratch_dir %>"
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
      java_home: {
        files: [{
          expand: true,
          flatten: false,
          cwd: "<%= resolve(build.scratch_dir, 'usr', 'lib', 'jvm', 'java-8-openjdk-i386', 'jre') %>",
          src: "**/*",
          dest: "<%= build.java_home_dir %>"
        }, {
          // JDK JAR files
          expand: true,
          flatten: false,
          cwd: "<%= resolve(build.scratch_dir, 'usr', 'lib', 'jvm', 'java-8-openjdk-i386') %>",
          src: "lib/**/*.jar",
          dest: "<%= build.java_home_dir %>"
        }]
      },
      doppio_classes: {
        files: [{
          expand: true,
          flatten: false,
          cwd: "doppio_classes",
          src: "**/*.class",
          dest: "<%= build.jcl_dir %>"
        }]
      },
    },
    clean: {
      java_home: {
        // Remove native files.
        src: ['java_home/bin', 'java_home/man', 'java_home/lib/i386']
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
      },
      doppio: {
        options: {
          archive: 'java_home/lib/doppio.jar',
          mode: 'zip',
          level: 0
        },
        files: [
          { expand: true, cwd: 'doppio_classes/', src: '**/*.class', dest: ''}
        ]
      }
    },
    javac: {
      doppio_classes: {
        files: [{
          expand: true,
          src: 'doppio_classes/**/*.java'
        }]
      }
    },
    tsd: {
      doppio: {
        options: {
          command: "reinstall",
          config: "tsd.json"
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-compress');
  grunt.loadNpmTasks('grunt-curl');
  grunt.loadNpmTasks('grunt-tsd');
  // Load our custom tasks.
  grunt.loadTasks('tasks');

  grunt.registerTask('make_dirs', 'Creates needed directories.', () => {
    grunt.file.mkdir(grunt.config('build.scratch_dir'));
    grunt.file.mkdir(grunt.config('build.java_home_dir'));
  });

  grunt.registerTask('default', ['tsd', 'make_dirs', 'find_native_java', 'javac:doppio_classes', 'curl-dir', 'extract_deb',
    'copy:java_home', 'compress:doppio', 'clean:java_home', 'compress:java_home', 'clean:project']);
};
