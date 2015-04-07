"use strict";
var render = require("./render")["default"];
var MorphList = require("../morph-range/morph-list")["default"];
var createChildMorph = require("./render").createChildMorph;
var createObject = require("../htmlbars-util/object-utils").createObject;
var keyLength = require("../htmlbars-util/object-utils").keyLength;
var shallowCopy = require("../htmlbars-util/object-utils").shallowCopy;
var merge = require("../htmlbars-util/object-utils").merge;
var validateChildMorphs = require("../htmlbars-util/morph-utils").validateChildMorphs;
var clearMorph = require("../htmlbars-util/template-utils").clearMorph;
var renderAndCleanup = require("../htmlbars-util/template-utils").renderAndCleanup;

/**
  HTMLBars delegates the runtime behavior of a template to
  hooks provided by the host environment. These hooks explain
  the lexical environment of a Handlebars template, the internal
  representation of references, and the interaction between an
  HTMLBars template and the DOM it is managing.

  While HTMLBars host hooks have access to all of this internal
  machinery, templates and helpers have access to the abstraction
  provided by the host hooks.

  ## The Lexical Environment

  The default lexical environment of an HTMLBars template includes:

  * Any local variables, provided by *block arguments*
  * The current value of `self`

  ## Simple Nesting

  Let's look at a simple template with a nested block:

  ```hbs
  <h1>{{title}}</h1>

  {{#if author}}
    <p class="byline">{{author}}</p>
  {{/if}}
  ```

  In this case, the lexical environment at the top-level of the
  template does not change inside of the `if` block. This is
  achieved via an implementation of `if` that looks like this:

  ```js
  registerHelper('if', function(params) {
    if (!!params[0]) {
      return this.yield();
    }
  });
  ```

  A call to `this.yield` invokes the child template using the
  current lexical environment.

  ## Block Arguments

  It is possible for nested blocks to introduce new local
  variables:

  ```hbs
  {{#count-calls as |i|}}
  <h1>{{title}}</h1>
  <p>Called {{i}} times</p>
  {{/count}}
  ```

  In this example, the child block inherits its surrounding
  lexical environment, but augments it with a single new
  variable binding.

  The implementation of `count-calls` supplies the value of
  `i`, but does not otherwise alter the environment:

  ```js
  var count = 0;
  registerHelper('count-calls', function() {
    return this.yield([ ++count ]);
  });
  ```
*/

function wrap(template) {
  if (template === null) { return null;  }

  return {
    isHTMLBars: true,
    arity: template.arity,
    revision: template.revision,
    raw: template,
    render: function(self, env, options, blockArguments) {
      var scope = env.hooks.createFreshScope();

      options = options || {};
      options.self = self;
      options.blockArguments = blockArguments;

      return render(template, env, scope, options);
    }
  };
}

exports.wrap = wrap;function wrapForHelper(template, env, scope, morph, renderState, visitor) {
  if (template === null) {
    return {
      yieldIn: yieldInShadowTemplate(null, env, scope, morph, renderState, visitor)
    };
  }

  var yieldArgs = yieldTemplate(template, env, scope, morph, renderState, visitor);

  return {
    arity: template.arity,
    revision: template.revision,
    yield: yieldArgs,
    yieldItem: yieldItem(template, env, scope, morph, renderState, visitor),
    yieldIn: yieldInShadowTemplate(template, env, scope, morph, renderState, visitor),

    render: function(self, blockArguments) {
      yieldArgs(blockArguments, self);
    }
  };
}

exports.wrapForHelper = wrapForHelper;function yieldTemplate(template, env, parentScope, morph, renderState, visitor) {
  return function(blockArguments, self) {
    renderState.clearMorph = null;

    if (morph.morphList) {
      renderState.morphList = morph.morphList.firstChildMorph;
      renderState.morphList = null;
    }

    var scope = parentScope;

    if (morph.lastYielded && isStableTemplate(template, morph.lastYielded)) {
      return morph.lastResult.revalidateWith(env, undefined, self, blockArguments, visitor);
    }

    // Check to make sure that we actually **need** a new scope, and can't
    // share the parent scope. Note that we need to move this check into
    // a host hook, because the host's notion of scope may require a new
    // scope in more cases than the ones we can determine statically.
    if (self !== undefined || parentScope === null || template.arity) {
      scope = env.hooks.createChildScope(parentScope);
    }

    morph.lastYielded = { self: self, template: template, shadowTemplate: null };

    // Render the template that was selected by the helper
    render(template, env, scope, { renderNode: morph, self: self, blockArguments: blockArguments });
  };
}

