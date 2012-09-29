var WemaStorage = {
    tagNumber: 0,
    tagDomain: 'net.fushihara.wema.tag',
    socket: {},

    generateTagHandler: function(tagInfo) { },
    clearAllTagsHandler: function() { },

    saveTag: function(text, left, top) {
        var tagStr = JSON.stringify({'text': text,                                                            
            'left': left,
            'top': top});

        WemaStorage.socket.send(tagStr);
    },

    updateTag: function(id, text, left, top) {
        var tagStr = JSON.stringify({'text': text,                                                            
            'tagId': id,
            'left': left,
            'top': top});

        WemaStorage.socket.send(tagStr);
    },

    clearAllTags: function() {
        (function($) {
            $.post('/clear_all_tags', function(data) { });
        }(Zepto || jQuery));
    },

    loadAllTags: function() {
        (function($) {
            $.get('/list', function(data) {
                $.each(JSON.parse(data), function(index, item) {
                    WemaStorage.generateTagHandler(item);
                });
            });
        }(Zepto || jQuery));
    },
};

(function($) {
    WemaStorage.socket = new WebSocket('ws://localhost:8080/handle');
    WemaStorage.socket.onopen = function() { console.log('web socket open') }
    WemaStorage.socket.onmessage = function(ev) {
        var tagInfo = JSON.parse(ev.data);
        if (tagInfo.action) {
            if (tagInfo.action == 'clear_all_tags') {
                WemaStorage.clearAllTagsHandler();
            }
        } else {
            WemaStorage.generateTagHandler(tagInfo);
        }
    }
}(Zepto || jQuery));
