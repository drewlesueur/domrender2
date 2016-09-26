const helpers = {
    getText: function(el) {
        return $(el).text()
    },
    getHtml: function(el) {
        return $(el).html()
    },
    getClass: function(el) {
        return $(el).attr("class")
    },
    getStyle: function(el, prop) {
        return $(el).css(prop)
    },
    getStyleAttr: function(el) {
        return $(el).attr("style")
    },
    getAttr: function(el, attr) {
        return $(el).attr(attr)
    },
    isChecked: function(el) {
        return $(el).is(":checked")
    },
    isDisabled: function(el) {
        return $(el).is(":disabled")
    }
}