function yieldItem(template, env, parentScope, morph, renderState, visitor) {
  var currentMorph = null;
  var morphList = morph.morphList;
  if (morphList) {
    currentMorph = morphList.firstChildMorph;
    renderState.morphListStart = currentMorph;
  }

  return function(key, blockArguments, self) {
    if (typeof key !== 'string') {
      throw new Error("You must provide a string key when calling `yieldItem`; you provided " + key);
    }

    var morphList, morphMap;

    if (!morph.morphList) {
      morph.morphList = new MorphList();
      morph.morphMap = {};
      morph.setMorphList(morph.morphList);
    }

    morphList = morph.morphList;
    morphMap = morph.morphMap;

    if (currentMorph && currentMorph.key === key) {
      yieldTemplate(template, env, parentScope, currentMorph, renderState, visitor)(blockArguments, self);
      currentMorph = currentMorph.nextMorph;
    } else if (currentMorph && morphMap[key] !== undefined) {
      var foundMorph = morphMap[key];
      yieldTemplate(template, env, parentScope, foundMorph, renderState, visitor)(blockArguments, self);
      morphList.insertBeforeMorph(foundMorph, currentMorph);
    } else {
      var childMorph = createChildMorph(env.dom, morph);
      childMorph.key = key;
      morphMap[key] = childMorph;
      morphList.insertBeforeMorph(childMorph, currentMorph);
      yieldTemplate(template, env, parentScope, childMorph, renderState, visitor)(blockArguments, self);
    }

    renderState.morphListStart = currentMorph;
    renderState.clearMorph = morph.childNodes;
    morph.childNodes = null;
  };
}

function isStableTemplate(template, lastYielded) {
  return !lastYielded.shadowTemplate && template === lastYielded.template;
}

function yieldInShadowTemplate(template, env, parentScope, morph, renderState, visitor) {
  var hostYield = hostYieldWithShadowTemplate(template, env, parentScope, morph, renderState, visitor);

  return function(shadowTemplate, self) {
    hostYield(shadowTemplate, env, self, []);
  };
}

function hostYieldWithShadowTemplate(template, env, parentScope, morph, renderState, visitor) {
  return function(shadowTemplate, env, self, blockArguments) {
    renderState.clearMorph = null;

    if (morph.lastYielded && isStableShadowRoot(template, shadowTemplate, morph.lastYielded)) {
      return morph.lastResult.revalidateWith(env, undefined, self, blockArguments, visitor);
    }

    var shadowScope = env.hooks.createFreshScope();
    env.hooks.bindShadowScope(env, parentScope, shadowScope, renderState.shadowOptions);
    env.hooks.bindBlock(env, shadowScope, blockToYield);

    morph.lastYielded = { self: self, template: template, shadowTemplate: shadowTemplate };

    // Render the shadow template with the block available
    render(shadowTemplate.raw, env, shadowScope, { renderNode: morph, self: self, blockArguments: blockArguments });
  };

  function blockToYield(env, blockArguments, renderNode, shadowParent, visitor) {
    if (renderNode.lastResult) {
      renderNode.lastResult.revalidateWith(env, undefined, undefined, blockArguments, visitor);
    } else {
      var scope = parentScope;

      // Since a yielded template shares a `self` with its original context,
      // we only need to create a new scope if the template has block parameters
      if (template.arity) {
        scope = env.hooks.createChildScope(parentScope);
      }

      render(template, env, scope, { renderNode: renderNode, blockArguments: blockArguments });
    }
  }
}

