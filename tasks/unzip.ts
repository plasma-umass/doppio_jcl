/// <reference path="../bower_components/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../bower_components/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/// <reference path="../adm-zip.d.ts" />
import path = require('path');
import AdmZip = require('adm-zip');

/**
 * A task that unzips one or more zip files to a given location.
 * Overwrites files by default.
 */
function unzip(grunt: IGrunt) {
	grunt.registerMultiTask('unzip', 'Unzips files from src to dest.', function(): void {
    var files: {src: string[]; dest: string}[] = this.files;
    var destDir = this.options().dest_dir;
    for (var i = 0; i < files.length; i++) {
      try {
        unzipFile(grunt, files[i], destDir);
      } catch (e) {
        grunt.fail.fatal("Unable to extract " + files[i].src[0] + ": " + e);
      }
    }
  });
}

/**
 * Unzips the file at file_path to dest_dir.
 */
function unzipFile(grunt: IGrunt, file: {src: string[]; dest: string}, destDir: string): void {
  grunt.log.writeln("Extracting " + path.basename(file.src[0]) + " to " + destDir + "...");
  var zip = new AdmZip(file.src[0]);
  zip.extractAllTo(destDir, /*overwrite*/true);
}

export = unzip;
