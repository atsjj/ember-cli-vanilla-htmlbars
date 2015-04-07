var htmlbarsCompile = require('./index');

module.exports = {
  name: 'ember-cli-htmlbars',

  isDevelopingAddon: function() {
    return true;
  },

  setupPreprocessorRegistry: function(type, registry) {
    var self = this;

    // ensure that broccoli-ember-hbs-template-compiler is not processing hbs files
    registry.remove('template', 'broccoli-ember-hbs-template-compiler');

    registry.add('template', {
      name: 'ember-cli-htmlbars',
      ext: 'hbs',
      toTree: function(tree) {
        return htmlbarsCompile(tree, self.htmlbarsOptions());
      }
    })

    if (type === 'parent') {
      this.parentRegistry = registry;
    }
  },

  htmlbarsOptions: function() {
    var htmlbarsOptions = {
      templateCompiler: {
        dom: require('simple-dom').Document,
        domHelper: require('./lib/dom-helper'),
        precompile: require('./lib/htmlbars').compileSpec
      }
    };

    return htmlbarsOptions;
  }
};
