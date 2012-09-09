/* wema v3.0 - https://github.com/kan/wema */
(function($){

    var TAGDIV = '<div style="position:absolute; padding: 5px; border: solid 1px #000"' +
                      'draggable="true" />';
    
    var TAGDOMAIN = 'net.fushihara.wema.tag';

    var tagNumber = 0;

    var tagDragHandler = function(e) {
        var rect = e.target.getBoundingClientRect();
        $(this).css('left', e.pageX)
               .css('top',  e.pageY - rect.height);
        if ($(this).data('tagId')) {
          var tagStr = JSON.stringify({ 'text': $(this).text(),
                                        'left': $(this).css('left'),
                                        'top' : $(this).css('top') });

          localStorage.setItem($(this).data('tagId'), tagStr);
        }
    };

    var inputTag = $(TAGDIV);

    var tagText = $('<textarea style="width: 20em; height: 4em"></textarea>');

    function saveTag() {
        var tagStr = JSON.stringify({ 'text': tagText.val(),
          'left': inputTag.css('left'),
          'top': inputTag.css('top') });

        localStorage.setItem(TAGDOMAIN+tagNumber, tagStr);
        tagNumber++;
    }

    var closeBtn = $('<input type="button" value="close" />')
      .bind('click', function(e) { tagText.val(''); inputTag.hide() });

    var clearBtn = $('<input type="button" value="clear all tags" />')
      .bind('click', function(e) {
        var i = 0;

        while(true) {
          var tagStr = localStorage.getItem(TAGDOMAIN + i);
          if (tagStr) {
            localStorage.removeItem(TAGDOMAIN + i);
            i++;
          } else {
            break;
          }
        }
        tagNumber = 0; // reset
        $('div.wema-tag').each(function(index) { $(this).remove() });
      });

    var postBtn = $('<input type="button" value="post" />')
      .bind('click', function(e) {
        var tag = $(TAGDIV).text(tagText.val())
                           .css('left', inputTag.css('left'))
                           .css('top',  inputTag.css('top'))
                           .data('tagId', TAGDOMAIN + tagNumber)
                           .addClass('wema-tag')
                           .bind('dragend', tagDragHandler);
        $('body').append(tag);
        saveTag();
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
              .show();
    });

    // load tags
    while(true) {
      var tagStr = localStorage.getItem(TAGDOMAIN + tagNumber);
      if (tagStr) {
        var tagInfo = JSON.parse(tagStr);
        var tag = $(TAGDIV).text(tagInfo.text)
                           .css('left', tagInfo.left)
                           .css('top',  tagInfo.top)
                           .data('tagId', TAGDOMAIN + tagNumber)
                           .addClass('wema-tag')
                           .bind('dragend', tagDragHandler);
        $('body').append(tag);
        tagNumber++;
      } else {
        break;
      }
    }

}(Zepto || jQuery));

