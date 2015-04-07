"use strict";
var MorphList = require("./morph-list")["default"];

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory();
  } else {
    root.MorphList = factory();
  }
}(this, function () {
  return MorphList;
}));