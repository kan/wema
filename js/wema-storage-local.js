var WemaStorage = {
    tagNumber: 0,
    tagDomain: 'net.fushihara.wema.tag',

    generateTagHandler: function(tagInfo) { },
    clearAllTagsHandler: function() { },

    saveTag: function(text, left, top) {
        var tagStr = JSON.stringify({'text': text,                                                            
            'tagId': WemaStorage.tagDomain+WemaStorage.tagNumber,
            'left': left,
            'top': top});

        localStorage.setItem(WemaStorage.tagDomain+WemaStorage.tagNumber, tagStr);
        WemaStorage.generateTagHandler(JSON.parse(tagStr));
        WemaStorage.tagNumber++;
    },

    updateTag: function(id, text, left, top) {
        var tagStr = JSON.stringify({'text': text,                                                            
            'left': left,
            'top': top});

        localStorage.setItem(id, tagStr);
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
        WemaStorage.clearAllTagsHandler();
    },

    loadAllTags: function() {
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
    },
};

