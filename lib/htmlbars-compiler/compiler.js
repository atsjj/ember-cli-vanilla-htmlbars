"use strict";
/*jshint evil:true*/
var preprocess = require("../htmlbars-syntax/parser").preprocess;
var TemplateCompiler = require("./template-compiler")["default"];
var wrap = require("../htmlbars-runtime/hooks").wrap;
var render = require("../htmlbars-runtime/render")["default"];

/*
 * Compile a string into a template spec string. The template spec is a string
 * representation of a template. Usually, you would use compileSpec for
 * pre-compilation of a template on the server.
 *
 * Example usage:
 *
 *     var templateSpec = compileSpec("Howdy {{name}}");
 *     // This next step is basically what plain compile does
 *     var template = new Function("return " + templateSpec)();
 *
 * @method compileSpec
 * @param {String} string An HTMLBars template string
 * @return {TemplateSpec} A template spec string
 */
function compileSpec(string, options) {
  var ast = preprocess(string, options);
  var compiler = new TemplateCompiler(options);
  var program = compiler.compile(ast);
  return program;
}

exports.compileSpec = compileSpec;/*
 * @method template
 * @param {TemplateSpec} templateSpec A precompiled template
 * @return {Template} A template spec string
 */
function template(templateSpec) {
  return new Function("return " + templateSpec)();
}

exports.template = template;/*
 * Compile a string into a template rendering function
 *
 * Example usage:
 *
 *     // Template is the hydration portion of the compiled template
 *     var template = compile("Howdy {{name}}");
 *
 *     // Template accepts three arguments:
 *     //
 *     //   1. A context object
 *     //   2. An env object
 *     //   3. A contextualElement (optional, document.body is the default)
 *     //
 *     // The env object *must* have at least these two properties:
 *     //
 *     //   1. `hooks` - Basic hooks for rendering a template
 *     //   2. `dom` - An instance of DOMHelper
 *     //
 *     import {hooks} from 'htmlbars-runtime';
 *     import {DOMHelper} from 'morph';
 *     var context = {name: 'whatever'},
 *         env = {hooks: hooks, dom: new DOMHelper()},
 *         contextualElement = document.body;
 *     var domFragment = template(context, env, contextualElement);
 *
 * @method compile
 * @param {String} string An HTMLBars template string
 * @param {Object} options A set of options to provide to the compiler
 * @return {Template} A function for rendering the template
 */
function compile(string, options) {
  return wrap(template(compileSpec(string, options)), render);
}

exports.compile = compile;