exports.hostYieldWithShadowTemplate = hostYieldWithShadowTemplate;function isStableShadowRoot(template, shadowTemplate, lastYielded) {
  return template === lastYielded.template && shadowTemplate === lastYielded.shadowTemplate;
}

function optionsFor(template, inverse, env, scope, morph, visitor) {
  var renderState = { morphListStart: null, clearMorph: morph, shadowOptions: null };

  return {
    templates: {
      template: wrapForHelper(template, env, scope, morph, renderState, visitor),
      inverse: wrapForHelper(inverse, env, scope, morph, renderState, visitor)
    },
    renderState: renderState
  };
}

function thisFor(options) {
  return {
    arity: options.template.arity,
    yield: options.template.yield,
    yieldItem: options.template.yieldItem,
    yieldIn: options.template.yieldIn
  };
}

/**
  Host Hook: createScope

  @param {Scope?} parentScope
  @return Scope

  Corresponds to entering a new HTMLBars block.

  This hook is invoked when a block is entered with
  a new `self` or additional local variables.

  When invoked for a top-level template, the
  `parentScope` is `null`, and this hook should return
  a fresh Scope.

  When invoked for a child template, the `parentScope`
  is the scope for the parent environment.

  Note that the `Scope` is an opaque value that is
  passed to other host hooks. For example, the `get`
  hook uses the scope to retrieve a value for a given
  scope and variable name.
*/
function createScope(env, parentScope) {
  if (parentScope) {
    return env.hooks.createChildScope(parentScope);
  } else {
    return env.hooks.createFreshScope();
  }
}

exports.createScope = createScope;function createFreshScope() {
  // because `in` checks have unpredictable performance, keep a
  // separate dictionary to track whether a local was bound.
  // See `bindLocal` for more information.
  return { self: null, block: null, locals: {}, localPresent: {} };
}

exports.createFreshScope = createFreshScope;/**
  Host Hook: createShadowScope

  @param {Scope?} parentScope
  @return Scope

  Corresponds to rendering a new template into an existing
  render tree, but with a new top-level lexical scope. This
  template is called the "shadow root".

  If a shadow template invokes `{{yield}}`, it will render
  the block provided to the shadow root in the original
  lexical scope.

  ```hbs
  {{!-- post template --}}
  <p>{{props.title}}</p>
  {{yield}}

  {{!-- blog template --}}
  {{#post title="Hello world"}}
    <p>by {{byline}}</p>
    <article>This is my first post</article>
  {{/post}}

  {{#post title="Goodbye world"}}
    <p>by {{byline}}</p>
    <article>This is my last post</article>
  {{/post}}
  ```

  ```js
  helpers.post = function(params, hash, options) {
    options.template.yieldIn(postTemplate, { props: hash });
  };

  blog.render({ byline: "Yehuda Katz" });
  ```

  Produces:

  ```html
  <p>Hello world</p>
  <p>by Yehuda Katz</p>
  <article>This is my first post</article>

  <p>Goodbye world</p>
  <p>by Yehuda Katz</p>
  <article>This is my last post</article>
  ```

  In short, `yieldIn` creates a new top-level scope for the
  provided template and renders it, making the original block
  available to `{{yield}}` in that template.
*/
function bindShadowScope(env /*, parentScope, shadowScope */) {
  return env.hooks.createFreshScope();
}

exports.bindShadowScope = bindShadowScope;function createChildScope(parent) {
  var scope = createObject(parent);
  scope.locals = createObject(parent.locals);
  return scope;
}

exports.createChildScope = createChildScope;/**
  Host Hook: bindSelf

  @param {Scope} scope
  @param {any} self

  Corresponds to entering a template.

  This hook is invoked when the `self` value for a scope is ready to be bound.

  The host must ensure that child scopes reflect the change to the `self` in
  future calls to the `get` hook.
*/
function bindSelf(env, scope, self) {
  scope.self = self;
}

exports.bindSelf = bindSelf;function updateSelf(env, scope, self) {
  env.hooks.bindSelf(env, scope, self);
}

