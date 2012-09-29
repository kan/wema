var WemaStorage = {
    tagNumber: 0,
    tagDomain: 'net.fushihara.wema.tag',
    socket: {},

    generateTagHandler: function(tagInfo) { },

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
        var i = 0;
        while(true) {
            var tagStr = localStorage.getItem(WemaStorage.tagDomain + i);
            if (tagStr) {
                localStorage.removeItem(WemaStorage.tagDomain + i);
                i++;
            } else {
                break;
            }
        }
        WemaStorage.tagNumber = 0; // reset
    },

    loadAllTags: function() {
        /*
        WemaStorage.tagNumber = 0;

        while(true) {
            var tagStr = localStorage.getItem(WemaStorage.tagDomain + WemaStorage.tagNumber);                                                                 
            if (tagStr) {
                var tagInfo = JSON.parse(tagStr);
                tagInfo.tagId = WemaStorage.tagDomain + WemaStorage.tagNumber;
                WemaStorage.generateTagHandler(tagInfo);
                WemaStorage.tagNumber++;
            } else {
                break;
            }
        }
        */
    },
};

(function($) {
    WemaStorage.socket = new WebSocket('ws://localhost:8080/handle');
    WemaStorage.socket.onopen = function() { console.log('web socket open') }
    WemaStorage.socket.onmessage = function(ev) {
        var tagInfo = JSON.parse(ev.data);
        WemaStorage.generateTagHandler(tagInfo);
    }
}(Zepto || jQuery));
