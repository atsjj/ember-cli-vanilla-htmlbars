"use strict";
var compile = require("../htmlbars-compiler/compiler").compile;
var defaultHooks = require("../htmlbars-runtime/hooks")["default"];
var merge = require("../htmlbars-util/object-utils").merge;
var DOMHelper = require("../dom-helper")["default"];
var equalTokens = require("../htmlbars-test-helpers").equalTokens;

var hooks, helpers, partials, env;

function registerHelper(name, callback) {
  helpers[name] = callback;
}

function commonSetup() {
  hooks = merge({}, defaultHooks);
  hooks.keywords = merge({}, defaultHooks.keywords);
  helpers = {};
  partials = {};

  env = {
    dom: new DOMHelper(),
    hooks: hooks,
    helpers: helpers,
    partials: partials,
    useFragmentCache: true
  };
}

QUnit.module("HTML-based compiler (dirtying)", {
  beforeEach: commonSetup
});

test("the invokeHelper hook gets invoked to call helpers", function() {
  hooks.getRoot = function(scope, key) {
    return [{ value: scope.self[key] }];
  };

  var invoked = false;
  hooks.invokeHelper = function(morph, env, scope, visitor, params, hash, helper, templates, context) {
    invoked = true;

    deepEqual(params, [{ value: "hello world" }]);
    ok(templates.template.yieldIn, "templates are passed");
    ok(scope.self, "the scope was passed");
    ok(morph.state, "the morph was passed");

    return { value: helper.call(context, [params[0].value], hash, templates) };
  };

  registerHelper('print', function(params) {
    return params.join('');
  });

  var object = { val: 'hello world' };
  var template = compile('<div>{{print val}}</div>');
  var result = template.render(object, env);

  equalTokens(result.fragment, '<div>hello world</div>');

  ok(invoked, "The invokeHelper hook was invoked");
});