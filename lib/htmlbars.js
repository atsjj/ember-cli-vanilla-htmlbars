"use strict";
/*
 * @overview  HTMLBars
 * @copyright Copyright 2011-2014 Tilde Inc. and contributors
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/tildeio/htmlbars/master/LICENSE
 * @version   v0.12.0
 */

var compile = require("./htmlbars-compiler/compiler").compile;
var compileSpec = require("./htmlbars-compiler/compiler").compileSpec;
var Walker = require("./htmlbars-syntax/walker")["default"];

exports.compile = compile;
exports.compileSpec = compileSpec;
exports.Walker = Walker;