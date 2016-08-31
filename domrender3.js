"use strict";
// @repeat on an @if ordering
// ways to wrap loops @wrapper, and @wrapstart/@wrapend
// TODO: potentially pointers so you don't have to reclone a @repeat frag over and over
// gotcha - @attr.class and then @class.smthing
// gotcha - @b and then @on.click
// attribute on anything that goes thru domrender
// you could prob easily add to extras as you want
// TODO: getter and setter with @b!
// TODO: @use and @usevar
// TODO: ability to break out of interpolation (for getting {}
// TODO: consider being able to render a specific element? (maybe a bad idea)
var domrender3 = (function($) {
    $.bind = function(el, scope, options) { // this is the starting point!
        options = options || {}
        var d = $.compile(el, d, $.fakeT)
        d.renderSync = function() {
            var start = Date.now()
            $.render(d, scope)
            if (d.onrender) { d.onrender(d, scope) }
            console.log("domrender3", Date.now() - start)
        }
        if (options.noAsyncRender) {
            d.render = d.renderSync
        } else {
            d.render = function() {
                clearTimeout(d.renderTimeout) // TODO: requestAnimationFrame?
                d.renderTimeout = setTimeout(d.renderSync, 1)
            }
        }
        if (!options.noFirstRender) { d.renderSync() }
        return d
    }
    $._id = 0
    $.uniqueId = function () { return $._id++ },
    $.makeOnFunc = function(child, expr, d, parentT) {
        var extras = parentT.extras.concat("event")
        var exprFn = $.compileExprEvent(expr, extras)
        return function(e) {
            //window.event = e // firefox needs this
            var extra = (child._extra || []).slice()
            extra.push(e)
            $.callExprFn(exprFn, child._scope, extra)
            d.root.render()
        }
    }
    $.compileGeneral = function(cache, args, code) {
        var exprFn = cache[code]
        if (exprFn) return exprFn
        exprFn = new Function(args, code)
        cache[code] = exprFn
        return exprFn
    }
    $.compiledExprs = {}
    $.compileExpr = function(expr, extras) {
        var args = ""
        if (extras && extras.length) { args = extras.join(", ") }
        return $.compileGeneral($.compiledExprs, args, "return " + expr)
    }
    $.compileExprEvent = function(expr, extras) {
        var args = ""
        if (extras && extras.length) { args = extras.join(", ") }
        return $.compileGeneral($.compiledExprs, args, expr)
    }
    $.compiledAssigns = {}
    $.compileAssign = function(expr, extras) {
        // TODO: getters and setters (you could just use js getters and setters, but I'd rather not rely on that feature
        var args = "value"
        if (extras && extras.length) { args = extras.join(", ") + "," + args }
        return $.compileGeneral($.compiledAssigns, args, expr + " = value")
    }
    $.renderWrap = function(type, fn) {
        return function(t, scope, extraData) {
            var newVal = $.callExprFn(t.exprFn, scope, extraData)
            if (t.oldVal === newVal) return;
            fn(t, scope, newVal, extraData)
            t.oldVal = newVal
        }
    }
    $.renderText = $.renderWrap("t", function(t, scope, newVal) {
            t.el.firstChild.nodeValue = newVal /*inner text*/
    })
    $.renderHTML = $.renderWrap("h", function(t, scope, newVal) {
            t.el.innerHTML = newVal /*inner html*/
    })
    $.renderSub = {
        '@style': $.renderWrap("style", function(t, scope, newVal) {
                t.el.style[t.what] = newVal
        }),
        '@class': $.renderWrap("class", function(t, scope, newVal) {
                newVal ? t.el.classList.add(t.what) : t.el.classList.remove(t.what)
        }),
        '@attr': $.renderWrap("attr", function(t, scope, newVal) {
                t.el.setAttribute(t.what, newVal)
        }),
        '@hasattr': $.renderWrap("hasattr", function(t, scope, newVal) {
                newVal ? t.el.setAttribute(t.what, newVal) : t.el.removeAttribute(t.what)
        })
    }
    $.renderInput = $.renderWrap("b", function(t, scope, newVal) { // TODO: other types of inputs
        if (t.el.type == "checkbox") {
            t.el.checked = !!newVal
        } else if (t.el.type == "radio") {
            if (t.el.value == newVal) t.el.checked = true
        } else if (t.el.nodeName == "SELECT") {
            var selectIndex = 0 // using item() instead of options[] because of optgroups
            var selectOption
            while (selectOption = t.el.item(selectIndex)) {
                if (selectOption.value == newVal) {
                    t.el.selectedIndex = selectIndex
                    break
                }
                selectIndex += 1
            }
        } else { // regular input or color
            t.el.value = newVal
        }
    })
    $.renderUse = function(t, scope, extraData) {
        var scope = $.callExprFn(t.scopeExprFn, scope, extraData)
        //for (var i=0; i < t.extraExprFns.length; i++) {
        //    extraData2.push($.callExprFn(t.extraExprFns[i], scope, extraData))
        //}
        //$.render(t.compiled, scope, extraData)
        $.render(t.compiled, scope, (extraData || []).concat(t.extraDataInject))
    }
    $.renderCond = {
        "@if": function(t, scope, extraData, d) {
            t.done = false
            var newVal = $.callExprFn(t.exprFn, scope, extraData)
            newVal ? $.addIfSection(t, d, scope, extraData) : $.removeIfSection(t)
            d.lastIf = t
        },
        "@elseif": function(t, scope, extraData, d) {
            t.done = false
            if ($.checkIfDone(t, d.lastIf)) return;
            $.renderIf(t, scope, extraData, d)
        },
        "@else": function(t, scope, extraData, d) {
            t.done = false
            if ($.checkIfDone(t, d.lastIf)) return;
            $.addIfSection(t, d, scope, extraData)
        },
        "@switch": function(t, scope, extraData, d) {
            var selector = t.switchExprFn ? $.callExprFn(t.switchExprFn, scope, extraData) : true
            t.selector = selector
            d.lastSwitch = t
            $.renderCase(t, scope, extraData, d)
        },
        "@case": function(t, scope, extraData, d) {
            t.done = false
            if ($.checkIfDone(t, d.lastSwitch)) return;
            var selector = d.lastSwitch.selector
            var newVal = $.callExprFn(t.exprFn, scope, extraData)
            newVal == selector ? $.addIfSection(t, d, scope, extraData) : $.removeIfSection(t)
            d.lastSwitch = t
            t.selector = selector
        },
        "@default": function(t, scope, extraData, d) {
            t.done = false
            if ($.checkIfDone(t, d.lastSwitch)) return;
            $.addIfSection(t, d, scope, extraData)
        }
    }
    $.renderIf = $.renderCond["@if"]
    $.renderCase = $.renderCond["@case"]
    $.showPart = function(t) {
        for (var i = 0; i < t.els.length; i++) {
            var el = t.els[i]
            if (el.style) {
                el.style.display = t.display
            } else if (el._oldNodeValue) {
                el.nodeValue = el._oldNodeValue
            }
        }
    }
    $.hidePart = function(t) {
        for (var i = 0; i < t.len; i++) {
            var item = t.els[i]
            if (item.style) {
                item.style.display = "none"
            } else {
                item._oldNodeValue = item.nodeValue
                item.nodeValue = ""
            }
        }
    }
    $.addIfSection = function(t, d, scope, extraData) {
        t.done = true
        if (t.boundThing != t) {
            if (t.stay) {
                $.showPart(t)
            } else {
                t.stopper.parentNode.insertBefore(t.frag, t.stopper)
            }
        }
        $.render(t.compiled, scope, extraData)
        t.boundThing = t
    }
    $.removeIfSection = function(t) { // slurp the elements back up
        t.done = false
        if (t.boundThing != t) return;
        var fragEnd = null
        if (t.stay) {
            $.hidePart(t)
        } else {
            for (var i = 0; i < t.len; i++) {
                var item = t.stopper.previousSibling
                t.frag.insertBefore(item, fragEnd)
                fragEnd = item
            }
        }
        t.boundThing = null
    }
    $.checkIfDone = function(t, lastIf) {
        if (!lastIf) { return true }
        if (lastIf.done) {
            $.removeIfSection(t)
            return true
        }
        return false
    }
    // TODO: consider fn.length to optimize callExprFn
    $.renderUseVar = function(t, scope, extraData, d) {
        var usedScope = $.callExprFn(t.scopeExprFn, scope, extraData)
        var id = $.callExprFn(t.exprFn, scope, extraData)
        if (id != t.lastId) {
            t.lastId = id
            for (var i = 0; i < t.lastLength; i++) {
                t.stopper.previousSibling && t.stopper.parentNode.removeChild(t.stopper.previousSibling)
            }
            t.lastLength = 0
            var el = document.getElementById(id)
            if (!el) return;
            var frag = document.createDocumentFragment()
            var count = 0
            for (var c = el.firstChild; c != null; c = c.nextSibling) {
                frag.appendChild(c.cloneNode(true))
                count += 1
            }
            var compiled = $.compile(frag, d, t) // you could hang on to this
            t.compiled = compiled
            if (usedScope) {
                $.render(compiled, usedScope, (extraData || []).concat(t.extraDataInject))
            }
            t.stopper.parentNode.insertBefore(frag, t.stopper)
            t.lastLength = count
        } else if (t.compiled) {
            if (usedScope) {
                $.render(t.compiled, usedScope, (extraData || []).concat(t.extraDataInject))
            }
        }
    }
    $.renderGeneral = function(t, scope, extraData) {
        // TODO: (caleb) this is where we could mark any element that was used with domrender
        t.el._scope = scope
        if (extraData) { // TODO: you could possibly only do this if there is an @b on it, or an @on or something.
            t.el._extra = extraData
        }
    }
    $.renderInterpolatedFast = function(t, scope, extraData) {
        var newVal = [$.callExprFn(t.exprFn, scope, extraData)].join("") // wrapping in array and joining on "" flushes out the "undefined"'s
        if (t.oldVal == newVal) { return }
        t.el.nodeValue = newVal
        t.oldVal = newVal
    }
    $.callExprFn = function (exprFn, scope, extraData) { // you could inline this?
        return exprFn.apply(scope, extraData)
    },
    $.renderInterpolateder = function (fn) {
        return function(t, scope, extraData) {
            var final = []
            for (var i = 0; i < t.parts.length; i++) {
                var part = t.parts[i]
                part.type == "{" ? final.push(part.expr) : final.push($.callExprFn(part.exprFn, scope, extraData)) 
            }
            var newVal = final.join("")
            if (t.oldVal == newVal) { return }
            fn(t, newVal) //t.el.nodeValue = newVal //t.el.setAttribute(t.attrName, newVal)
            t.oldVal = newVal
        }
    } 
    //$.renderInterpolated = function (t, scope, extraData) {
    //    var final = []
    //    for (var i = 0; i < t.parts.length; i++) {
    //        var part = t.parts[i]
    //        part.type == "{" ? final.push(part.expr) : final.push($.callExprFn(part.exprFn, scope, extraData)) 
    //    }
    //    var newVal = final.join("")
    //    if (t.oldVal == newVal) { return }
    //    t.el.nodeValue = newVal //t.el.setAttribute(t.attrName, newVal)
    //    t.oldVal = newVal
    //} 
    //$.renderInterpolatedAttr = function (t, scope, extraData) {
    //    var final = []
    //    for (var i = 0; i < t.parts.length; i++) {
    //        var part = t.parts[i]
    //        part.type == "{" ? final.push(part.expr) : final.push($.callExprFn(part.exprFn, scope, extraData)) 
    //    }
    //    var newVal = final.join("")
    //    if (t.oldVal == newVal) { return }
    //    t.el.setAttribute(t.attrName, newVal)
    //    t.oldVal = newVal
    //} 
    // Is is worth the space savings?
    $.renderInterpolated = $.renderInterpolateder(function (t, newVal) {
        t.el.nodeValue = newVal 
    })
    $.renderInterpolatedAttr = $.renderInterpolateder(function(t, newVal) {
        t.el.setAttribute(t.attrName, newVal)
    })
    $.renderRepeat = function(t, scope, extraData, parentD) {
        var newVal = $.callExprFn(t.exprFn, scope, extraData)
        if (!newVal) { newVal = [] }
        //if (t.oldVal == newVal) { return } // because we aren't immutable (yet?)
        // TODO: consider pooling the elements and compileds so you can use them again
        // rearrange with keys
        if (t.keyExprFn) {
            if (document.activeElement) {
                activeEl = document.activeElement
            }
            var hasActive = false
            var activeEl
            if (activeEl && activeEl.type == "text") { // TODO: textarea
                var selectStart = activeEl.selectionStart
                var selectEnd = activeEl.selectionEnd
            }
            var newByKey = {}
            t.elss = []
            t.compileds = []
            var newKeys = []

            for (var i = 0; i < newVal.length; i++) {
                var val = newVal[i]
                var newExtraData = (extraData || []).concat(val, i)

                var key = $.callExprFn(t.keyExprFn, scope, extraData)
                newKeys.push(key)
                var oldStuff = t.byKey[key]

                if (oldStuff) {
                    newByKey[key] = oldStuff
                    t.elss[i] = oldStuff.els
                    t.compileds[i] = oldStuff.compiled
                    for (var j = oldStuff.els.length - 1; j >= 0; j--) {
                        if (oldStuff.els[j] == activeEl) {
                            hasActive = true
                        }
                        t.stopper.parentNode.insertBefore(oldStuff.els[j], t.indexStoppers[i])
                    }
                } else {
                    var newFrag = $.makeNewRepeatFrag(t, i, parentD)
                    newByKey[key] = {
                        els: els,
                        compiled: compiled
                    }
                    var indexStopper = t.indexStoppers[i]
                    if (!indexStopper) {
                        var indexStopper = document.createComment("index " + i)
                        t.indexStoppers[i] = indexStopper
                        t.stopper.parentNode.insertBefore(indexStopper, t.stopper)
                    }
                    t.stopper.parentNode.insertBefore(newFrag, indexStopper)
                }
                $.render(t.compileds[i], scope, newExtraData)
            }
            t.keys = newKeys
            t.byKey = newByKey
            t.oldVal = newVal
            t.curLen = newVal.length
            // note you don't necessarily have to do the active el if you move everything around it
            if (hasActive && activeEl) {
                activeEl.focus()
                activeEl.selectionStart = selectStart
                activeEl.selectionEnd = selectEnd
            }
        } else {
            // remove old
            for (var i = t.curLen - 1; i > newVal.length - 1; i--) { // remove the old ones
                // TODO: maybe do other removes like this too. instead of referencing 
                // the stopping point on the removes
                var els = t.elss[i]
                for (j = 0; j < els.length; j++) {
                    var el = els[j]
                    if (el.parentNode) {
                        el.parentNode.removeChild(el)
                    }
                }
                t.compileds[i] = null
            }
            // add new
            for (var i = t.curLen; i < newVal.length; i++) { // add new ones
                var newFrag = $.makeNewRepeatFrag(t, i, parentD)
                t.stopper.parentNode.insertBefore(newFrag, t.stopper)
            }
            // render all
            for (var i = 0; i < newVal.length; i++) { // render the lot
                var val = newVal[i]
                var newExtraData = (extraData || []).concat(val, i)
                $.render(t.compileds[i], scope, newExtraData)
            }
            t.oldVal = newVal
            t.curLen = newVal.length
        }
    }
    $.makeNewRepeatFrag = function (t, i, parentD) {
	// TODO: you could save the path from the els to the frag?, not have to compile it each time?
        var newFrag = t.frag.cloneNode(true)
        var compiled = $.compile(newFrag, parentD, t)
        t.compileds[i] = compiled
        var els = []
        t.elss[i] = els
        var fragChildren = newFrag.childNodes
        for (var j = 0; j < newFrag.childNodes.length; j++) {
            els.push(fragChildren[j])
        }
        return newFrag
    }
    $.render = function(d, scope, extraData) { // parentScope?
        for (var i = 0; i < d.boundThings.length; i++) {
            var boundThing = d.boundThings[i]
            boundThing.render(boundThing, scope, extraData, d)
        }
    }
    $.fakeT = {extras: []} 
    $.compile = function(el, parentD, parentT) {
        var d = {
            boundThings: [],
            root: (parentD && parentD.root),
            lastIf: null,
            lastSwitch: null,
            //parentT? //parentD?
        }
        if (!parentD) { d.root = d }
        $.visit(el, d, parentT)
        return d
    }
    $.compileEls = function(els, parentD, parentT) {
        var d = {
            boundThings: [],
            root: (parentD && parentD.root),
            lastIf: null,
            lastSwitch: null
        }
        if (!parentD) { d.root = d }
        for (var i = 0; i < els.length; i++) {
            $.visit(els[i], d, parentT)
        }
        return d
    }
    $.addBookkeepingBoundThing = function(child, d) {
        d.boundThings.push({
            type: "general",
            render: $.renderGeneral,
            el: child
        })
    }
    $.parseInterpolated = function(str, d, parentT) {
        var parts = [],
            look = "{",
            start = 0
        var lastStart = 0
        while (start < str.length) {
            start = str.indexOf(look, start)
            if (start == -1) { break }
            $.addInterpolatedPart(parts, str, lastStart, start, look, d, parentT)
            look = (look == "}") ? "{" : "}"
            lastStart = start + 1
        }
        $.addInterpolatedPart(parts, str, lastStart, str.length, look, d, parentT)
        return parts
    }
    $.addInterpolatedPart = function(parts, str, start, end, look, d, parentT) {
        var part = str.substring(start, end)
        if (part.length == 0) { return }
        var iPart = {
            type: look,
            expr: part
        }
        if (look != "{") { iPart.exprFn = $.compileExpr(part, parentT.extras) }
        parts.push(iPart)
    }
    // TODO: (side node) with repeat you could be compileing with extras an extra time in the actual expr for the repeat
    $.visit = function(child, d, parentT) {
        var addedGeneral = false
        if (child.nodeType == 3) { // maybe have an overwride class for preventing this
            if (child.nodeValue.indexOf("{") != -1) { // if its interpolation syntax // is there a faster first check 
                var parts = $.parseInterpolated(child.nodeValue, d, parentT)
                if (parts.length) {
                    if (!addedGeneral) { // duplicated
                        $.addBookkeepingBoundThing(child, d)
                        addedGeneral = true
                    }
                    if (parts.length == 1) { // unknown if I need this fast part
                        d.boundThings.push({
                            type: "{}",
                            render: $.renderInterpolatedFast,
                            exprFn: parts[0].exprFn,
                            el: child
                        })
                    } else {
                        d.boundThings.push({
                            type: "{}",
                            render: $.renderInterpolated,
                            parts: parts,
                            el: child
                        })
                    }
                }
            }
            return child.nextSibling
        }
        if (child.nodeType != 1 && child.nodeType != 11) { return child.nextSibling }
        var attrs = child.attributes
        if (attrs) {
            // TODO: is this slow, copying it because if you remove attr on NamedNodeMap, order is messed up
            var attrs2 = []
            for (var i = 0; i < attrs.length; i++) {
                attrs2.push(attrs[i])
            }
            attrs = attrs2
            var childrenDone = false
            // put stuff in the right order, (ie)
            var newAttrs = []
            var orderIndex = 0;
            for (var i = 0; i < attrs.length; i++) {
                if (attrs[i].name == "@attr.class" || attrs[i].name == "@b" || attrs[i].name == "@switch" || attrs[i].name == "@if" || attrs[i].name == "@else" || attrs[i].name == "@elseif") {
                    newAttrs.splice(orderIndex, 0, attrs[i])
                } else if (attrs[i].name == "@repeat" || attrs[i].name == "@use" || attrs[i].name == "@usevar") {
                    newAttrs.unshift(attrs[i])
                    orderIndex++;
                } else {
                    newAttrs.push(attrs[i])
                }
            }
            attrs = newAttrs
            attrLoop:
                for (var i = 0; i < attrs.length; i++) {
                    var attr = attrs[i]
                    if (attr.name.substr(0, 1) == "@" || attr.name.substr(0, 3) == "dr-") {
                        if (!addedGeneral) {
                            $.addBookkeepingBoundThing(child, d)
                            addedGeneral = true
                        }
                        var attrName = attr.name
                        if (attrName.charAt(0) == "d") {
                            attrName = "@" + attrName.slice(3)
                        }

                        var compileAction = $.compileActions[attrName]
                        if (compileAction) {
                            var ret = compileAction(d, child, attr, attrName, parentT)
                            if (ret == $._children_done) {
                                childrenDone = true
                            } else if (ret == $._break) { // for @repeat
                                return child.nextSibling
                            } else if (ret) {
                                return ret
                            }
                        } else {
                            var parts = attrName.split(".") // style, class, attr, hasattr
                            var parts0 = parts[0]
                            var parts1 = parts[1]

                            // is this if slower than a hash?
                            if (parts0 == "@on") {
                                child.addEventListener(parts1, $.makeOnFunc(child, attr.value, d, parentT))
                            } else {
                                if (parts0 == "@style") { parts1 = $.camelCase(parts1) }
                                d.boundThings.push({
                                    type: parts0,
                                    render: $.renderSub[parts0],
                                    exprFn: $.compileExpr(attr.value, parentT.extras),
                                    what: parts1,
                                    el: child
                                })
                            }
                        }
                    } else {
                        if (attr.value.indexOf("{") != -1) { // if its interpolation syntax // is there a faster first check 
                            var parts = $.parseInterpolated(attr.value, d, parentT)
                            if (parts.length) {
                                if (!addedGeneral) { // duplicated
                                    $.addBookkeepingBoundThing(child, d)
                                    addedGeneral = true
                                }
                                var attrName = attr.name
                                if (attrName == "drstyle") { // for IE
                                    attrName = "style"
                                }
                                d.boundThings.push({
                                    type: "{}attr",
                                    render: $.renderInterpolatedAttr,
                                    parts: parts,
                                    el: child,
                                    attrName: attrName
                                })
                            }
                        }
                    }
                }
        }
        if (!childrenDone) {
            for (var c = child.firstChild; c != null; c = $.visit(c, d, parentT)) {}
        }
        return child.nextSibling
    }
    $._break = 0
    $._children_done = 2
    $.basicCompile = function(d, child, attr, attrName, parentT) {
        return $.compileCond(attrName, attr.value, child, d, parentT)
    }
    $.basicT = function(type, render, value, extras, el) {
        return {
            type: type,
            render: render, 
            exprFn: $.compileExpr(value, extras),
            el: el
        }
    }
    $.compileActions = {
        "@t": function(d, child, attr, attrName, parentT) { // text
            child.appendChild(document.createTextNode(""))
            d.boundThings.push($.basicT(attrName, $.renderText, attr.value, parentT.extras, child))
        },
        "@h": function(d, child, attr, attrName, parentT) { // innerhtml
            child.appendChild(document.createTextNode(""))
            d.boundThings.push($.basicT(attrName, $.renderHTML, attr.value, parentT.extras, child))
        },
        "@b": function(d, child, attr, attrName, parentT) { // 2-way binding for inptuts, checkboxes, radios, single-selects
            var boundThing = $.basicT("@b", $.renderInput, attr.value, parentT.extras, child)
            $.attachInput(d, child, attr.value, boundThing, parentT)
            for (var c = child.firstChild; c != null; c = $.visit(c, d, parentT)) {} // explicitly do children first (for select and options)
            // then push to bound things
            d.boundThings.push(boundThing)
            return $._children_done
        },
        "@repeat": function(d, child, attr, attrName, parentT) {
            var parts = attr.value.split(" in ")
            child.removeAttribute('@repeat')
            var itemsExpr = parts[1]

            var varParts = parts[0].split(",")
            var indexName = varParts[1]
            var valueName = varParts[0]

            var wrapper = child.getAttribute("@wrapper") !== null
            var frag = document.createDocumentFragment()
            if (wrapper) {
                var stopper = document.createComment("dr-stopping-point")
                child.parentNode.insertBefore(stopper, child.nextSibling)
                    // TODO: you could `while child.children`  instad of cloning here!
                if (child.content) { // <template> tag not available in ie (but yes edge)
                    frag = child.content
                } else {
                    for (var c = child.firstChild; c != null; c = c.nextSibling) {
                        frag.appendChild(c.cloneNode(true))
                    }
                }
            } else {
                var stopper = $.findEnd(frag, child)
            }
            var keyExpr = child.getAttribute("@key")
            var keyExprFn
            if (keyExpr) { keyExprFn = $.compileExpr(keyExpr, parentT.extras) }
            if (wrapper) { child.parentNode.removeChild(child) }
            var var1 = valueName || ("drempty" + $.uniqueId())
            var var2 = indexName || ("drempty" + $.uniqueId())
            if (parentT && parentT.extras) {
                var extras = parentT.extras.concat(var1, var2)
            } else {
                var extras = [var1, var2]
            }
            d.boundThings.push({
                type: "repeat",
                render: $.renderRepeat,
                exprFn: $.compileExpr(itemsExpr, parentT.extras),
                frag: frag,
                elss: [], // array array of elements
                compileds: [],
                indexName: indexName,
                valueName: valueName,
                stopper: stopper,
                curLen: 0,
                keyExprFn: keyExprFn,
                byKey: {},
                keys: [],
                indexStoppers: [],
                extras: extras
            })
            return stopper.nextSibling || $._break
        },
        "@use": function(d, child, attr, attrName, parentT) { // re use other html somewhere else with a specific id
            var frag = document.createDocumentFragment()
            var otherEl = document.getElementById(attr.value)
            if (otherEl.content) { // template here
                otherEl = otherEl.content 
            }
            if (!otherEl) { return }
            for (var c = otherEl.firstChild; c != null; c = c.nextSibling) {
                frag.appendChild(c.cloneNode(true))
            }
            var exprFn = $.compileExpr(child.getAttribute("@scope") || "this", parentT.extras)
            child.removeAttribute("@use")
            child.removeAttribute("@scope")

            var extras = (parentT.extras || []).slice()
            var extraDataInject = []
            $.tweakUseExtras(child, extras, extraDataInject)
            var t = {
                type: "use",
                render: $.renderUse,
                scopeExprFn: exprFn,
                extras: extras,
                //extraExprFns: [$.compileExpr("'startTime'", parentT.extras)] // was here
                extraDataInject: extraDataInject
            }
            var compiled = $.compile(frag, d, t)
            t.compiled = compiled

            // the extras are generated at compile time. Do we need one generated at runtime?
            d.boundThings.push(t)
            var next = child.nextSibling
            child.parentNode.insertBefore(frag, next)
            child.parentNode.removeChild(child)
            return next || $._children_done
        },
        "@usevar": function(d, child, attr, attrName, parentT) { // re use other html somewhere else with a variable id
            var stopper = document.createComment("dr-stopping-point")
            child.parentNode.insertBefore(stopper, child.nextSibling)

            var extras = (parentT.extras || []).slice()
            var extraDataInject = []
            $.tweakUseExtras(child, extras, extraDataInject)
            d.boundThings.push({
                type: "usevar",
                render: $.renderUseVar,
                scopeExprFn: $.compileExpr(child.getAttribute("@scope") || "this", parentT.extras),
                exprFn: $.compileExpr(attr.value, parentT.extras),
                lastId: null,
                lastLength: 0,
                stopper: stopper,
                extras: extras,
                extraDataInject: extraDataInject
            })
            child.parentNode.removeChild(child)
            return stopper.nextSibling || $._children_done
        },
        "@switch": function(d, child, attr, attrName, parentT) {
            child.removeAttribute('@switch')
            var nextSibling = $.compileCond("@case", child.getAttribute("@case"), child, d)
            d.lastBoundThing.render = $.renderCond["@switch"]
            d.lastBoundThing.switchExprFn = $.compileExpr(attr.value, parentT.extras)
            return nextSibling || $._break
        },
        "@if": $.basicCompile,
        "@elseif": $.basicCompile,
        "@else": $.basicCompile,
        "@case": $.basicCompile,
        "@default": $.basicCompile
    }
    $.tweakUseExtras = function (child, extras, extraDataInject) {
        // These are all static values for now, will I need dynamic ones?
        var extraAttr = child.getAttribute("@extra")
        if (extraAttr) {
            var ret = new Function('return ' + extraAttr)() // Could use json?
            for (var k in ret) {
                extras.push(k) 
            }
            extraDataInject.push(ret[k]) 
        }
    }
    $.camelCase = function(val) {
        var parts = val.split("-")
        var ret = [parts[0]]
        for (var i = 1; i < parts.length; i++) {
            ret.push(parts[i][0].toUpperCase() + parts[i].slice(1))
        }
        return ret.join("")
    }
    $.findEndEls = function(child) {
        var ch = child
        var forFrag = [child]
        if (child.getAttribute("@wrapstart") !== null) {
            var forFrag = []
            var startCount = 1
            while (ch = ch.nextSibling) {
                if (ch.nodeType != 1) {
                    forFrag.push(ch);
                    continue;
                }
                if (ch.getAttribute("@wrapstart") !== null) {
                    forFrag.push(ch);
                    startCount += 1
                }
                if (ch.getAttribute('@wrapend') !== null) {
                    startCount -= 1
                }
                if (startCount == 0) {
                    ch.parentNode.removeChild(ch);
                    break
                } else {
                    forFrag.push(ch)
                }
            }
            //child.parentNode.removeChild(child)	
        }
        return forFrag
    }
    $.findEnd = function(frag, child, stay) { // stay means keep elements around
        var forFrag = $.findEndEls(child)
        var ch = forFrag[forFrag.length - 1] //.nextSibling
        var stopper = document.createComment("dr-stopping-point")
        child.parentNode.insertBefore(stopper, ch.nextSibling)
        if (forFrag[0] !== child) { // it's a wrapper, TODO: refactor a bit
            child.parentNode.removeChild(child)
        }
        for (var j = 0; j < forFrag.length; j++) {
            frag.appendChild(forFrag[j])
        }
        return stopper
    }
    $.attachInput = function(d, child, expr, boundThing, parentT) {
        // TODO: @bset = 
        var assignExprFn = $.compileAssign(expr, parentT.extras)
        var inputOrChange = "input" // potentially need ie oninput polyfill
        if (child.type == "checkbox" || child.type == "radio" || child.type == "select-one") {
            inputOrChange = "change"
        }
        child.addEventListener(inputOrChange, function(e) {
            var value
            if (child.type == "checkbox") {
                value = child.checked
            } else {
                value = child.value // selectes should work this way too I think
            }
            // TODO: do you need extras here?, you could just say extra = [value]
            var extra = (child._extra || []).concat(value)
            $.callExprFn(assignExprFn, child._scope, extra)
            boundThing.oldVal = value
            d.root.render()
        })
    }
    $.compileCond = function(name, value, child, d, parentT) {
        var stay = child.getAttribute("@remove") === null
        var display = child.style.display
        child.removeAttribute(name)
        var wrapper = child.getAttribute("@wrapper") !== null
        if (stay) {
            if (wrapper) {
                var stopper = document.createComment("dr-stopping-point")
                child.parentNode.insertBefore(stopper, child.nextSibling)
                var els = []
                if (child.content) { // <template tag>
                    var loopNode = child.content.childNodes
                } else {
                    var loopNode = child.childNodes 
                }
                while (loopNode.length) {
                    els.push(child.firstChild)
                    stopper.parentNode.insertBefore(child.firstChild, stopper)
                }
                child.parentNode.removeChild(child)
            } else {
                var els = $.findEndEls(child)
            }
            var compiled = $.compileEls(els, d, parentT)
            var len = els.length
            var last = els[len - 1]
        } else {
            var frag = document.createDocumentFragment()
            if (wrapper) {
                var stopper = document.createComment("dr-stopping-point")
                while (child.children.length) {
                    frag.appendChild(child.firstChild)
                }
                child.parentNode.insertBefore(stopper, child.nextSibling)
                child.parentNode.removeChild(child)
            } else {
                var stopper = $.findEnd(frag, child)
            }
            var compiled = $.compile(frag, d) // you could lazily compile these I guess, then you could pass in t?
            var len = frag.childNodes.length
            var last = stopper
        }
        d.lastBoundThing = {
            type: name,
            render: $.renderCond[name],
            frag: frag,
            compiled: compiled,
            exprFn: $.compileExpr(value, parentT.extras), // not needed on @else and @default
            stopper: stopper,
            len: len,
            stay: stay,
            display: display,
            els: els,
        }
        if (stay) {
            $.hidePart(d.lastBoundThing)
        }
        d.boundThings.push(d.lastBoundThing)
        return last.nextSibling || $._break
    }
    return $
})({})
if (typeof module != "undefined") {
    module.exports = domrender3;
}
