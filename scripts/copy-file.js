#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console */
const fs = require('fs');
const path = require('path');

const [, , src, dst] = process.argv;

if (!src || !dst) {
	console.error('Usage: copy-file <src> <dst>');
	console.error('  src: source file path (can be relative or absolute)');
	console.error('  dst: destination file path (can be relative or absolute)');
	process.exit(1);
}

const srcPath = path.resolve(src);
const dstPath = path.resolve(dst);

// Verify source exists, warn if not
if (!fs.existsSync(srcPath)) {
	console.warn(`Warning: source file does not exist: ${srcPath}`);
	console.warn(`         file not copied. Make sure the source is available.`);
	process.exit(0);
}

// Ensure destination directory exists
fs.mkdirSync(path.dirname(dstPath), {recursive: true});

// Copy file
fs.copyFileSync(srcPath, dstPath);

console.log(`Copied file: ${srcPath} -> ${dstPath}`);