exports.updateSelf = updateSelf;/**
  Host Hook: bindLocal

  @param {Environment} env
  @param {Scope} scope
  @param {String} name
  @param {any} value

  Corresponds to entering a template with block arguments.

  This hook is invoked when a local variable for a scope has been provided.

  The host must ensure that child scopes reflect the change in future calls
  to the `get` hook.
*/
function bindLocal(env, scope, name, value) {
  scope.localPresent[name] = true;
  scope.locals[name] = value;
}

exports.bindLocal = bindLocal;function updateLocal(env, scope, name, value) {
  env.hooks.bindLocal(env, scope, name, value);
}

exports.updateLocal = updateLocal;/**
  Host Hook: bindBlock

  @param {Environment} env
  @param {Scope} scope
  @param {Function} block

  Corresponds to entering a shadow template that was invoked by a block helper with
  `yieldIn`.

  This hook is invoked with an opaque block that will be passed along to the
  shadow template, and inserted into the shadow template when `{{yield}}` is used.
*/
function bindBlock(env, scope, block) {
  scope.block = block;
}

exports.bindBlock = bindBlock;/**
  Host Hook: block

  @param {RenderNode} renderNode
  @param {Environment} env
  @param {Scope} scope
  @param {String} path
  @param {Array} params
  @param {Object} hash
  @param {Block} block
  @param {Block} elseBlock

  Corresponds to:

  ```hbs
  {{#helper param1 param2 key1=val1 key2=val2}}
    {{!-- child template --}}
  {{/helper}}
  ```

  This host hook is a workhorse of the system. It is invoked
  whenever a block is encountered, and is responsible for
  resolving the helper to call, and then invoke it.

  The helper should be invoked with:

  - `{Array} params`: the parameters passed to the helper
    in the template.
  - `{Object} hash`: an object containing the keys and values passed
    in the hash position in the template.

  The values in `params` and `hash` will already be resolved
  through a previous call to the `get` host hook.

  The helper should be invoked with a `this` value that is
  an object with one field:

  `{Function} yield`: when invoked, this function executes the
  block with the current scope. It takes an optional array of
  block parameters. If block parameters are supplied, HTMLBars
  will invoke the `bindLocal` host hook to bind the supplied
  values to the block arguments provided by the template.

  In general, the default implementation of `block` should work
  for most host environments. It delegates to other host hooks
  where appropriate, and properly invokes the helper with the
  appropriate arguments.
*/
function block(morph, env, scope, path, params, hash, template, inverse, visitor) {
  if (handleRedirect(morph, env, scope, path, params, hash, template, inverse, visitor)) {
    return;
  }

  continueBlock(morph, env, scope, path, params, hash, template, inverse, visitor);
}

exports.block = block;function continueBlock(morph, env, scope, path, params, hash, template, inverse, visitor) {
  hostBlock(morph, env, scope, template, inverse, null, visitor, function(options) {
    var helper = env.hooks.lookupHelper(env, scope, path);
    env.hooks.invokeHelper(morph, env, scope, visitor, params, hash, helper, options.templates, thisFor(options.templates));
  });
}

exports.continueBlock = continueBlock;function hostBlock(morph, env, scope, template, inverse, shadowOptions, visitor, callback) {
  var options = optionsFor(template, inverse, env, scope, morph, visitor);
  renderAndCleanup(morph, env, options, shadowOptions, callback);
}

exports.hostBlock = hostBlock;function handleRedirect(morph, env, scope, path, params, hash, template, inverse, visitor) {
  var redirect = env.hooks.classify(env, scope, path);
  if (redirect) {
    switch(redirect) {
      case 'component': env.hooks.component(morph, env, scope, path, hash, template, visitor); break;
      case 'inline': env.hooks.inline(morph, env, scope, path, params, hash, visitor); break;
      case 'block': env.hooks.block(morph, env, scope, path, params, hash, template, inverse, visitor); break;
      default: throw new Error("Internal HTMLBars redirection to " + redirect + " not supported");
    }
    return true;
  }

  if (handleKeyword(path, morph, env, scope, params, hash, template, inverse, visitor)) {
    return true;
  }

  return false;
}

