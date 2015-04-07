var Filter = require('broccoli-filter');

function TemplateCompiler(inputTree, options) {
  if (!(this instanceof TemplateCompiler)) {
    return new TemplateCompiler(inputTree, options);
  }

  Filter.call(this, inputTree, options); // this._super()

  this.options = options || {};
  this.inputTree = inputTree;

  this.dom = new this.options.templateCompiler.dom();
  this.domHelper = new this.options.templateCompiler.domHelper['default'](this.dom);
  this.precompile = this.options.templateCompiler.precompile;
}

TemplateCompiler.prototype = Object.create(Filter.prototype);
TemplateCompiler.prototype.constructor = TemplateCompiler;
TemplateCompiler.prototype.extensions = ['hbs', 'handlebars'];
TemplateCompiler.prototype.targetExtension = 'js';

TemplateCompiler.prototype.processString = function (string, relativePath) {
  var output = this.precompile(string, { contextualElement: this.dom, dom: this.domHelper });
  return 'export default function() { return ' + output + '; }';
}

module.exports = TemplateCompiler;
