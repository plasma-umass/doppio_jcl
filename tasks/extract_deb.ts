/// <reference path="../typings/tsd.d.ts" />
import fs = require('fs');
import zlib = require('zlib');
import path = require('path');
import async = require('async');
import _ncp = require('ncp');
import tar = require('tar');
var ar = require('ar'),
  xz = require('xz'),
  // Maps symlink paths to the link's destination.
  foundSymlinks: { [path: string]: string } = {},
  ncp = _ncp.ncp;

function extractDeb(grunt: IGrunt) {
  grunt.registerMultiTask('extract_deb', 'Extracts the contents of the given Debian package.', function() {
    var files: {src: string[]; dest: string}[] = this.files,
        i: number, tasks: ((err?: any) => void)[] = [],
        done: (status?: boolean) => void = this.async(),
        options = this.options();
    for (i = 0; i < files.length; i++) {
      // Capture file.
      (function(file: {src: string[]; dest: string}) {
        tasks.push(function(cb: (err?: any) => void): void {
          extractData(grunt, file, options.dest_dir, cb);
        });
      })(files[i]);
    }

    async.series(tasks, function(err: any, results: any[]) {
      if (err) {
        grunt.fail.fatal("Error extracting Debian package: " + err);
      }

      // Check the symlinks.
      var symlinkTasks = Object.keys(foundSymlinks).map((linkPath: string) => {
        return (cb: (err?: any) => void) => {
          checkSymlink(linkPath, foundSymlinks[linkPath], cb);
        };
      });
      async.series(symlinkTasks, function (err: any, results: any[]) {
        done();
      });
    });

    /**
     * Ensures that the symbolic link exists. If not, it copies dest_path into
     * link_path.
     */
    function checkSymlink(linkPath: string, destPath: string, cb: (err?: any) => void): void {
      if (!fs.existsSync(linkPath)) {
        ncp(destPath, linkPath, (err2?: any): void => {
          if (err2) {
            grunt.log.writeln('Warning: broken symlink.\n\tLink: ' + linkPath + '\n\tDest: ' + destPath);
            // Delete the broken symlink.
            fs.unlinkSync(linkPath);
          }
          cb();
        });
      } else {
        setImmediate(cb);
      }
    }
  });
}

/**
 * Finds data.tar.gz in the given debian package, and extracts it. Calls the
 * callback with an optional error message when finished.
 */
function extractData(grunt: IGrunt, archiveFile: {src: string[]; dest: string}, destDir: string, cb: (err?: any) => void): void {
  var archive = new ar.Archive(fs.readFileSync(archiveFile.src[0]));
  var files = archive.getFiles();
  var found = false;
  var tarFile = archiveFile.src[0] + ".tar";
  var stream: fs.ReadStream;
  function entryCb(entry: { path: string; props: { linkpath?: string; } }): void {
    if (entry.props.linkpath) {
      var entryPath = path.resolve(destDir, entry.path),
        linkPath = entry.props.linkpath;
      if (linkPath[0] === '/') {
        // Absolute paths will be symlinked relative to the extraction directory.
        linkPath = path.resolve(destDir) + linkPath;
      } else {
        // Relative paths are relative to the symlink's parent directory.
        linkPath = path.resolve(path.dirname(entryPath), linkPath);
      }
      foundSymlinks[entryPath] = linkPath;
    }
  }
  function streamFinishCb(err: any): void {
    // Close the stream before passing the callback.
    if (stream['close']) {
      stream.close();
    }
    cb(err);
  }
  function extractTarFileFromBuffer(data: Buffer): void {
    // Write the tar file to disc so we can create a read stream for it.
    // There's no built-in way to create a stream from a buffer in Node.
    fs.writeFileSync(tarFile, data);
    // Extract the tar file.
    stream = fs.createReadStream(tarFile);
    extractTarFile();
  }
  function extractTarFile() {
    stream.pipe(tar.Extract({ path: destDir })).on("entry", entryCb).on("error", streamFinishCb).on("end", streamFinishCb);
  }

  if (fs.existsSync(tarFile)) {
    grunt.log.writeln('Ignoring file ' + path.basename(archiveFile.src[0]) + ' (already extracted).');
    return cb();
  }
  grunt.log.writeln('Processing file ' + path.basename(archiveFile.src[0]) + '...');

  // Iterate through the files to find data.tar.(gz|xz).
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (file.name() === 'data.tar.gz') {
      // Decompress the file: Gunzip
      zlib.gunzip(file.fileData(), function (err: Error, buff: Buffer) {
        if (err) {
          cb(err);
        } else {
          extractTarFileFromBuffer(buff);
        }
      });
      // Break the loop; we have found what we needed.
      found = true;
      break;
    } else if (file.name() === 'data.tar.xz') {
      stream = new xz.Decompressor();
      (<NodeJS.WritableStream><any> stream).end(file.fileData());
      extractTarFile();
      found = true;
      break;
    }
  }

  if (!found) {
    cb(new Error("Could not find data.tar.gz in " + archiveFile.src[0] + "."));
  }
}

export = extractDeb;
