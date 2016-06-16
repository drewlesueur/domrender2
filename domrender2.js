// TODO: immutability (on top level scopes only (use/component)
// you can't have a repeat on an @if?
// built- in debounce?
// potentially: a version like vue where
// every expression is a computed property. only render the changes if
// underlying dependencies are dirty
// at one level computed belong outside this repo
// watch user
// - at high level with redux or something
// 	- but then what about ajax
// - at dom level?
// 	- but what about ids of things.
// DONE: <template> in addition (in stead) of @start and @end (done via @rapper)
// TODO: now that you have @wrapper, depracate and remove @start and @end (maybe consolidate findEnd with wrapper conditionals)
// TODO: potentially pointers so you don't have to reclone a @repeat frag over and over
// gotcha - @attr.class and then @class.smthing
// gotcha - @b and then @on.click

var domrender2 = (function($) {
    $.isTouch = 'ontouchstart' in window;
    (function() { //https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent
        if (typeof window.CustomEvent === "function") return false;

        function CustomEvent(event, params) {
            params = params || {
                bubbles: false,
                cancelable: false,
                detail: undefined
            };
            var evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
            return evt;
        }
        CustomEvent.prototype = window.Event.prototype;
        window.CustomEvent = CustomEvent;
    })();
    $.bind = function(el, scope, options) { // this is the starting point!
        options = options || {}
        var d = $.compile(el)
        if (options.noAsyncRender) {
            d.render = function(cb) {
                $.render(d, scope)
                if (d.onrender) {
                    d.onrender(d, scope)
                }
            }
        } else {

            d.render = function(cb) {
                clearTimeout(d.renderTimeout) // TODO: requestAnimationFrame?
                d.renderTimeout = setTimeout(function() {
                    $.render(d, scope)
                    if (d.onrender) {
                        d.onrender(d, scope)
                    }
                }, 1)
            }
        }!options.noFirstRender && $.render(d, scope)
        return d
    }
    $.makeOnFunc = function(child, expr, d) {
        var fn = $.compileExprExtra(expr) // extra has loop info
        return function(e) { // child._scope might be the same if we set that
            //window.event = e // firefox needs this
            var extra = child._extra
            if (extra) {
                extra.event = e
            } else {
                extra = {
                    event: e
                }
            }
            fn.call(child, child._scope, extra)
            d.root.render()
        }
    }
    $.compileGeneral = function(cache, args, code) {
        var exprFn = cache[code]
        if (exprFn) return exprFn
            //code = "try { " +code+"} catch (e) {debugger}"
        exprFn = new Function(args, code)
        cache[code] = exprFn
        return exprFn
    }
    $.compiledExprs = {}
    $.compileExpr = function(expr) {
        return $.compileGeneral($.compiledExprs, "scope", "with (scope) { return " + expr + "}")
    }
    $.compiledExprExtras = {}
    $.compileExprExtra = function(expr) {
        var code = "if (domrender_extra) {\n with (scope) {\n with (domrender_extra) { " + expr + " }\n }\n }\n" +
            "else with (scope) { " + expr + "}"
        return $.compileGeneral($.compiledExprExtras, "scope, domrender_extra", code)
    }
    $.compiledAssigns = {}
    $.compileAssign = function(expr) {
        var code = "if (domrender_extra) with (scope) { with (domrender_extra) { " + expr + "= value } }" +
            "else with (scope) { " + expr + "= value }"
        return $.compileGeneral($.compiledAssigns, "scope, domrender_extra, value", code)
    }
    $.renderWrap = function(type, fn) {
        return function(t, scope) {
            var newVal = t.exprFn(scope)
            if (t.oldVal === newVal) return;
            fn(t, scope, newVal)
            var e = new CustomEvent('drchange' + type, {
                cancelable: false,
                bubbles: false,
                detail: {
                    oldVal: t.oldVal,
                    newVal: newVal,
                    what: t.what
                }
            })

            // Do not dispatch events on disabled elements (causes problems in firefox see: https://bugzilla.mozilla.org/show_bug.cgi?id=889376)
            if (!t.el.disabled) {
                t.el.dispatchEvent(e)
            }
            t.oldVal = newVal
        }
    }
    $.renderBasic = {
        "@t": $.renderWrap("t", function(t, scope, newVal) {
            t.el.firstChild.nodeValue = newVal /*inner text*/
        }),
        "@h": $.renderWrap("h", function(t, scope, newVal) {
            t.el.innerHTML = newVal /*inner html*/
        }),
        "@style": $.renderWrap("style", function(t, scope, newVal) {
            t.el.style[t.what] = newVal
        }),
        "@class": $.renderWrap("class", function(t, scope, newVal) {
            newVal ? t.el.classList.add(t.what) : t.el.classList.remove(t.what)
        }),
        "@attr": $.renderWrap("attr", function(t, scope, newVal) {
            t.el.setAttribute(t.what, newVal)
        }),
        "@hasattr": $.renderWrap("hasattr", function(t, scope, newVal) {
            newVal ? t.el.setAttribute(t.what, newVal) : t.el.removeAttribute(t.what)
        })
    }

    $.renderInputArray = function(t, scope, newVal) { // TODO: other types of inputs
        // TODO: this is not implementted yet (should it be?)
        // TODO: you could have a hash of this and loop it once
        // like a mapping of this value to the elements that use it
        var newVal = t.exprFn(scope)
        t.el.checked = false
        for (var i = 0; i < newVal.length; i++) {
            if (t.el.value == newVal[i]) {
                t.el.checked = true
                break
            }
        }
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
    $.renderExec = function(t, scope, newVal) { // for debugging
        t.exprFn(scope)
    }
    $.renderDebugger = function(t, scope, newVal) {
        if (!t.expr) {
            debugger
            return
        }

        if (t.exprFn(scope)) {
            debugger
        }
    }
    $.renderAccess = function(t, scope) {
        t.exprFn(scope, t.el)
    }
    $.renderUse = function(t, scope, extraData) {
        var scope = t.scopeExprFn(scope)
        $.render(t.compiled, scope, extraData)
    }
    $.renderCond = {
        "@if": function(t, scope, extraData, d) {
            t.done = false
            var newVal = t.exprFn(scope)
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
            var selector = t.switchExprFn ? t.switchExprFn(scope) : true
            t.done = false
            t.selector = selector
            d.lastSwitch = t
            $.renderCase(t, scope, extraData, d)
        },
        "@case": function(t, scope, extraData, d) {
            t.done = false
            if ($.checkIfDone(t, d.lastSwitch)) return;
            var selector = d.lastSwitch.selector
            var newVal = t.exprFn(scope)
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
        if (!lastIf) {
            return true
        }
        if (lastIf.done) {
            $.removeIfSection(t)
            return true
        }
        return false
    }
    $.renderUseVar = function(t, scope, extraData, d) {
        var usedScope = t.scopeExprFn(scope)
        var id = t.exprFn(scope)
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
            var compiled = $.compile(frag, d) // you could hang on to this
            t.compiled = compiled
            if (usedScope) {
                $.render(compiled, usedScope, extraData)
            }
            t.stopper.parentNode.insertBefore(frag, t.stopper)
            t.lastLength = count
        } else if (t.compiled) {
            if (usedScope) {
                $.render(t.compiled, usedScope, extraData)
            }
        }
    }
    $.renderGeneral = function(t, scope, extraData) {
        t.el._scope = scope
        if (extraData) t.el._extra = extraData
    }
    $.renderInterpolatedFast = function(t, scope, extraData) {
        var newVal = [t.exprFn(scope)].join("") // wrapping in array and joining on "" flushes out the "undefined"'s
        if (t.oldVal == newVal) {
            return
        }
        t.el.nodeValue = newVal
        t.oldVal = newVal
    }
    $.renderInterpolated = function(t, scope, extraData) {
        var final = []
        for (var i = 0; i < t.parts.length; i++) {
            var part = t.parts[i]
            part.type == "{" ? final.push(part.expr) : final.push(part.exprFn(scope))
        }
        var newVal = final.join("")
        if (t.oldVal == newVal) {
            return
        }
        t.el.nodeValue = newVal
        t.oldVal = newVal
    }
    $.renderInterpolatedAttr = function(t, scope, extraData) {
        var final = []
        for (var i = 0; i < t.parts.length; i++) {
            var part = t.parts[i]
            part.type == "{" ? final.push(part.expr) : final.push(part.exprFn(scope))
        }
        var newVal = final.join("")
        if (t.oldVal == newVal) {
            return
        }
        t.el.setAttribute(t.attrName, newVal)
        t.oldVal = newVal
    }
    $.renderRepeat = function(t, scope, extraData, parentD) {
        var newVal = t.exprFn(scope)
        if (!newVal) {
            newVal = []
        }
        //if (t.oldVal == newVal) { return } // because we aren't immutable (yet?)
        // TODO: consider pooling the elements and compileds so you can use them again
        var events = []

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
            } else {

            }
            var newByKey = {}
            t.elss = []
            t.compileds = []
            var newKeys = []

            var oldIndexNameVal = scope[t.indexName] //saving stuff
            var oldValueNameVal = scope[t.valueName]
            for (var i = 0; i < newVal.length; i++) {
                var val = newVal[i]
                var newExtraData = {} // TODO: consider alternatives to this extradata
                if (extraData) { // clone a new extraData
                    for (var k in extraData) {
                        newExtraData[k] = extraData[k]
                    }
                }
                newExtraData[t.indexName] = i
                newExtraData[t.valueName] = val
                scope[t.indexName] = i
                scope[t.valueName] = val


                var key = t.keyExprFn(scope)
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
                    var newFrag = t.frag.cloneNode(true)
                    var firstChild = newFrag.firstChild
                    var compiled = $.compile(newFrag, parentD)
                    t.compileds[i] = compiled
                    var els = []
                    t.elss[i] = els
                    var fragChildren = newFrag.childNodes
                    for (var j = 0; j < newFrag.childNodes.length; j++) {
                        t.elss[i].push(fragChildren[j])
                    }
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
                        // TODO: potentially trigger on all children, like you do with remove
                    var e = new CustomEvent('dradd', {
                        cancelable: false,
                        bubbles: false,
                        detail: {
                            index: i,
                            value: val,
                            list: newVal
                        }
                    })
                    events.push([firstChild, e])
                }
                $.render(t.compileds[i], scope, newExtraData)

            }

            // find the ones removed so we can emit te event
            // they are already removed
            for (var i = 0; i < t.keys.length; i++) {
                var oldKey = t.keys[i]
                var newCached = newByKey[oldKey]
                if (!newCached) {
                    var oldCached = t.byKey[oldKey]
                    for (j = 0; j < oldCached.els.length; j++) {
                        var el = oldCached.els[j]
                        if (el.parentNode) {
                            var e = new CustomEvent('drremove', {
                                cancelable: false,
                                bubbles: false,
                                detail: {
                                    index: i,
                                    list: newVal
                                }
                            })
                            events.push([el, e])
                            el.parentNode.removeChild(el)
                        }
                    }
                }
            }
            t.keys = newKeys
            t.byKey = newByKey

            scope[t.indexName] = oldIndexNameVal // restore
            scope[t.valueName] = oldValueNameVal
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
                        var e = new CustomEvent('drremove', {
                            cancelable: false,
                            bubbles: false,
                            detail: {
                                index: i,
                                list: newVal
                            }
                        })
                        events.push([el, e])
                        el.parentNode.removeChild(el)
                    }
                }
                t.compileds[i] = null
            }
            // add new
            for (var i = t.curLen; i < newVal.length; i++) { // add new ones
                var newFrag = t.frag.cloneNode(true)
                var firstChild = newFrag.firstChild
                var compiled = $.compile(newFrag, parentD)
                t.compileds[i] = compiled
                var els = []
                t.elss[i] = els
                var fragChildren = newFrag.childNodes
                for (var j = 0; j < newFrag.childNodes.length; j++) {
                    t.elss[i].push(fragChildren[j])
                }
                t.stopper.parentNode.insertBefore(newFrag, t.stopper)
                    // TODO: potentially trigger on all children, like you do with remove
                var e = new CustomEvent('dradd', {
                    cancelable: false,
                    bubbles: false,
                    detail: {
                        index: i,
                        value: newVal[i],
                        list: newVal
                    }
                })
                events.push([firstChild, e])
            }



            // render all
            var oldIndexNameVal = scope[t.indexName] //saving stuff
            var oldValueNameVal = scope[t.valueName]
            for (var i = 0; i < newVal.length; i++) { // render the lot
                var val = newVal[i]
                var newExtraData = {} // TODO: consider alternatives to this extradata
                if (extraData) { // clone a new extraData
                    for (var k in extraData) {
                        newExtraData[k] = extraData[k]
                    }
                }
                newExtraData[t.indexName] = i
                newExtraData[t.valueName] = val
                scope[t.indexName] = i
                scope[t.valueName] = val
                $.render(t.compileds[i], scope, newExtraData)
            }
            scope[t.indexName] = oldIndexNameVal // restore
            scope[t.valueName] = oldValueNameVal
            t.oldVal = newVal
            t.curLen = newVal.length


            // end
        }

        // publish events *after* it has been rendered
        for (var i = 0; i < events.length; i++) {
            var eventInfo = events[i]
            eventInfo[0].dispatchEvent(eventInfo[1])
        }
    }
    $.render = function(d, scope, extraData) { // parentScope?
        for (var i = 0; i < d.boundThings.length; i++) {
            var boundThing = d.boundThings[i]
            boundThing.render(boundThing, scope, extraData, d)
        }
    }
    $.compile = function(el, parentD) {
        var d = {
            boundThings: [],
            root: (parentD && parentD.root),
            lastIf: null,
            lastSwitch: null
        }
        if (!parentD) {
            d.root = d
        }
        $.visit(el, d)
        return d
    }
    $.compileEls = function(els, parentD) {
        var d = {
            boundThings: [],
            root: (parentD && parentD.root),
            lastIf: null,
            lastSwitch: null
        }
        if (!parentD) {
            d.root = d
        }
        for (var i = 0; i < els.length; i++) {
            $.visit(els[i], d)
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
    $.parseInterpolated = function(str) {
        var parts = [],
            look = "{",
            start = 0
        var lastStart = 0
        while (start < str.length) {
            start = str.indexOf(look, start)
            if (start == -1) {
                break
            }
            $.addInterpolatedPart(parts, str, lastStart, start, look)
            look = (look == "}") ? "{" : "}"
            lastStart = start + 1
        }
        $.addInterpolatedPart(parts, str, lastStart, str.length, look)
        return parts
    }
    $.addInterpolatedPart = function(parts, str, start, end, look) {
        var part = str.substring(start, end)
        if (part.length > 0) {
            var iPart = look == "{" ? {
                type: look,
                expr: part
            } : {
                type: look,
                expr: part,
                exprFn: $.compileExpr(part)
            }
            parts.push(iPart)
        }
    }
    $.visit = function(child, d) {
        var addedGeneral = false
        if (child.nodeType == 3) { // maybe have an overwride class for preventing this
            if (child.nodeValue.indexOf("{") != -1) { // if its interpolation syntax // is there a faster first check 
                var parts = $.parseInterpolated(child.nodeValue)
                if (parts.length) {
                    if (!addedGeneral) { // duplicated
                        $.addBookkeepingBoundThing(child, d)
                        addedGeneral = true
                    }
                    if (parts.length == 1) {
                        // unknown if I need this fast part
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
        if (child.nodeType != 1 && child.nodeType != 11) {
            return child.nextSibling
        }
        var attrs = child.attributes
        if (attrs) {
            // TODO: is this slow, copying it because if you remove attr on NamedNodeMap, order is messed up
            var attrs2 = []
            for (var i = 0; i < attrs.length; i++) {
                attrs2.push(attrs[i])
            }
            attrs = attrs2
            var childrenDone = false

            // @repeat first
            // @attr.class first
            // @b first

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
                    if (attr.name.substr(0, 1) == "@") {
                        if (!addedGeneral) {
                            $.addBookkeepingBoundThing(child, d)
                            addedGeneral = true
                        }
                        var attrName = attr.name
                        if (attrName.charAt(0) == "_") {
                            attrName = "@" + attrName.slice(1)
                        }
                        var compileAction = $.compileActions[attrName]
                        if (compileAction) {
                            var ret = compileAction(d, child, attr, attrName)
                            if (ret == $._children_done) {
                                childrenDone = true
                            } else if (ret == $._break) { // for @repeat
                                return child.nextSibling
                            } else if (ret) {
                                return ret
                            }
                        } else {
                            var parts = attrName.split(".")
                            var parts0 = parts[0]
                            var parts1 = parts[1]
                            var compileSubAction = $.compileSubActions[parts0]
                            if (compileSubAction) {
                                compileSubAction(parts0, parts1, d, child, attr, attrName)
                            }
                        }
                    } else {
                        //console.log("name: " + attr.name + "; value: " + attr.value)
                        //console.log(attr)
                        //if (attr.name == "style") {
                        //    console.log("ok the attr") 
                        //    console.log(child.getAttribute("style")) 

                        //    console.log("ok the prop") 
                        //    console.log(child.style) 
                        //}
                        if (attr.value.indexOf("{") != -1) { // if its interpolation syntax // is there a faster first check 
                            var parts = $.parseInterpolated(attr.value)
                            if (parts.length) {
                                if (!addedGeneral) { // duplicated
                                    $.addBookkeepingBoundThing(child, d)
                                    addedGeneral = true
                                }
                                var attrName = attr.name
                                if (attrName == "drstyle") {
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
            for (var c = child.firstChild; c != null; c = $.visit(c, d)) {}
        }
        return child.nextSibling
    }

    $._break = 0
    $._return = 1
    $._children_done = 2


    $.compileSubActions = {
        "@style": function(parts0, parts1, d, child, attr, attrName) {
            if (attrName == "@style") {
                parts1 = $.camelCase(parts1)
            }
            d.boundThings.push({
                type: "style",
                render: $.renderBasic[parts0],
                exprFn: $.compileExpr(attr.value),
                what: parts1,
                el: child
            })
        },
        "@class": function(parts0, parts1, d, child, attr, attrName) {
            d.boundThings.push({
                type: "class",
                render: $.renderBasic[parts0],
                exprFn: $.compileExpr(attr.value),
                what: parts1,
                el: child
            })
        },
        "@attr": function(parts0, parts1, d, child, attr, attrName) {
            d.boundThings.push({
                type: "attr",
                render: $.renderBasic[parts0],
                exprFn: $.compileExpr(attr.value),
                what: parts1,
                el: child
            })
        },
        "@hasattr": function(parts0, parts1, d, child, attr, attrName) {
            d.boundThings.push({
                type: "hasattr",
                render: $.renderBasic[parts0],
                exprFn: $.compileExpr(attr.value),
                what: parts1,
                el: child
            })
        },
        "@on": function(parts0, parts1, d, child, attr, attrName) {
            child.addEventListener(parts1, $.makeOnFunc(child, attr.value, d))
        }
    }
    $.compileActions = {
        "@t": function(d, child, attr, attrName) { // text
            child.appendChild(document.createTextNode(""))
            d.boundThings.push({
                type: attrName,
                render: $.renderBasic[attrName],
                exprFn: $.compileExpr(attr.value),
                el: child
            })
        },
        "@h": function(d, child, attr, attrName) { // innerhtml
            child.appendChild(document.createTextNode(""))
            d.boundThings.push({
                type: attrName,
                render: $.renderBasic[attrName],
                exprFn: $.compileExpr(attr.value),
                el: child
            })
        },
        "@b": function(d, child, attr, attrName) { // 2-way binding for inptuts, checkboxes, radios, single-selects
            var boundThing = {
                type: "@b",
                render: $.renderInput,
                exprFn: $.compileExpr(attr.value),
                el: child
            }
            $.attachInput(d, child, attr.value, boundThing)
                // explicitly do children first (for select and options)
            for (var c = child.firstChild; c != null; c = $.visit(c, d)) {}
            // then push to bound things
            d.boundThings.push(boundThing)
            return $._children_done
        },
        "@exec": function(d, child, attr, attrName) {
            d.boundThings.push({
                type: "@exec",
                render: $.renderExec,
                el: child,
                expr: attr.value,
                exprFn: $.compileExpr(attr.value)
            })
        },
        "@debugger": function(d, child, attr, attrName) {
            d.boundThings.push({
                type: "@debugger",
                render: $.renderDebugger,
                el: child,
                expr: attr.value,
                exprFn: $.compileExpr(attr.value)
            })
        },
        //case "@compiledebugger":
        //debugger 
        //break
        "@repeat": function(d, child, attr, attrName) {
            var parts = attr.value.split(" ")
            child.removeAttribute('@repeat')
            var indexName = parts[2]
            var valueName = parts[1]
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
            if (keyExpr) {
                keyExprFn = $.compileExpr(keyExpr)
            }

            if (wrapper) {
                child.parentNode.removeChild(child)
            }

            d.boundThings.push({
                type: "repeat",
                render: $.renderRepeat,
                exprFn: $.compileExpr(parts[0]),
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
            })
            return stopper.nextSibling || $._break
        },
        "@access": function(d, child, attr, attrName) { // make the scope aware of this element 
            var fn = new Function("scope, _the_el", "with (scope) {" + attr.value + " = _the_el }")
            d.boundThings.push({
                render: $.renderAccess,
                exprFn: fn,
                el: child
            })
        },
        "@use": function(d, child, attr, attrName) { // re use other html somewhere else with a specific id
            var frag = document.createDocumentFragment()
            var otherEl = document.getElementById(attr.value)
            if (!otherEl) {
                return
            }
            for (var c = otherEl.firstChild; c != null; c = c.nextSibling) {
                frag.appendChild(c.cloneNode(true))
            }
            var exprFn = $.compileExpr(child.getAttribute("@scope") || "scope")
            child.removeAttribute("@use")
            child.removeAttribute("@scope")
                // steal attributes -- is stealing attributes the right way to do it.
                // TODO: steal the attributes for the @usevar too
                // this outer for loop is a hack for firstElementChild on fragments in ie
            for (var c = frag.firstChild; c != null; c = c.nextSibling) {
                if (c.nodeType === 1) { // element node
                    for (var j = 0; j < child.attributes.length; j++) {
                        c.setAttributeNode(child.attributes[j].cloneNode())
                    }
                }
            }
            //if (frag.firstElementChild) {
            //	for (var j=0; j<child.attributes.length; j++) {
            //		frag.firstElementChild.setAttributeNode(child.attributes[j].cloneNode())
            //	}
            //}
            var compiled = $.compile(frag, d) // TODO: @keep for extra data or smthng?
            d.boundThings.push({
                type: "use",
                render: $.renderUse,
                compiled: compiled,
                scopeExprFn: exprFn
            })
            var next = child.nextSibling
            child.parentNode.insertBefore(frag, next)
            child.parentNode.removeChild(child)
            return next || $._children_done
        },
        "@usevar": function(d, child, attr, attrName) { // re use other html somewhere else with a variable id
            var stopper = document.createComment("dr-stopping-point")
            child.parentNode.insertBefore(stopper, child.nextSibling)
            d.boundThings.push({
                type: "usevar",
                render: $.renderUseVar,
                scopeExprFn: $.compileExpr(child.getAttribute("@scope")),
                exprFn: $.compileExpr(attr.value),
                lastId: null,
                lastLength: 0,
                stopper: stopper
            })
            child.parentNode.removeChild(child)
            return stopper.nextSibling || $._children_done
        },
        "@switch": function(d, child, attr, attrName) {
            child.removeAttribute('@switch')
            var nextSibling = $.compileCond("@case", child.getAttribute("@case"), child, d)
            d.lastBoundThing.render = $.renderCond["@switch"]
            d.lastBoundThing.switchExprFn = $.compileExpr(attr.value)
            return nextSibling || $._children_done
        },
        "@if": function(d, child, attr, attrName) {
            return $.compileCond(attrName, attr.value, child, d)
        },
        "@elseif": function(d, child, attr, attrName) {
            return $.compileCond(attrName, attr.value, child, d)
        },
        "@else": function(d, child, attr, attrName) {
            return $.compileCond(attrName, attr.value, child, d)
        },
        "@case": function(d, child, attr, attrName) {
            return $.compileCond(attrName, attr.value, child, d)
        },
        "@default": function(d, child, attr, attrName) {
            return $.compileCond(attrName, attr.value, child, d)
        },
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
        if (child.getAttribute("@start") !== null) {
            var startCount = 1
            while (ch = ch.nextSibling) {
                forFrag.push(ch)
                if (ch.nodeType != 1) {
                    continue;
                }
                if (ch.getAttribute("@start") !== null) {
                    startCount += 1
                }
                if (ch.getAttribute('@end') !== null) {
                    startCount -= 1
                }
                if (startCount == 0) {
                    break
                }
            }
        }

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
    $.attachInput = function(d, child, expr, boundThing) {
        var fn = $.compileAssign(expr)
        var inputOrChange = "input"
        if (child.type == "checkbox" || child.type == "radio" || child.type == "select-one") {
            inputOrChange = "change"
        }
        child.addEventListener(inputOrChange, function(e) {
            var value
            if (child.type == "checkbox") {
                value = child.checked
            } else {
                value = child.value
                    // selectes should work this way too I think
            }
            var e = new CustomEvent('drchange' + 'b', {
                cancelable: false,
                bubbles: false,
                detail: {
                    oldVal: boundThing.oldVal,
                    newVal: value
                }
            })
            child.dispatchEvent(e)

            fn(child._scope, child._extra, value)
            boundThing.oldVal = value
            d.root.render()
        })
    }
    $.compileCond = function(name, value, child, d) {

        var stay = child.getAttribute("@remove") === null
        var display = child.style.display

        child.removeAttribute(name)

        var wrapper = child.getAttribute("@wrapper") !== null
        if (stay) {
            if (wrapper) {
                var stopper = document.createComment("dr-stopping-point")
                child.parentNode.insertBefore(stopper, child.nextSibling)
                var els = []
                if (child.content) { // template tag, TODO: refacor.

                    while (child.content.childNodes.length) {
                        els.push(child.firstChild)
                        stopper.parentNode.insertBefore(child.firstChild, stopper)
                    }

                } else {
                    while (child.childNodes.length) {
                        els.push(child.firstChild)
                        stopper.parentNode.insertBefore(child.firstChild, stopper)
                    }
                }
                child.parentNode.removeChild(child)

            } else {
                var els = $.findEndEls(child)
            }
            var compiled = $.compileEls(els, d)
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
            var compiled = $.compile(frag, d) // you could lazily compile these I guess
            var len = frag.childNodes.length
            var last = stopper
        }
        d.lastBoundThing = {
            type: name,
            render: $.renderCond[name],
            frag: frag,
            compiled: compiled,
            exprFn: $.compileExpr(value), // not needed on @else and @default
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
        return last.nextSibling || $._children_done
    }
    $.addHtml = function(parentEl, urls, finalCb) { // load external html like you would scripts
        var count = 0
        var errored = false
        var cb = function(err, response, xhr) {
            if (errored) {
                return
            }
            if (err) {
                finalCb(err)
                errored = true
                return
            }
            var div = document.createElement("div")
            div.innerHTML = response
            parentEl.appendChild(div)

            count += 1
            if (count == urls.length) {
                finalCb(null)
            }
        }
        for (var i = 0; i < urls.length; i++) {
            $.ajax('GET', urls[i], "", cb)
        }
    }
    $.ajax = function(method, url, data, cb) {
        var request = new XMLHttpRequest();
        request.open(method, url, true);
        request.onload = function() {
            var good = this.status >= 200 && this.status < 400
            good ? cb(null, this.response, this) : cb(new Error(this.status), this.response, this)
        };
        request.onerror = function(err) {
            cb(err, this.response, this)
        };
        request.send(data);
    }
    return $
})({})

if (typeof module != "undefined") {
    module.exports = domrender2;
}