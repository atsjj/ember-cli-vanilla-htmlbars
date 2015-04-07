"use strict";
var sanitizeAttributeValue = require("./morph-attr/sanitize-attribute-value").sanitizeAttributeValue;
var isAttrRemovalValue = require("./dom-helper/prop").isAttrRemovalValue;
var normalizeProperty = require("./dom-helper/prop").normalizeProperty;
var svgNamespace = require("./dom-helper/build-html-dom").svgNamespace;
var getAttrNamespace = require("./htmlbars-util").getAttrNamespace;

function updateProperty(value) {
  this.domHelper.setPropertyStrict(this.element, this.attrName, value);
}

function updateAttribute(value) {
  if (isAttrRemovalValue(value)) {
    this.domHelper.removeAttribute(this.element, this.attrName);
  } else {
    this.domHelper.setAttribute(this.element, this.attrName, value);
  }
}

function updateAttributeNS(value) {
  if (isAttrRemovalValue(value)) {
    this.domHelper.removeAttribute(this.element, this.attrName);
  } else {
    this.domHelper.setAttributeNS(this.element, this.namespace, this.attrName, value);
  }
}

function AttrMorph(element, attrName, domHelper, namespace) {
  this.element = element;
  this.domHelper = domHelper;
  this.namespace = namespace !== undefined ? namespace : getAttrNamespace(attrName);
  this.state = {};
  this.isDirty = false;
  this.escaped = true;
  this.lastValue = null;
  this.linkedParams = null;
  this.rendered = false;

  var normalizedAttrName = normalizeProperty(this.element, attrName);
  if (this.namespace) {
    this._update = updateAttributeNS;
    this.attrName = attrName;
  } else {
    if (element.namespaceURI === svgNamespace || attrName === 'style' || !normalizedAttrName) {
      this.attrName = attrName;
      this._update = updateAttribute;
    } else {
      this.attrName = normalizedAttrName;
      this._update = updateProperty;
    }
  }
}

AttrMorph.prototype.setContent = function (value) {
  if (this.escaped) {
    var sanitized = sanitizeAttributeValue(this.domHelper, this.element, this.attrName, value);
    this._update(sanitized, this.namespace);
  } else {
    this._update(value, this.namespace);
  }
};

exports["default"] = AttrMorph;

exports.sanitizeAttributeValue = sanitizeAttributeValue;