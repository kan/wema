/* wema v3.0 - https://github.com/kan/wema */
(function($){

    var TAGDIV = '<div style="position:absolute; padding: 5px; border: solid 1px gray"' +
                      'draggable="true" />';

    var TAGMENUDIV = '<div style="text-align: right;">';
    var MENULINK = '<a href="#" style="color: #66f; font-size: 0.8em;" />';

    var tagDragHandler = function(e) {
        var rect = e.target.getBoundingClientRect();
        $(this).css('left', e.pageX)
               .css('top',  e.pageY - rect.height);
        if ($(this).data('tagId')) {
            WemaStorage.updateTag($(this).data('tagId'), $(this).text(), $(this).css('left'), $(this).css('top'));
        }
    };

    function editTag(tagId) {
        $('div.wema-tag').each(function(index) {
            if ($(this).data('tagId') == tagId) {
                tagText.val($(this).data('tagText'));
                inputTag.css('left', $(this).css('left'))
                        .css('top', $(this).css('top'))
                        .data('tagId', tagId);
                inputTag.show();
            }
        });
    }

    WemaStorage.generateTagHandler = function(tagInfo) {
        $('div.wema-tag').each(function(index) {
            if ($(this).data('tagId') == tagInfo.tagId) {
                $(this).text(tagInfo.text)
                    .css('left', tagInfo.left)
                    .css('top',  tagInfo.top);
                return;
            }
        });
        var menu = $(TAGMENUDIV).append($(MENULINK).text('EDIT')
                                                   .bind('click', function() { editTag(tagInfo.tagId) }))
                                .append(' ')
                                .append($(MENULINK).text('DEL')
                                                   .bind('click', function() { WemaStorage.clearTag(tagInfo.tagId) }));

        var tag = $(TAGDIV)
                           .css('left', tagInfo.left)
                           .css('top',  tagInfo.top)
                           .data('tagId', tagInfo.tagId)
                           .data('tagText', tagInfo.text)
                           .addClass('wema-tag')
                           .bind('dragend', tagDragHandler)
                           .append(menu)
                           .append($('<div />').text(tagInfo.text));
        $('body').append(tag);
    };

    WemaStorage.clearTagHandler = function(id) {
        $('div.wema-tag').each(function(index) {
            if ($(this).data('tagId') == id) {
                $(this).remove();
            }
        });
    };

    WemaStorage.clearAllTagsHandler = function() {
        $('div.wema-tag').each(function(index) { $(this).remove() });
    }

    var inputTag = $(TAGDIV);

    var tagText = $('<textarea style="width: 20em; height: 4em"></textarea>');

    var closeBtn = $('<input type="button" value="close" />')
      .bind('click', function(e) { tagText.val(''); inputTag.hide() });

    var clearBtn = $('<input type="button" value="clear all tags" />')
      .bind('click', function(e) {
        WemaStorage.clearAllTags();
      });

    var postBtn = $('<input type="button" value="post" />')
      .bind('click', function(e) {
        if ( inputTag.data('tagId') ) {
            WemaStorage.updateTag(inputTag.data('tagId'), $(this).text(), $(this).css('left'), $(this).css('top'));
        } else {
            WemaStorage.saveTag(tagText.val(), inputTag.css('left'), inputTag.css('top'));
        }
        tagText.val('');
        inputTag.hide();
      });

    inputTag.bind('dragend', tagDragHandler)
            .append(tagText).append('<br />')
            .append(closeBtn)
            .append(clearBtn)
            .append(postBtn)
            .hide();

    $('body').append(inputTag)
             .bind('dblclick', function(e) {
      inputTag.css('left', e.pageX)
              .css('top',  e.pageY)
              .data('tagId', '')
              .show();
    });

    // load tags
    WemaStorage.loadAllTags();

}(Zepto || jQuery));