function handleKeyword(path, morph, env, scope, params, hash, template, inverse, visitor) {
  var keyword = env.hooks.keywords[path];
  if (!keyword) { return false; }

  if (typeof keyword === 'function') {
    return keyword(morph, env, scope, params, hash, template, inverse, visitor);
  }

  if (keyword.willRender) {
    keyword.willRender(morph, env);
  }

  var lastState, newState;
  if (keyword.setupState) {
    lastState = shallowCopy(morph.state);
    newState = morph.state = keyword.setupState(lastState, env, scope, params, hash);
  }

  if (keyword.childEnv) {
    env = merge(keyword.childEnv(morph.state), env);
  }

  var firstTime = !morph.rendered;

  if (keyword.isEmpty) {
    var isEmpty = keyword.isEmpty(morph.state, env, scope, params, hash);

    if (isEmpty) {
      if (!firstTime) { clearMorph(morph, env, false); }
      return true;
    }
  }

  if (firstTime) {
    if (keyword.render) {
      keyword.render(morph, env, scope, params, hash, template, inverse, visitor);
    }
    morph.rendered = true;
    return true;
  }

  var isStable;
  if (keyword.isStable) {
    isStable = keyword.isStable(lastState, newState);
  } else {
    isStable = stableState(lastState, newState);
  }

  if (isStable) {
    if (keyword.rerender) {
      var newEnv = keyword.rerender(morph, env, scope, params, hash, template, inverse, visitor);
      env = newEnv || env;
    }
    validateChildMorphs(env, morph, visitor);
    return true;
  } else {
    clearMorph(morph, env, false);
  }

  // If the node is unstable, re-render from scratch
  if (keyword.render) {
    keyword.render(morph, env, scope, params, hash, template, inverse, visitor);
    morph.rendered = true;
    return true;
  }
}

function stableState(oldState, newState) {
  if (keyLength(oldState) !== keyLength(newState)) { return false; }

  for (var prop in oldState) {
    if (oldState[prop] !== newState[prop]) { return false; }
  }

  return true;
}

function linkRenderNode(/* morph, env, scope, params, hash */) {
  return;
}

exports.linkRenderNode = linkRenderNode;/**
  Host Hook: inline

  @param {RenderNode} renderNode
  @param {Environment} env
  @param {Scope} scope
  @param {String} path
  @param {Array} params
  @param {Hash} hash

  Corresponds to:

  ```hbs
  {{helper param1 param2 key1=val1 key2=val2}}
  ```

  This host hook is similar to the `block` host hook, but it
  invokes helpers that do not supply an attached block.

  Like the `block` hook, the helper should be invoked with:

  - `{Array} params`: the parameters passed to the helper
    in the template.
  - `{Object} hash`: an object containing the keys and values passed
    in the hash position in the template.

  The values in `params` and `hash` will already be resolved
  through a previous call to the `get` host hook.

  In general, the default implementation of `inline` should work
  for most host environments. It delegates to other host hooks
  where appropriate, and properly invokes the helper with the
  appropriate arguments.

  The default implementation of `inline` also makes `partial`
  a keyword. Instead of invoking a helper named `partial`,
  it invokes the `partial` host hook.
*/
function inline(morph, env, scope, path, params, hash, visitor) {
  if (handleRedirect(morph, env, scope, path, params, hash, null, null, visitor)) {
    return;
  }

  var options = optionsFor(null, null, env, scope, morph);

  var helper = env.hooks.lookupHelper(env, scope, path);
  var result = env.hooks.invokeHelper(morph, env, scope, visitor, params, hash, helper, options.templates, thisFor(options.templates));

  if (result && result.value) {
    var value = result.value;
    if (morph.lastValue !== value) {
      morph.setContent(value);
    }
    morph.lastValue = value;
  }
}

exports.inline = inline;function keyword(path, morph, env, scope, params, hash, template, inverse, visitor)  {
  handleKeyword(path, morph, env, scope, params, hash, template, inverse, visitor);
}

