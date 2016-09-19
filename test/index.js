const expect = chai.expect
const scope = {
    upperCaseName: function() {
        return "NAME"
    }
}
const app = domrender3.bind(document.getElementById("main"), scope)


mocha.setup('bdd')

describe("domrender3", () => {
    it("inerpolate a string", done => {
        let name = "test!"
        scope.name = name
        app.onrender = function() {
            let val = helpers.getText("#test_name")
            expect(val).to.equal(name)
            done()
        }
        app.render()
    })

    it("inerpolate and escape a string", done => {
        let name = "<b>test!<b>"
        scope.name = name
        app.onrender = function() {
            let val = helpers.getText("#test_name")
            expect(val).to.equal(name)
            done()
        }
        app.render()
    })

    it("inerpolate the return value of a function", done => {
        app.onrender = function() {
            let val = helpers.getText("#test_name_function")
            expect(val).to.equal("NAME")
            done()
        }
        app.render()
    })

    it("interpolate two strings", done => {
        scope.string1 = "First Name"
        scope.string2 = "Last Name"
        app.onrender = function() {
            let val = helpers.getText("#test_twostrings")
            expect(val).to.equal(scope.string1 + " - " + scope.string2)
            done()
        }
        app.render()
    })

    it("interpolate and escape html with @t", done => {
        let html = "<h1>Test!</h1>"
        let escaped = "&lt;h1&gt;Test!&lt;/h1&gt;"
        scope.unescaped_html = html
        app.onrender = function() {
            let val = helpers.getHtml("#test_escaped_html")
            expect(val).to.equal(escaped)
            done()
        }
        app.render()
    })

    it("interpolate html with @h", done => {
        let html = "<h1>Test!</h1>"
        scope.unescaped_html = html
        app.onrender = function() {
            let val = helpers.getHtml("#test_unescaped_html")
            expect(val).to.equal(html)
            done()
        }
        app.render()
    })

    it("add a class with @class", done => {
        let classes = helpers.getClass("#test_class")
        expect(classes).to.be.empty
        scope.class_test = true
        app.onrender = function() {
            let classes = helpers.getClass("#test_class")
            expect(classes).to.equal("test")
            done()
        }
        app.render()
    })

    it("add interpolated class", done => {
        let classes = helpers.getClass("#test_class_interpolated")
        expect(classes).to.be.empty
        scope.classInterpolated = "test"
        app.onrender = function() {
            let classes = helpers.getClass("#test_class_interpolated")
            console.log(classes)
            expect(classes).to.equal("test")
            done()
        }
        app.render()
    })

    it("add a style with @style", done => {
        let style = helpers.getStyle("#test_style", "backgroundColor")
        expect(style).to.not.equal("rgb(255, 0, 0)")
        scope.backgroundColor = "red"
        app.onrender = function() {
            let style = helpers.getStyle("#test_style", "backgroundColor")
            expect(style).to.equal("rgb(255, 0, 0)")
            done()
        }
        app.render()
    })

    it("add a style interpolated", done => {
        let style = helpers.getStyleAttr("#test_style_interpolated")
        expect(style).to.equal("background-color: ; color: blue")
        scope.backgroundColorInterpolated = "red"
        app.onrender = function() {
            let style = helpers.getStyleAttr("#test_style_interpolated")
            expect(style).to.equal("background-color: red; color: blue")
            done()
        }
        app.render()
    })

    it("add an attribute with @attr", done => {
        let attr = helpers.getAttr("#test_attribute", "data-test")
        expect(attr).to.be.empty
        scope.attrTest = true
        app.onrender = function() {
            let attrRendered = helpers.getAttr("#test_attribute", "data-test")
            expect(attrRendered).to.equal('true')
            done()
        }
        app.render()
    })

    it("add an attribute interpolated", done => {
        let attrBefore = helpers.getAttr("#test_attribute_interpolated", "data-test")
        expect(attrBefore).to.be.empty
        scope.attrTestInterpolated = true
        app.onrender = function() {
            let attr = helpers.getAttr("#test_attribute_interpolated", "data-test")
            expect(attr).to.equal('true')
            done()
        }
        app.render()
    })

    it("add checked attribute with @hasAttr", done => {
        let checkedBefore = helpers.isChecked("#test_hasattr_checked")
        expect(checkedBefore).to.be.false
        scope.hasAttrChecked = true
        app.onrender = function() {
            let checked = helpers.isChecked("#test_hasattr_checked")
            expect(checked).to.be.true
            done()
        }
        app.render()
    })

    it("add disabled attribute with @hasAttr", done => {
        let checkedBefore = helpers.isDisabled("#test_hasattr_disabled")
        expect(checkedBefore).to.be.false
        scope.hasAttrDisabled = true
        app.onrender = function() {
            let checked = helpers.isDisabled("#test_hasattr_disabled")
            expect(checked).to.be.true
            done()
        }
        app.render()
    })

    it("repeat an element", done => {
        let items = [
            {value: 1},
            {value: 2}
        ]
        let elementsBefore = $(".test_repeat").length
        expect(elementsBefore).to.equal(0)
        scope.repeatItems = items
        app.onrender = function() {
            let elements = $(".test_repeat").length
            expect(elements).to.equal(2)
            done()
        }
        app.render()
    })

    it("nested repeat an element", done => {
        let items = [{value: 1}, {value: 2}]
        let nestedItems = [
            {value: 1, items: items},
            {value: 2, items: items}
        ]
        let elementsBefore = $(".test_nested_repeat").length
        expect(elementsBefore).to.equal(0)
        scope.nestedRepeatItems = nestedItems
        app.onrender = function() {
            let elements = $(".test_nested_repeat").length
            expect(elements).to.equal(4)
            done()
        }
        app.render()
    })

    it("render with use", done => {
        app.onrender = function() {
            let elements = $("#use_template_parent > #use_h1").length
            expect(elements).to.equal(1)
            done()
        }
        app.render()
    })

    it("render with use with scope", done => {
        scope.useScope = {property: "Test"}
        app.onrender = function() {
            let elementText = $("#use_template_parent_scope > #use_h1").text()
            expect(elementText).to.equal("Test")
            done()
        }
        app.render()
    })

    it("render with use with extra", done => {
        scope.extra = "Test"
        app.onrender = function() {
            let elementText = $("#use_template_parent_extra > #use_h1").text()
            expect(elementText).to.equal("Test")
            done()
        }
        app.render()
    })

    it("render with usevar", done => {
        let elementsBefore = $("#usevar_template_parent > #use_h1").length
        expect(elementsBefore).to.equal(0)
        scope.usevarTemplateName = "use_template"
        app.onrender = function() {
            let elements = $("#usevar_template_parent > #use_h1").length
            expect(elements).to.equal(1)
            done()
        }
        app.render()
    })

    it("render with usevar with scope", done => {
        let elementsBefore = $("#usevar_template_parent_scope > #use_h1").length
        expect(elementsBefore).to.equal(0)
        scope.usevarScopeTemplateName = "use_template_scope"
        scope.useScope = {property: "Test"}
        app.onrender = function() {
            let elementText = $("#usevar_template_parent_scope > #use_h1").text()
            expect(elementText).to.equal("Test")
            done()
        }
        app.render()
    })


    // use/usevar with and without extra properties
    // if, else, switch, case, default
    // @wrapper (repeat)
    // @wrapstart
    // @wrapend
    // @wrapper with template
    // @remove in conditionals
    // @on
    // order of repeat and if
    // repeat with a key
})

mocha.run()

