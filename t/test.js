var page = require('webpage').create();

// page.injectJs('js/zepto.js');
// page.injectJs('js/wema.js');
page.viewortSize = { width: 600, height: 600 };
page.paperSize = { width: 600, height: 600 };

page.onConsoleMessage = function (msg) { console.log('[page]'+msg); };
page.onError = function (msg, trace) {
    console.log(msg);
    trace.forEach(function(item) {
        console.log('  ', item.file, ':', item.line);
    })
};

page.open('example/test.html', function() {
    console.log(page.content + "\n\n");

    page.evaluate(function() {
        var evt = document.createEvent("MouseEvent");
        evt.initMouseEvent('dblclick', true, true, window, 0, 100, 150, 100, 150, 
                            true, false, false, false, 0, null);
        document.getElementsByTagName('body')[0].dispatchEvent(evt);
    });

    window.setTimeout(function() {
        page.evaluate(function() {
            var $=Zepto;
            $('textarea').val('test');
            var evt = document.createEvent("MouseEvent");
            evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, 
                                true, false, false, false, 0, null);
            $('div input[value="post"]').get(0).dispatchEvent(evt);
        });
        window.setTimeout(function() {
            console.log(page.content + "\n\n");
            page.render('test.pdf');
            phantom.exit();
        }, 1000);
    }, 1000);
});