exports.keyword = keyword;function invokeHelper(morph, env, scope, visitor, _params, _hash, helper, templates, context) {
  var params = normalizeArray(env, _params);
  var hash = normalizeObject(env, _hash);
  return { value: helper.call(context, params, hash, templates) };
}

exports.invokeHelper = invokeHelper;function normalizeArray(env, array) {
  var out = new Array(array.length);

  for (var i=0, l=array.length; i<l; i++) {
    out[i] = env.hooks.getValue(array[i]);
  }

  return out;
}

function normalizeObject(env, object) {
  var out = {};

  for (var prop in object)  {
    out[prop] = env.hooks.getValue(object[prop]);
  }

  return out;
}

function classify(/* env, scope, path */) {
  return null;
}

exports.classify = classify;var keywords = {
  partial: function(morph, env, scope, params) {
    var value = env.hooks.partial(morph, env, scope, params[0]);
    morph.setContent(value);
    return true;
  },

  yield: function(morph, env, scope, params, hash, template, inverse, visitor) {
    // the current scope is provided purely for the creation of shadow
    // scopes; it should not be provided to user code.
    scope.block(env, params, morph, scope, visitor);
    return true;
  }
};
exports.keywords = keywords;
/**
  Host Hook: partial

  @param {RenderNode} renderNode
  @param {Environment} env
  @param {Scope} scope
  @param {String} path

  Corresponds to:

  ```hbs
  {{partial "location"}}
  ```

  This host hook is invoked by the default implementation of
  the `inline` hook. This makes `partial` a keyword in an
  HTMLBars environment using the default `inline` host hook.

  It is implemented as a host hook so that it can retrieve
  the named partial out of the `Environment`. Helpers, in
  contrast, only have access to the values passed in to them,
  and not to the ambient lexical environment.

  The host hook should invoke the referenced partial with
  the ambient `self`.
*/
function partial(renderNode, env, scope, path) {
  var template = env.partials[path];
  return template.render(scope.self, env, {}).fragment;
}

exports.partial = partial;/**
  Host hook: range

  @param {RenderNode} renderNode
  @param {Environment} env
  @param {Scope} scope
  @param {any} value

  Corresponds to:

  ```hbs
  {{content}}
  {{{unescaped}}}
  ```

  This hook is responsible for updating a render node
  that represents a range of content with a value.
*/
function range(morph, env, scope, path, value, visitor) {
  if (handleRedirect(morph, env, scope, path, [value], {}, null, null, visitor)) {
    return;
  }

  value = env.hooks.getValue(value);

  if (morph.lastValue !== value) {
    morph.setContent(value);
  }

  morph.lastValue = value;
}

exports.range = range;/**
  Host hook: element

  @param {RenderNode} renderNode
  @param {Environment} env
  @param {Scope} scope
  @param {String} path
  @param {Array} params
  @param {Hash} hash

  Corresponds to:

  ```hbs
  <div {{bind-attr foo=bar}}></div>
  ```

  This hook is responsible for invoking a helper that
  modifies an element.

  Its purpose is largely legacy support for awkward
  idioms that became common when using the string-based
  Handlebars engine.

  Most of the uses of the `element` hook are expected
  to be superseded by component syntax and the
  `attribute` hook.
*/
function element(morph, env, scope, path, params, hash, visitor) {
  if (handleRedirect(morph, env, scope, path, params, hash, null, null, visitor)) {
    return;
  }

  var helper = env.hooks.lookupHelper(env, scope, path);
  if (helper) {
    env.hooks.invokeHelper(null, env, scope, null, params, hash, helper, { element: morph.element });
  }
}

exports.element = element;/**
  Host hook: attribute

  @param {RenderNode} renderNode
  @param {Environment} env
  @param {String} name
  @param {any} value

  Corresponds to:

  ```hbs
  <div foo={{bar}}></div>
  ```

  This hook is responsible for updating a render node
  that represents an element's attribute with a value.

  It receives the name of the attribute as well as an
  already-resolved value, and should update the render
  node with the value if appropriate.
*/
function attribute(morph, env, scope, name, value) {
  value = env.hooks.getValue(value);

  if (morph.lastValue !== value) {
    morph.setContent(value);
  }

  morph.lastValue = value;
}

exports.attribute = attribute;function subexpr(env, scope, helperName, params, hash) {
  var helper = env.hooks.lookupHelper(env, scope, helperName);
  var result = env.hooks.invokeHelper(null, env, scope, null, params, hash, helper, {});
  if (result && result.value) { return result.value; }
}

exports.subexpr = subexpr;/**
  Host Hook: get

  @param {Environment} env
  @param {Scope} scope
  @param {String} path

  Corresponds to:

  ```hbs
  {{foo.bar}}
    ^

  {{helper foo.bar key=value}}
           ^           ^
  ```

  This hook is the "leaf" hook of the system. It is used to
  resolve a path relative to the current scope.
*/
function get(env, scope, path) {
  if (path === '') {
    return scope.self;
  }

  var keys = path.split('.');
  var value = env.hooks.getRoot(scope, keys[0])[0];

  for (var i = 1; i < keys.length; i++) {
    if (value) {
      value = env.hooks.getChild(value, keys[i]);
    } else {
      break;
    }
  }

  return value;
}

exports.get = get;function getRoot(scope, key) {
  if (scope.localPresent[key]) {
    return [scope.locals[key]];
  } else if (scope.self) {
    return [scope.self[key]];
  } else {
    return [undefined];
  }
}

exports.getRoot = getRoot;function getChild(value, key) {
  return value[key];
}

exports.getChild = getChild;function getValue(value) {
  return value;
}

exports.getValue = getValue;function component(morph, env, scope, tagName, attrs, template, visitor) {
  if (env.hooks.hasHelper(env, scope, tagName)) {
    return env.hooks.block(morph, env, scope, tagName, [], attrs, template, null, visitor);
  }

  componentFallback(morph, env, scope, tagName, attrs, template);
}

exports.component = component;function concat(env, params) {
  var value = "";
  for (var i = 0, l = params.length; i < l; i++) {
    value += env.hooks.getValue(params[i]);
  }
  return value;
}

exports.concat = concat;function componentFallback(morph, env, scope, tagName, attrs, template) {
  var element = env.dom.createElement(tagName);
  for (var name in attrs) {
    element.setAttribute(name, env.hooks.getValue(attrs[name]));
  }
  var fragment = render(template, env, scope, {}).fragment;
  element.appendChild(fragment);
  morph.setNode(element);
}

function hasHelper(env, scope, helperName) {
  return env.helpers[helperName] !== undefined;
}

exports.hasHelper = hasHelper;function lookupHelper(env, scope, helperName) {
  return env.helpers[helperName];
}

exports.lookupHelper = lookupHelper;function bindScope(/* env, scope */) {
  // this function is used to handle host-specified extensions to scope
  // other than `self`, `locals` and `block`.
}

exports.bindScope = bindScope;function updateScope(env, scope) {
  env.hooks.bindScope(env, scope);
}

exports.updateScope = updateScope;exports["default"] = {
  // fundamental hooks that you will likely want to override
  bindLocal: bindLocal,
  bindSelf: bindSelf,
  bindScope: bindScope,
  classify: classify,
  component: component,
  concat: concat,
  createFreshScope: createFreshScope,
  getChild: getChild,
  getRoot: getRoot,
  getValue: getValue,
  keywords: keywords,
  linkRenderNode: linkRenderNode,
  partial: partial,
  subexpr: subexpr,

  // fundamental hooks with good default behavior
  bindBlock: bindBlock,
  bindShadowScope: bindShadowScope,
  updateLocal: updateLocal,
  updateSelf: updateSelf,
  updateScope: updateScope,
  createChildScope: createChildScope,
  hasHelper: hasHelper,
  lookupHelper: lookupHelper,
  invokeHelper: invokeHelper,
  cleanupRenderNode: null,
  destroyRenderNode: null,
  willCleanupTree: null,
  didCleanupTree: null,

  // derived hooks
  attribute: attribute,
  block: block,
  createScope: createScope,
  element: element,
  get: get,
  inline: inline,
  range: range,
  keyword: keyword
};